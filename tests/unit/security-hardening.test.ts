import { describe, expect, it, vi, beforeEach } from "vitest";
import { sanitizeLogMetadata, extractRequestId, logger } from "@/lib/server/logger";
import {
  rateLimiter,
  checkRateLimit,
  getRateLimitHeaders,
  rateLimitedResponse,
} from "@/lib/server/rate-limiter";
import { GET as getWorkspace } from "@/app/api/workspace/route";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockGetAuthenticatedRequestContext = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuthenticatedRequestContext(),
  unauthorizedResponse: () =>
    new Response(JSON.stringify({ error: "Sign in to use account storage.", code: "AUTH_REQUIRED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

describe("Phase 13: Privacy-safe Structured Logging", () => {
  it("redacts sensitive fields from metadata", () => {
    const raw = {
      password: "super-secret-password",
      apiKey: "secret-token-12345",
      token: "jwt-token-val",
      authorization: "Bearer eyJhbGciOi...",
      cookie: "sb-auth-token=xyz",
      content: "This is private study notes text about biology.",
      normalField: "Biology 101",
      nested: {
        api_key: "nested-secret",
        studyPackId: "pack-123",
      },
    };

    const sanitized = sanitizeLogMetadata(raw) as Record<string, unknown>;

    expect(sanitized.password).toBe("[REDACTED]");
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.token).toBe("[REDACTED]");
    expect(sanitized.authorization).toBe("[REDACTED]");
    expect(sanitized.cookie).toBe("[REDACTED]");
    expect(sanitized.content).toBe("[CONTENT_LENGTH_47]");
    expect(sanitized.normalField).toBe("Biology 101");
    expect((sanitized.nested as Record<string, unknown>).api_key).toBe("[REDACTED]");
    expect((sanitized.nested as Record<string, unknown>).studyPackId).toBe("pack-123");
  });

  it("redacts raw Bearer strings and truncates long strings", () => {
    expect(sanitizeLogMetadata("Bearer confidential-token-xyz")).toBe("[REDACTED_BEARER]");

    const longString = "A".repeat(600);
    const result = sanitizeLogMetadata(longString);
    expect(typeof result).toBe("string");
    expect((result as string).includes("[TRUNCATED 600 chars]")).toBe(true);
  });

  it("extracts request ID from header or falls back to generated ID", () => {
    const reqWithHeader = new Request("http://localhost:3000/api/workspace", {
      headers: { "x-request-id": "trace-abc-123" },
    });
    expect(extractRequestId(reqWithHeader)).toBe("trace-abc-123");

    const reqWithoutHeader = new Request("http://localhost:3000/api/workspace");
    const generatedId = extractRequestId(reqWithoutHeader);
    expect(generatedId.startsWith("req_")).toBe(true);
  });
});

describe("Phase 13: Server-side Rate Limiting", () => {
  beforeEach(() => {
    rateLimiter.clear();
  });

  it("allows requests under the rate limit threshold", () => {
    const res1 = checkRateLimit("user-test-1", "friendRequest");
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(14); // max 15, remaining 14

    const res2 = checkRateLimit("user-test-1", "friendRequest");
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(13);
  });

  it("rejects requests exceeding the rate limit threshold", () => {
    // Generate has max 10 requests per 60s
    for (let i = 0; i < 10; i++) {
      const res = checkRateLimit("burst-user", "generate");
      expect(res.allowed).toBe(true);
    }

    const blocked = checkRateLimit("burst-user", "generate");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetSeconds).toBeGreaterThanOrEqual(1);
  });

  it("formats correct rate limit headers and 429 response", async () => {
    const rateLimitResult = {
      allowed: false,
      limit: 10,
      remaining: 0,
      resetSeconds: 45,
    };

    const headers = getRateLimitHeaders(rateLimitResult);
    expect(headers["X-RateLimit-Limit"]).toBe("10");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["X-RateLimit-Reset"]).toBe("45");

    const response = rateLimitedResponse(rateLimitResult, "req-123");
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("45");
    expect(response.headers.get("X-RateLimit-Limit")).toBe("10");

    const body = await response.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.requestId).toBe("req-123");
  });
});

describe("Phase 13: Workspace API Bounded Pagination & Observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies bounded pagination parameters to database queries", async () => {
    const mockRange = vi.fn().mockResolvedValue({
      data: [
        {
          id: "pack-1",
          title: "Physics",
          source_type: "text",
          source_label: "Notes",
          status: "ready",
          created_at: "2026-09-25T00:00:00Z",
        },
      ],
      error: null,
    });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "study_packs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: mockRange,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === "study_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "calendar_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "questions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-456",
    });

    const req = new NextRequest("http://localhost:3000/api/workspace?limit=25&offset=10", {
      headers: { "x-request-id": "workspace-test-id" },
    });

    const res = await getWorkspace(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Request-Id")).toBe("workspace-test-id");

    // Verify bounded range was called with offset 10 and limit 25 (range 10 to 34)
    expect(mockRange).toHaveBeenCalledWith(10, 34);

    const json = await res.json();
    expect(json.pagination).toEqual({
      limit: 25,
      offset: 10,
      count: 1,
    });
  });

  it("clamps excessive limit parameter to maximum 100", async () => {
    const mockRange = vi.fn().mockResolvedValue({ data: [], error: null });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "study_packs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    range: mockRange,
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-456",
    });

    const req = new NextRequest("http://localhost:3000/api/workspace?limit=5000&offset=0");
    const res = await getWorkspace(req);
    expect(res.status).toBe(200);

    // Limit is clamped to 100 (range 0 to 99)
    expect(mockRange).toHaveBeenCalledWith(0, 99);
    const json = await res.json();
    expect(json.pagination.limit).toBe(100);
  });
});
