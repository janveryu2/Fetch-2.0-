import { describe, expect, it, vi, beforeEach } from "vitest";
import { safeNext, GET } from "@/app/auth/callback/route";
import { NextRequest } from "next/server";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock createClient from @/lib/supabase/server
const mockExchangeCodeForSession = vi.fn();
const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getUser: mockGetUser,
    },
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

describe("safeNext open redirect protection", () => {
  it("defaults to /app/home when null or undefined", () => {
    expect(safeNext(null)).toBe("/app/home");
    expect(safeNext("")).toBe("/app/home");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeNext("//evil.com")).toBe("/app/home");
    expect(safeNext("///evil.com")).toBe("/app/home");
    expect(safeNext("//app/home")).toBe("/app/home");
  });

  it("rejects backslash bypasses", () => {
    expect(safeNext("\\evil.com")).toBe("/app/home");
    expect(safeNext("/app\\home")).toBe("/app/home");
    expect(safeNext("/app/home\\evil.com")).toBe("/app/home");
  });

  it("rejects absolute URLs with protocols", () => {
    expect(safeNext("https://evil.com")).toBe("/app/home");
    expect(safeNext("http://evil.com")).toBe("/app/home");
    expect(safeNext("javascript:alert(1)")).toBe("/app/home");
    expect(safeNext("data:text/html,evil")).toBe("/app/home");
  });

  it("rejects path traversal attacks attempting to escape allowed destinations", () => {
    expect(safeNext("/app/../evil")).toBe("/app/home");
    expect(safeNext("/app/%2e%2e/evil")).toBe("/app/home");
    expect(safeNext("/app/..")).toBe("/app/home");
    expect(safeNext("/app/study-packs/../../admin")).toBe("/app/home");
  });

  it("rejects paths outside allowed app destinations", () => {
    expect(safeNext("/random-admin")).toBe("/app/home");
    expect(safeNext("/api/something")).toBe("/app/home");
  });

  it("allows valid app destinations", () => {
    expect(safeNext("/app/home")).toBe("/app/home");
    expect(safeNext("/app/settings")).toBe("/app/settings");
    expect(safeNext("/app/reset-password")).toBe("/app/reset-password");
    expect(safeNext("/app/study-packs")).toBe("/app/study-packs");
    expect(safeNext("/app/calendar")).toBe("/app/calendar");
  });

  it("preserves safe subpaths and query strings on allowed destinations", () => {
    expect(safeNext("/app/study-packs/123-abc")).toBe("/app/study-packs/123-abc");
    expect(safeNext("/app/settings?tab=appearance")).toBe("/app/settings?tab=appearance");
  });
});

describe("GET /auth/callback handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects with error parameter if provider returns error (e.g. cancelled)", async () => {
    const request = new NextRequest("http://localhost:3000/auth/callback?error=access_denied");
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/app?auth=access_denied");
  });

  it("redirects with confirmation-failed if code is missing", async () => {
    const request = new NextRequest("http://localhost:3000/auth/callback");
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/app?auth=confirmation-failed");
  });

  it("redirects with confirmation-failed if code exchange fails", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({
      error: new Error("Invalid or expired code"),
    });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=bad-code");
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/app?auth=confirmation-failed");
  });

  it("redirects to reset-password when type=recovery", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-1",
          email: "user@example.com",
          user_metadata: {},
        },
      },
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "u-1", username: "alex", display_name: "Alex" },
          }),
        }),
      }),
    });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=valid-code&type=recovery");
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/app/reset-password");
  });

  it("redirects to destination and flags setup-username if user has no username", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-2",
          email: "googleuser@gmail.com",
          user_metadata: { full_name: "Google User" },
        },
      },
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "u-2", username: null, display_name: "Google User" },
          }),
        }),
      }),
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=valid-code&next=/app/home"
    );
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/app/home?auth=setup-username");
  });

  it("flags username-taken if user had requested a username in metadata but username ended up null", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-taken",
          email: "takenuser@example.com",
          user_metadata: { username: "taken_username" },
        },
      },
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "u-taken", username: null, display_name: "Taken User" },
          }),
        }),
      }),
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=valid-code&next=/app/home"
    );
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/app/home?auth=username-taken");
  });

  it("preserves destination query parameters when setting auth prompt", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-query",
          email: "query@example.com",
          user_metadata: {},
        },
      },
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "u-query", username: null, display_name: "Query User" },
          }),
        }),
      }),
    });

    const request = new NextRequest(
      "http://localhost:3000/auth/callback?code=valid-code&next=/app/settings?tab=appearance"
    );
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/app/settings?tab=appearance&auth=setup-username");
  });

  it("repairs missing profile via ensure_profile RPC", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-repair",
          email: "repair@example.com",
          user_metadata: {},
        },
      },
    });

    // Profile select returns null initially
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: null,
          }),
        }),
      }),
    });

    // RPC repair succeeds
    mockRpc.mockResolvedValueOnce({
      data: {
        id: "u-repair",
        display_name: "Repaired User",
        username: "repaired_user",
      },
      error: null,
    });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=valid-code");
    const response = await GET(request);
    expect(response.status).toBe(307);
    expect(mockRpc).toHaveBeenCalledWith("ensure_profile");
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/app/home");
  });

  it("successfully redirects existing user with username to /app/home", async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
    mockGetUser.mockResolvedValueOnce({
      data: {
        user: {
          id: "u-3",
          email: "existing@example.com",
        },
      },
    });

    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: "u-3", username: "existing_user", display_name: "Existing" },
          }),
        }),
      }),
    });

    const request = new NextRequest("http://localhost:3000/auth/callback?code=valid-code");
    const response = await GET(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost:3000/app/home");
  });
});
