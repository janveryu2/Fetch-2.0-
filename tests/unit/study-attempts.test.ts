import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/study-packs/[packId]/attempts/route";
import { GET } from "@/app/api/study-packs/[packId]/attempts/[attemptId]/route";

vi.mock("server-only", () => ({}));

const mockGetAuthenticatedRequestContext = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuthenticatedRequestContext(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: "Sign in required", code: "AUTH_REQUIRED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

describe("POST /api/study-packs/[packId]/attempts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPackId = "11111111-1111-4111-8111-111111111111";
  const validAttemptId = "22222222-2222-4222-8222-222222222222";
  const validQuestionId = "33333333-3333-4333-8333-333333333333";

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/study-packs/123/attempts", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ packId: validPackId }),
    });

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.code).toBe("AUTH_REQUIRED");
  });

  it("returns 404 when packId is invalid UUID", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/study-packs/invalid-id/attempts", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request, {
      params: Promise.resolve({ packId: "not-a-uuid" }),
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.code).toBe("NOT_FOUND");
  });

  it("returns 400 when clientAttemptId is missing", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/study-packs/" + validPackId + "/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        answers: [{ questionId: validQuestionId, answer: "Photosynthesis" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ packId: validPackId }),
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when answers array is empty", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/study-packs/" + validPackId + "/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientAttemptId: validAttemptId,
        answers: [],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ packId: validPackId }),
    });

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("INVALID_REQUEST");
  });

  it("submits attempt with request_hash and returns 201 on success", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        id: "session-1",
        packId: validPackId,
        score: 100,
        correct: 1,
        total: 1,
        completedAt: "2026-09-25T12:00:00Z",
      },
      error: null,
    });

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: { rpc: mockRpc },
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/study-packs/" + validPackId + "/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientAttemptId: validAttemptId,
        answers: [{ questionId: validQuestionId, answer: "Chlorophyll" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ packId: validPackId }),
    });

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.attempt.score).toBe(100);

    expect(mockRpc).toHaveBeenCalledWith("complete_study_attempt", expect.objectContaining({
      p_pack_id: validPackId,
      p_client_attempt_id: validAttemptId,
      p_request_hash: expect.any(String),
      p_answers: [{ question_id: validQuestionId, answer: "Chlorophyll" }],
    }));
  });

  it("returns 409 ATTEMPT_CONFLICT when attempt ID was reused with different payload", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "Attempt conflict: client attempt ID reused with different parameters" },
    });

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: { rpc: mockRpc },
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/study-packs/" + validPackId + "/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientAttemptId: validAttemptId,
        answers: [{ questionId: validQuestionId, answer: "Different Answer" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ packId: validPackId }),
    });

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.code).toBe("ATTEMPT_CONFLICT");
  });

  it("returns 404 NOT_FOUND when pack is archived or not found", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "42501", message: "StudyPack not found or archived" },
    });

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: { rpc: mockRpc },
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/study-packs/" + validPackId + "/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientAttemptId: validAttemptId,
        answers: [{ questionId: validQuestionId, answer: "Test" }],
      }),
    });

    const response = await POST(request, {
      params: Promise.resolve({ packId: validPackId }),
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.code).toBe("NOT_FOUND");
  });
});

describe("GET /api/study-packs/[packId]/attempts/[attemptId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPackId = "11111111-1111-4111-8111-111111111111";
  const validAttemptId = "22222222-2222-4222-8222-222222222222";

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);

    const request = new Request("http://localhost/api/test");
    const response = await GET(request, {
      params: Promise.resolve({ packId: validPackId, attemptId: validAttemptId }),
    });

    expect(response.status).toBe(401);
  });

  it("returns 404 when pack not owned by user", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/test");
    const response = await GET(request, {
      params: Promise.resolve({ packId: validPackId, attemptId: validAttemptId }),
    });

    expect(response.status).toBe(404);
  });

  it("returns 200 with attempt and per-answer records", async () => {
    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "study_packs") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: validPackId, title: "Biology 101" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "study_sessions") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: validAttemptId,
                        pack_id: validPackId,
                        score: 100,
                        correct_count: 1,
                        question_count: 1,
                        completed_at: "2026-09-25T12:00:00Z",
                        client_attempt_id: validAttemptId,
                      },
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "study_session_answers") {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      id: "ans-1",
                      question_id: "q-1",
                      submitted_answer: "Chlorophyll",
                      is_correct: true,
                      answered_at: "2026-09-25T12:00:00Z",
                      ordinal: 0,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        throw new Error("Unexpected table: " + table);
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-1",
    });

    const request = new Request("http://localhost/api/test");
    const response = await GET(request, {
      params: Promise.resolve({ packId: validPackId, attemptId: validAttemptId }),
    });

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.attempt.packTitle).toBe("Biology 101");
    expect(json.attempt.answers).toHaveLength(1);
    expect(json.attempt.answers[0].isCorrect).toBe(true);
    expect(json.attempt.answers[0].submittedAnswer).toBe("Chlorophyll");
  });
});
