import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PUT, DELETE } from "@/app/api/study-drafts/[packId]/route";

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

describe("Cloud Drafts API /api/study-drafts/[packId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPackId = "11111111-1111-4111-8111-111111111111";
  const validAttemptId = "22222222-2222-4222-8222-222222222222";
  const validQuestionId = "33333333-3333-4333-8333-333333333333";

  describe("GET /api/study-drafts/[packId]", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);

      const request = new Request("http://localhost/api/study-drafts/" + validPackId);
      const response = await GET(request, { params: Promise.resolve({ packId: validPackId }) });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.code).toBe("AUTH_REQUIRED");
    });

    it("returns 404 when pack not found or not owned", async () => {
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

      const request = new Request("http://localhost/api/study-drafts/" + validPackId);
      const response = await GET(request, { params: Promise.resolve({ packId: validPackId }) });

      expect(response.status).toBe(404);
    });

    it("returns 200 with draft: null when no draft exists", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "study_packs") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: validPackId, status: "ready", archived_at: null },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "study_session_drafts") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
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

      const request = new Request("http://localhost/api/study-drafts/" + validPackId);
      const response = await GET(request, { params: Promise.resolve({ packId: validPackId }) });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.draft).toBeNull();
    });

    it("returns 200 with valid draft data", async () => {
      const mockDraft = {
        id: "draft-1",
        pack_id: validPackId,
        client_attempt_id: validAttemptId,
        current_position: 1,
        current_answer: "Mitosis",
        checked: true,
        feedback: { correct: true, explanation: "Cell division." },
        answers: [{ questionId: validQuestionId, answer: "Mitosis", correct: true }],
        pack_fingerprint: "fingerprint-123",
        revision: 2,
        updated_at: "2026-09-25T12:00:00Z",
        expires_at: new Date(Date.now() + 100000).toISOString(),
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "study_packs") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: validPackId, status: "ready", archived_at: null },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "study_session_drafts") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: mockDraft, error: null }),
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

      const request = new Request("http://localhost/api/study-drafts/" + validPackId);
      const response = await GET(request, { params: Promise.resolve({ packId: validPackId }) });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.draft).toBeDefined();
      expect(json.draft.currentIndex).toBe(1);
      expect(json.draft.currentAnswer).toBe("Mitosis");
      expect(json.draft.revision).toBe(2);
    });
  });

  describe("PUT /api/study-drafts/[packId]", () => {
    it("returns 409 DRAFT_CONFLICT when expectedRevision does not match", async () => {
      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "study_packs") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: validPackId, status: "ready", archived_at: null },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "study_session_drafts") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { revision: 3, expires_at: new Date(Date.now() + 100000).toISOString() },
                      error: null,
                    }),
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

      const request = new Request("http://localhost/api/study-drafts/" + validPackId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientAttemptId: validAttemptId,
          revision: 2,
          expectedRevision: 1, // Mismatched: expected 1, but cloud has 3
          currentIndex: 0,
          currentAnswer: "Test",
          checked: false,
          submittedAnswers: [],
          packFingerprint: "fingerprint-123",
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ packId: validPackId }) });

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.code).toBe("DRAFT_CONFLICT");
      expect(json.cloudRevision).toBe(3);
    });

    it("upserts draft and returns 200 with next revision", async () => {
      const mockSaved = {
        id: "draft-1",
        pack_id: validPackId,
        client_attempt_id: validAttemptId,
        current_position: 1,
        current_answer: "Chloroplast",
        checked: false,
        feedback: null,
        answers: [],
        pack_fingerprint: "fingerprint-123",
        revision: 2,
        updated_at: "2026-09-25T12:05:00Z",
      };

      const mockSupabase = {
        from: vi.fn((table: string) => {
          if (table === "study_packs") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { id: validPackId, status: "ready", archived_at: null },
                      error: null,
                    }),
                  }),
                }),
              }),
            };
          }
          if (table === "study_session_drafts") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: { revision: 1, expires_at: new Date(Date.now() + 100000).toISOString() },
                      error: null,
                    }),
                  }),
                }),
              }),
              upsert: () => ({
                select: () => ({
                  single: async () => ({ data: mockSaved, error: null }),
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

      const request = new Request("http://localhost/api/study-drafts/" + validPackId, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientAttemptId: validAttemptId,
          revision: 2,
          expectedRevision: 1,
          currentIndex: 1,
          currentAnswer: "Chloroplast",
          checked: false,
          submittedAnswers: [],
          packFingerprint: "fingerprint-123",
        }),
      });

      const response = await PUT(request, { params: Promise.resolve({ packId: validPackId }) });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.draft.revision).toBe(2);
      expect(json.draft.currentAnswer).toBe("Chloroplast");
    });
  });

  describe("DELETE /api/study-drafts/[packId]", () => {
    it("deletes draft and returns 200", async () => {
      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          delete: mockDelete,
        }),
      };

      mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
        supabase: mockSupabase,
        userId: "user-1",
      });

      const request = new Request("http://localhost/api/study-drafts/" + validPackId, {
        method: "DELETE",
      });

      const response = await DELETE(request, { params: Promise.resolve({ packId: validPackId }) });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
    });
  });
});
