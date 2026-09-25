import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET, PATCH } from "@/app/api/account/profile/route";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockGetAuthenticatedRequestContext = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuthenticatedRequestContext(),
  unauthorizedResponse: (msg = "Authentication required") =>
    new Response(JSON.stringify({ error: msg, code: "AUTH_REQUIRED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

describe("GET /api/account/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);

    const response = await GET();
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.code).toBe("AUTH_REQUIRED");
  });

  it("returns 200 with profile data for authenticated user", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "user-123",
                display_name: "Jane Student",
                username: "jane_study",
                avatar_url: "https://example.com/avatar.jpg",
                created_at: "2026-09-01T00:00:00Z",
                updated_at: "2026-09-02T00:00:00Z",
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "jane@example.com",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.profile.id).toBe("user-123");
    expect(json.profile.displayName).toBe("Jane Student");
    expect(json.profile.username).toBe("jane_study");
    expect(json.profile.email).toBe("jane@example.com");
  });

  it("repairs profile via ensure_profile RPC if missing", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({
        data: {
          id: "user-456",
          display_name: "Repaired User",
          username: null,
          avatar_url: null,
          created_at: "2026-09-25T00:00:00Z",
          updated_at: "2026-09-25T00:00:00Z",
        },
        error: null,
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-456",
      email: "repair@example.com",
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.profile.id).toBe("user-456");
    expect(json.profile.displayName).toBe("Repaired User");
    expect(json.profile.username).toBeNull();
  });
});

describe("PATCH /api/account/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);

    const request = new NextRequest("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "New Name" }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.code).toBe("AUTH_REQUIRED");
  });

  it("returns 400 NO_UPDATES if empty object sent", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-123",
      email: "user@example.com",
    });

    const request = new NextRequest("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({}),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("NO_UPDATES");
  });

  it("returns 400 INVALID_PROFILE_DATA if display name is empty", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-123",
      email: "user@example.com",
    });

    const request = new NextRequest("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "   " }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("INVALID_PROFILE_DATA");
  });

  it("returns 400 INVALID_USERNAME_FORMAT if username has invalid characters or length", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-123",
      email: "user@example.com",
    });

    const request = new NextRequest("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ username: "ab" }), // too short
    });

    const response = await PATCH(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.code).toBe("INVALID_USERNAME_FORMAT");
  });

  it("returns 409 USERNAME_TAKEN if username already claimed according to check_username_available RPC", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockImplementation((name: string) => {
        if (name === "check_username_available") {
          return Promise.resolve({ data: false, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "user@example.com",
    });

    const request = new NextRequest("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ username: "taken_user" }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.code).toBe("USERNAME_TAKEN");
  });

  it("returns 409 USERNAME_TAKEN if update fails with 23505 unique violation", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockImplementation((name: string) => {
        if (name === "check_username_available") {
          return Promise.resolve({ data: true, error: null }); // passed pre-check
        }
        return Promise.resolve({ data: null, error: null });
      }),
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: "23505", message: "duplicate key value violates unique constraint" },
              }),
            }),
          }),
        }),
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "user@example.com",
    });

    const request = new NextRequest("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({ username: "racing_user" }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.code).toBe("USERNAME_TAKEN");
  });

  it("returns 200 with updated profile on valid update", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockImplementation((name: string) => {
        if (name === "check_username_available") {
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: "user-123",
                  display_name: "New Display Name",
                  username: "new_username",
                  avatar_url: null,
                  created_at: "2026-09-01T00:00:00Z",
                  updated_at: "2026-09-25T12:00:00Z",
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "user@example.com",
    });

    const request = new NextRequest("http://localhost:3000/api/account/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: "New Display Name",
        username: "new_username",
      }),
    });

    const response = await PATCH(request);
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.profile.displayName).toBe("New Display Name");
    expect(json.profile.username).toBe("new_username");
  });
});
