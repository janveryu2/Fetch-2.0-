import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const mockGetAuth = vi.fn();
const mockPersist = vi.fn();
const mockReserve = vi.fn();
const mockCommit = vi.fn();
const mockRelease = vi.fn();
const mockReconstruct = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
}));

vi.mock("@/lib/server/privileged-supabase", () => ({
  persistStudyPackServer: (args: unknown) => mockPersist(args),
  reserveAiGenerationServer: (args: unknown) => mockReserve(args),
  commitAiGenerationServer: (args: unknown) => mockCommit(args),
  releaseAiGenerationServer: (args: unknown) => mockRelease(args),
  reconstructCommittedStudyPack: (args: unknown) => mockReconstruct(args),
}));

// Mock Gemini provider for automated tests to avoid consuming real quota
const mockGeminiGenerate = vi.fn();
vi.mock("@/lib/ai/gemini-study-pack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/gemini-study-pack")>();
  return {
    ...actual,
    GeminiStudyPackProvider: class {
      generate(input: unknown) {
        return mockGeminiGenerate(input);
      }
    },
  };
});

import { POST as handleTextGenerate } from "@/app/api/generate/route";
import { POST as handlePdfGenerate } from "@/app/api/pdf/generate/route";

const sampleSource =
  "Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light most strongly in the blue and red parts of the visible spectrum. Carbon dioxide and water are used to produce glucose and oxygen.";

describe("Server Generation & Quota Idempotency (Tests 9 - 16)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.GEMINI_API_KEY = "mock-gemini-key";
    delete process.env.FETCH_ENABLE_DEV_FIXTURE;

    mockGetAuth.mockReset();
    mockPersist.mockReset();
    mockReserve.mockReset();
    mockCommit.mockReset();
    mockRelease.mockReset();
    mockReconstruct.mockReset();
    mockGeminiGenerate.mockReset();

    mockGetAuth.mockResolvedValue({
      userId: "user-test-123",
      email: "student@fetch.study",
      supabase: {
        rpc: vi.fn().mockImplementation((name) => {
          if (name === "get_source_document") {
            return Promise.resolve({
              data: {
                id: "11111111-1111-4111-8111-111111111111",
                fileName: "sample.pdf",
                extractedText: sampleSource,
                pageCount: 2,
              },
              error: null,
            });
          }
          if (name === "update_source_document") {
            return Promise.resolve({ data: { status: "processed" }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      },
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("9. same requestId + same payload retry is idempotent", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";

    mockReserve.mockResolvedValue({
      data: {
        status: "committed",
        packId: "pack-committed-1",
        requestId,
      },
      error: null,
    });

    mockReconstruct.mockResolvedValue({
      data: {
        packId: "pack-committed-1",
        questions: [
          {
            id: "q-1",
            type: "multiple_choice",
            prompt: "What produces glucose?",
            choices: ["Photosynthesis", "Glycolysis", "Fermentation", "Mitosis"],
          },
        ],
      },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Photosynthesis",
        source: sampleSource,
        count: 3,
        requestId,
      }),
    });

    const res = await handleTextGenerate(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packId).toBe("pack-committed-1");
    expect(body.questions).toHaveLength(1);
    expect(mockPersist).not.toHaveBeenCalled();
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("10. same requestId + different payload remains protected with REQUEST_CONFLICT", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";

    mockReserve.mockResolvedValue({
      data: null,
      error: new Error("Request ID conflict: payload does not match"),
      code: "23505",
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Different Title",
        source: sampleSource,
        count: 5,
        requestId,
      }),
    });

    const res = await handleTextGenerate(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("REQUEST_CONFLICT");
    expect(body.error).toContain("A different generation request has already been submitted");
  });

  it("11. released reservation can safely retry same payload", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";

    // Backend reservation RPC allows retry of released request with same payload
    mockReserve.mockResolvedValue({
      data: {
        status: "reserved",
        fencingToken: 2,
        monthKey: "2026-09",
        allowance: 15,
        remaining: 14,
      },
      error: null,
    });

    mockGeminiGenerate.mockResolvedValue([
      {
        id: "q-1",
        type: "multiple_choice",
        prompt: "What absorbs light?",
        answer: "Chlorophyll",
        choices: ["Chlorophyll", "Water", "Oxygen", "Glucose"],
        explanation: "Chlorophyll absorbs blue and red light.",
        sourceQuote: "Chlorophyll absorbs light most strongly",
      },
      {
        id: "q-2",
        type: "fill_blank",
        prompt: "Light energy is converted into ____ energy.",
        answer: "chemical",
        explanation: "Chemical energy.",
        sourceQuote: "converts light energy into chemical energy",
      },
      {
        id: "q-3",
        type: "multiple_choice",
        prompt: "What is produced alongside glucose?",
        answer: "oxygen",
        choices: ["oxygen", "carbon", "nitrogen", "helium"],
        explanation: "Oxygen is produced.",
        sourceQuote: "produce glucose and oxygen.",
      },
    ]);

    mockPersist.mockResolvedValue({
      data: { id: "pack-retry-success", questions: [{ id: "q-1" }, { id: "q-2" }, { id: "q-3" }] },
      error: null,
    });

    mockCommit.mockResolvedValue({
      data: { status: "committed", packId: "pack-retry-success" },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Photosynthesis Notes",
        source: sampleSource,
        count: 3,
        requestId,
      }),
    });

    const res = await handleTextGenerate(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packId).toBe("pack-retry-success");
    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        fencingToken: 2,
        packId: "pack-retry-success",
      })
    );
  });

  it("12. provider failure releases quota", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";

    mockReserve.mockResolvedValue({
      data: {
        status: "reserved",
        fencingToken: 5,
        monthKey: "2026-09",
        allowance: 15,
        remaining: 14,
      },
      error: null,
    });

    mockGeminiGenerate.mockRejectedValue(new Error("Gemini upstream service unavailable (503)"));

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Photosynthesis",
        source: sampleSource,
        count: 3,
        requestId,
      }),
    });

    const res = await handleTextGenerate(req);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("GENERATION_FAILED");

    // Must release quota with proper fencing token
    expect(mockRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-test-123",
        requestId,
        fencingToken: 5,
      })
    );
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("13. successful generation commits exactly once", async () => {
    const requestId = "11111111-1111-4111-8111-111111111111";

    mockReserve.mockResolvedValue({
      data: {
        status: "reserved",
        fencingToken: 7,
        monthKey: "2026-09",
        allowance: 15,
        remaining: 14,
      },
      error: null,
    });

    mockGeminiGenerate.mockResolvedValue([
      {
        id: "q-1",
        type: "multiple_choice",
        prompt: "Where does it happen?",
        answer: "Chloroplasts",
        choices: ["Chloroplasts", "Mitochondria", "Nucleus", "Ribosomes"],
        explanation: "Explanation",
        sourceQuote: "converts light energy",
      },
    ]);

    mockPersist.mockResolvedValue({
      data: { id: "pack-once-1", questions: [{ id: "q-1" }] },
      error: null,
    });

    mockCommit.mockResolvedValue({
      data: { status: "committed", packId: "pack-once-1" },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Photosynthesis",
        source: sampleSource,
        count: 3,
        requestId,
      }),
    });

    const res = await handleTextGenerate(req);
    expect(res.status).toBe(200);
    expect(mockCommit).toHaveBeenCalledTimes(1);
    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-test-123",
        requestId,
        fencingToken: 7,
        packId: "pack-once-1",
      })
    );
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("14. committed retry returns existing questions correctly from questions table", async () => {
    const requestId = "33333333-3333-4333-8333-333333333333";
    const existingPackId = "pack-persisted-42";

    mockReserve.mockResolvedValue({
      data: {
        status: "committed",
        packId: existingPackId,
        requestId,
      },
      error: null,
    });

    mockReconstruct.mockResolvedValue({
      data: {
        packId: existingPackId,
        questions: [
          {
            id: "q-authoritative-1",
            type: "multiple_choice",
            prompt: "Authoritative question prompt?",
            choices: ["Option A", "Option B", "Option C", "Option D"],
            answer: "",
            explanation: "",
          },
          {
            id: "q-authoritative-2",
            type: "fill_blank",
            prompt: "Authoritative fill blank ____?",
            answer: "",
            explanation: "",
          },
        ],
      },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Photosynthesis",
        source: sampleSource,
        count: 3,
        requestId,
      }),
    });

    const res = await handleTextGenerate(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packId).toBe(existingPackId);
    expect(body.questions).toHaveLength(2);
    expect(body.questions[0].id).toBe("q-authoritative-1");
    expect(body.questions[1].id).toBe("q-authoritative-2");

    // Verifies reconstructCommittedStudyPack was invoked with correct parameters
    expect(mockReconstruct).toHaveBeenCalledWith(
      expect.objectContaining({
        packId: existingPackId,
        ownerId: "user-test-123",
      })
    );
  });

  it("15. text generation succeeds through Gemini fixture/mock provider", async () => {
    mockReserve.mockResolvedValue({
      data: {
        status: "reserved",
        fencingToken: 12,
        monthKey: "2026-09",
        allowance: 15,
        remaining: 14,
      },
      error: null,
    });

    mockGeminiGenerate.mockResolvedValue([
      {
        id: "q-mock-1",
        type: "multiple_choice",
        prompt: "Which color light is absorbed most strongly?",
        answer: "Blue and red",
        choices: ["Blue and red", "Green and yellow", "Infrared", "Ultraviolet"],
        explanation: "Chlorophyll absorbs blue and red.",
        sourceQuote: "blue and red parts of the visible spectrum",
      },
    ]);

    mockPersist.mockResolvedValue({
      data: { id: "pack-text-gemini", questions: [{ id: "q-mock-1" }] },
      error: null,
    });

    mockCommit.mockResolvedValue({
      data: { status: "committed", packId: "pack-text-gemini" },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Text Biology StudyPack",
        source: sampleSource,
        count: 3,
      }),
    });

    const res = await handleTextGenerate(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("gemini");
    expect(body.packId).toBe("pack-text-gemini");
    expect(body.questions).toHaveLength(1);
    expect(mockGeminiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Text Biology StudyPack",
        count: 3,
      })
    );
  });

  it("16. PDF generation succeeds through Gemini fixture/mock provider", async () => {
    mockReserve.mockResolvedValue({
      data: {
        status: "reserved",
        fencingToken: 15,
        monthKey: "2026-09",
        allowance: 15,
        remaining: 14,
      },
      error: null,
    });

    mockGeminiGenerate.mockResolvedValue([
      {
        id: "q-pdf-1",
        type: "fill_blank",
        prompt: "Photosynthesis converts light energy into ____ energy.",
        answer: "chemical",
        explanation: "Chemical energy.",
        sourceQuote: "converts light energy into chemical energy",
      },
    ]);

    mockPersist.mockResolvedValue({
      data: { id: "pack-pdf-gemini", questions: [{ id: "q-pdf-1" }] },
      error: null,
    });

    mockCommit.mockResolvedValue({
      data: { status: "committed", packId: "pack-pdf-gemini" },
      error: null,
    });

    const req = new Request("http://localhost/api/pdf/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        docId: "11111111-1111-4111-8111-111111111111",
        title: "PDF StudyPack",
        count: 4,
      }),
    });

    const res = await handlePdfGenerate(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("gemini");
    expect(body.packId).toBe("pack-pdf-gemini");
    expect(body.questions).toHaveLength(1);
    expect(mockGeminiGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "PDF StudyPack",
        count: 4,
      })
    );
  });
});
