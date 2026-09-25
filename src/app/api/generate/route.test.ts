import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

const mockGetAuth = vi.fn();
const mockPersist = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
}));

vi.mock("@/lib/server/privileged-supabase", () => ({
  persistStudyPackServer: (args: unknown) => mockPersist(args),
}));

import { fixtureQuestions, requestSchema, POST } from "./route";

const source = "Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light most strongly in the blue and red parts of the visible spectrum. Carbon dioxide and water are used to produce glucose and oxygen.";

describe("StudyPack generation boundary", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockGetAuth.mockReset();
    mockPersist.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("rejects study material that is too short", () => {
    expect(requestSchema.safeParse({ title: "Biology", source: "Too short", count: 5 }).success).toBe(false);
  });

  it("creates deterministic, source-grounded development questions", () => {
    const questions = fixtureQuestions(source, 3);
    expect(questions).toHaveLength(3);
    expect(questions.every((question) => question.explanation.startsWith("The source sentence states:"))).toBe(true);
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

  it("returns fixture questions with warning for unauthenticated request to preserve demo mode without AI spend", async () => {
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
  });

  it("returns 503 PROVIDER_UNAVAILABLE for authenticated request in production without AI keys or dev fixtures", async () => {
    mockGetAuth.mockResolvedValue({ userId: "user-123", email: "user@example.com", supabase: {} });
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.FETCH_ENABLE_DEV_FIXTURE;

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Valid Title", source, count: 3 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("persists study pack for authenticated user when dev fixtures are enabled", async () => {
    mockGetAuth.mockResolvedValue({ userId: "user-123", email: "user@example.com", supabase: {} });
    process.env.FETCH_ENABLE_DEV_FIXTURE = "true";
    mockPersist.mockResolvedValue({
      data: { id: "pack-999", questions: [{ id: "q-1", prompt: "test" }] },
      error: null,
    });

    const req = new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Valid Title", source, count: 3 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.packId).toBe("pack-999");
    expect(mockPersist).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "user-123",
      title: "Valid Title",
    }));
  });
});
