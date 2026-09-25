import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const mockGetAuth = vi.fn();
const mockPersist = vi.fn();
const mockReserve = vi.fn();
const mockCommit = vi.fn();
const mockRelease = vi.fn();
const mockReconstruct = vi.fn().mockResolvedValue({
  data: {
    packId: "pack-111",
    title: "Valid Title",
    questions: [{ id: "q1", prompt: "Cached Q" }],
  },
  error: null,
});

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

import { fixtureQuestions, requestSchema, POST } from "./route";

const source =
  "Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light most strongly in the blue and red parts of the visible spectrum. Carbon dioxide and water are used to produce glucose and oxygen.";

describe("StudyPack generation boundary & quota idempotency", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockGetAuth.mockReset();
    mockPersist.mockReset();
    mockReserve.mockReset();
    mockCommit.mockReset();
    mockRelease.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("rejects study material that is too short", () => {
    expect(
      requestSchema.safeParse({ title: "Biology", source: "Too short", count: 5 })
        .success
    ).toBe(false);
  });

  it("creates deterministic, source-grounded development questions", () => {
    const questions = fixtureQuestions(source, 3);
    expect(questions).toHaveLength(3);
    expect(
      questions.every((question) =>
        question.explanation.startsWith("The source sentence states:")
      )
    ).toBe(true);
    expect(questions.every((question) => question.answer.length > 0)).toBe(true);
  });

  it("returns 400 INVALID_REQUEST for malformed body", async () => {
    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "A", source: "Too short" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_REQUEST");
  });

  it("returns fixture questions with warning for unauthenticated request without AI reservation", async () => {
    mockGetAuth.mockResolvedValue(null);
    delete process.env.FETCH_ENABLE_DEV_FIXTURE;
    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Valid Title", source, count: 3 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provider).toBe("development-fixture");
    expect(body.warning).toContain("deterministic development fixtures");
    expect(body.questions).toHaveLength(3);
    expect(mockReserve).not.toHaveBeenCalled();
  });

  it("returns 429 QUOTA_EXCEEDED when monthly allowance of 15 packs is reached", async () => {
    mockGetAuth.mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
      supabase: {},
    });
    mockReserve.mockResolvedValue({
      data: null,
      error: new Error("Monthly AI StudyPack allowance reached (15/month)"),
      code: "42901",
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid Title",
        source,
        count: 3,
        requestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
  });

  it("returns 409 REQUEST_CONFLICT on payload hash mismatch with same request ID", async () => {
    mockGetAuth.mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
      supabase: {},
    });
    mockReserve.mockResolvedValue({
      data: null,
      error: new Error("Request ID conflict: payload does not match"),
      code: "23505",
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid Title",
        source,
        count: 3,
        requestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("REQUEST_CONFLICT");
  });

  it("returns idempotent result for already-committed request ID", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "pack-111",
        questions: [{ id: "q1", prompt: "Cached Q", answer: "A", choices: ["A", "B", "C", "D"], explanation: "Exp" }],
      },
    });
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });

    mockGetAuth.mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
      supabase: { from: mockFrom },
    });
    mockReserve.mockResolvedValue({
      data: {
        status: "committed",
        packId: "pack-111",
        requestId: "11111111-1111-4111-8111-111111111111",
      },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid Title",
        source,
        count: 3,
        requestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packId).toBe("pack-111");
    expect(body.questions).toHaveLength(1);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("reserves quota, persists pack, and commits quota for successful generation", async () => {
    mockGetAuth.mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
      supabase: {},
    });
    process.env.FETCH_ENABLE_DEV_FIXTURE = "true";

    mockReserve.mockResolvedValue({
      data: {
        status: "reserved",
        fencingToken: 1,
        monthKey: "2026-09",
        allowance: 15,
        remaining: 14,
      },
      error: null,
    });

    mockPersist.mockResolvedValue({
      data: { id: "pack-999", questions: [{ id: "q-1", prompt: "test" }] },
      error: null,
    });

    mockCommit.mockResolvedValue({
      data: { status: "committed", packId: "pack-999" },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid Title",
        source,
        count: 3,
        requestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packId).toBe("pack-999");

    expect(mockReserve).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-123",
        requestId: "11111111-1111-4111-8111-111111111111",
      })
    );
    expect(mockPersist).toHaveBeenCalled();
    expect(mockCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-123",
        requestId: "11111111-1111-4111-8111-111111111111",
        fencingToken: 1,
        packId: "pack-999",
      })
    );
  });

  it("releases reservation if persistence fails", async () => {
    mockGetAuth.mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
      supabase: {},
    });
    process.env.FETCH_ENABLE_DEV_FIXTURE = "true";

    mockReserve.mockResolvedValue({
      data: {
        status: "reserved",
        fencingToken: 42,
        monthKey: "2026-09",
        allowance: 15,
        remaining: 14,
      },
      error: null,
    });

    mockPersist.mockResolvedValue({
      data: null,
      error: new Error("Database disk full"),
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Valid Title",
        source,
        count: 3,
        requestId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("STORAGE_UNAVAILABLE");

    expect(mockRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "user-123",
        requestId: "11111111-1111-4111-8111-111111111111",
        fencingToken: 42,
        failureClass: "persistence_failed",
      })
    );
  });
});
