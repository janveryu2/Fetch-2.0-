import { describe, expect, it, vi, beforeEach } from "vitest";
import { GET as getExport } from "@/app/api/account/export/route";
import { POST as deleteAccount } from "@/app/api/account/delete/route";
import { GET as getPreferences, PATCH as updatePreferences } from "@/app/api/account/preferences/route";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mockGetAuthenticatedRequestContext = vi.fn();
const mockDeleteUserAccountServer = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuthenticatedRequestContext(),
  unauthorizedResponse: (msg = "Authentication required") =>
    new Response(JSON.stringify({ error: msg, code: "AUTH_REQUIRED" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/server/privileged-supabase", () => ({
  deleteUserAccountServer: (userId: string) => mockDeleteUserAccountServer(userId),
}));

describe("GET /api/account/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);

    const response = await getExport();
    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.code).toBe("AUTH_REQUIRED");
  });

  it("returns 200 with complete exported account data", async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "profiles") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    display_name: "Jane Student",
                    username: "jane_student",
                    avatar_url: null,
                    created_at: "2026-09-01T00:00:00Z",
                    updated_at: "2026-09-02T00:00:00Z",
                  },
                }),
              }),
            }),
          };
        }
        if (table === "study_packs") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "pack-1",
                      title: "Biology 101",
                      source_type: "text",
                      source_label: "Cell Notes",
                      status: "ready",
                      questions: [{ id: "q-1", prompt: "What is mitochondria?" }],
                    },
                  ],
                }),
              }),
            }),
          };
        }
        if (table === "study_sessions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "session-1",
                      pack_id: "pack-1",
                      score: 100,
                      correct_count: 5,
                      question_count: 5,
                      completed_at: "2026-09-20T12:00:00Z",
                      answers: [],
                    },
                  ],
                }),
              }),
            }),
          };
        }
        if (table === "calendar_events") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "evt-1",
                      title: "Biology Midterm",
                      starts_at: "2026-09-28T10:00:00Z",
                    },
                  ],
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnThis() };
      }),
      rpc: vi.fn().mockImplementation((name: string) => {
        if (name === "list_friends") {
          return Promise.resolve({ data: [{ userId: "friend-1", username: "alex" }] });
        }
        if (name === "get_account_preferences") {
          return Promise.resolve({
            data: { discoverable: true, allow_direct_messages: true, study_reminders: true },
          });
        }
        return Promise.resolve({ data: null });
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "jane@example.com",
    });

    const response = await getExport();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(response.headers.get("Content-Disposition")).toContain("fetch-account-data-");

    const json = await response.json();
    expect(json.exportVersion).toBe("3.0");
    expect(json.account.id).toBe("user-123");
    expect(json.account.email).toBe("jane@example.com");
    expect(json.account.displayName).toBe("Jane Student");
    expect(json.studyPacks).toHaveLength(1);
    expect(json.studySessions).toHaveLength(1);
    expect(json.calendarEvents).toHaveLength(1);
    expect(json.friends).toHaveLength(1);
    expect(json.preferences.discoverable).toBe(true);
  });
});

describe("POST /api/account/delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE" }),
    });

    const res = await deleteAccount(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 CONFIRMATION_REQUIRED if confirmation string is missing or wrong", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      userId: "user-123",
      email: "test@example.com",
    });

    const req = new NextRequest("http://localhost:3000/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirmation: "cancel" }),
    });

    const res = await deleteAccount(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("calls deleteUserAccountServer and returns 200 on success", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      userId: "user-123",
      email: "test@example.com",
    });
    mockDeleteUserAccountServer.mockResolvedValueOnce({ success: true, error: null });

    const req = new NextRequest("http://localhost:3000/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE" }),
    });

    const res = await deleteAccount(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(mockDeleteUserAccountServer).toHaveBeenCalledWith("user-123");
  });

  it("returns 500 ACCOUNT_DELETION_FAILED if server cleanup fails", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      userId: "user-123",
      email: "test@example.com",
    });
    mockDeleteUserAccountServer.mockResolvedValueOnce({
      success: false,
      error: new Error("Auth service error"),
    });

    const req = new NextRequest("http://localhost:3000/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE" }),
    });

    const res = await deleteAccount(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.code).toBe("ACCOUNT_DELETION_FAILED");
  });
});

describe("/api/account/preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns account preferences from RPC", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { discoverable: true, allow_direct_messages: false, study_reminders: true },
        error: null,
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
    });

    const res = await getPreferences();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preferences.allow_direct_messages).toBe(false);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("get_account_preferences");
  });

  it("PATCH updates account preferences via RPC", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: { discoverable: false, allow_direct_messages: true, study_reminders: true },
        error: null,
      }),
    };

    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
    });

    const req = new NextRequest("http://localhost:3000/api/account/preferences", {
      method: "PATCH",
      body: JSON.stringify({ discoverable: false }),
    });

    const res = await updatePreferences(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preferences.discoverable).toBe(false);
    expect(mockSupabase.rpc).toHaveBeenCalledWith("update_account_preferences", {
      p_discoverable: false,
      p_allow_direct_messages: null,
      p_study_reminders: null,
    });
  });
});
