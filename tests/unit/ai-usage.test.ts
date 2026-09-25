import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetAuth = vi.fn();
const mockGetUsage = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
}));

vi.mock("@/lib/server/privileged-supabase", () => ({
  getAiUsageServer: (args: unknown) => mockGetUsage(args),
}));

import { GET } from "@/app/api/ai-usage/route";

describe("GET /api/ai-usage", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
    mockGetUsage.mockReset();
  });

  it("returns 401 AUTH_REQUIRED when user is not signed in", async () => {
    mockGetAuth.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("returns 200 with usage stats when authenticated", async () => {
    mockGetAuth.mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
      supabase: {},
    });
    mockGetUsage.mockResolvedValue({
      data: {
        allowance: 15,
        used: 3,
        reserved: 0,
        remaining: 12,
        monthKey: "2026-09",
      },
      error: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      allowance: 15,
      used: 3,
      reserved: 0,
      remaining: 12,
      monthKey: "2026-09",
    });
  });

  it("returns 503 STORAGE_UNAVAILABLE when database error occurs", async () => {
    mockGetAuth.mockResolvedValue({
      userId: "user-123",
      email: "user@example.com",
      supabase: {},
    });
    mockGetUsage.mockResolvedValue({
      data: null,
      error: new Error("DB connection failure"),
    });

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("STORAGE_UNAVAILABLE");
  });
});
