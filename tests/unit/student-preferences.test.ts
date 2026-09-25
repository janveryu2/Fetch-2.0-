import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  normalizePrimarySubject,
  patchStudentPreferencesSchema,
  studentPreferencesSchema,
  DEFAULT_STUDENT_PREFERENCES,
} from "@/lib/student-preferences";
import { getStudentPreferenceState } from "@/lib/server/student-preferences";
import { GET, PATCH } from "@/app/api/account/study-preferences/route";

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

describe("Student Preferences Schema and Normalization", () => {
  it("normalizes blank or whitespace-only subject to null", () => {
    expect(normalizePrimarySubject("")).toBeNull();
    expect(normalizePrimarySubject("   ")).toBeNull();
    expect(normalizePrimarySubject(null)).toBeNull();
    expect(normalizePrimarySubject(undefined)).toBeNull();
    expect(normalizePrimarySubject(" Biology ")).toBe("Biology");
  });

  it("validates valid preferences object", () => {
    const valid = {
      primarySubject: "Computer Science",
      studyGoal: "exam",
      focusMinutes: 25,
      onboardingStatus: "completed",
      onboardingVersion: 1,
      completedAt: "2026-09-26T00:00:00.000Z",
    };
    const res = studentPreferencesSchema.safeParse(valid);
    expect(res.success).toBe(true);
  });

  it("rejects invalid studyGoal or focusMinutes in preferences", () => {
    const invalidGoal = {
      ...DEFAULT_STUDENT_PREFERENCES,
      studyGoal: "invalid_goal",
    };
    expect(studentPreferencesSchema.safeParse(invalidGoal).success).toBe(false);

    const invalidFocus = {
      ...DEFAULT_STUDENT_PREFERENCES,
      focusMinutes: 30, // only 15, 25, 45 allowed
    };
    expect(studentPreferencesSchema.safeParse(invalidFocus).success).toBe(false);
  });

  it("validates patchStudentPreferencesSchema with whitespace normalization", () => {
    const input = {
      primarySubject: "  Physics  ",
      studyGoal: "habit",
      focusMinutes: 45,
      action: "save",
    };
    const parsed = patchStudentPreferencesSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.primarySubject).toBe("Physics");
    }
  });

  it("normalizes blank subject to null in patchStudentPreferencesSchema", () => {
    const input = {
      primarySubject: "   ",
      studyGoal: null,
      focusMinutes: 15,
      action: "complete",
    };
    const parsed = patchStudentPreferencesSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.primarySubject).toBeNull();
    }
  });

  it("rejects extra keys in patch payload (strict)", () => {
    const input = {
      primarySubject: "Art",
      studyGoal: "understand",
      focusMinutes: 25,
      action: "complete",
      extraKey: "not_allowed",
    };
    const parsed = patchStudentPreferencesSchema.safeParse(input);
    expect(parsed.success).toBe(false);
  });
});

describe("getStudentPreferenceState (Server Helper)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unauthenticated when context is null", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);
    const state = await getStudentPreferenceState();
    expect(state).toEqual({ status: "unauthenticated" });
  });

  it("returns unavailable when rpc returns error", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "Database connection failed" },
      }),
    };
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "student@example.com",
    });

    const state = await getStudentPreferenceState();
    expect(state.status).toBe("unavailable");
    if (state.status === "unavailable") {
      expect(state.error).toBe("Database connection failed");
    }
  });

  it("returns pending state for pending row", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          primarySubject: null,
          studyGoal: null,
          focusMinutes: 25,
          onboardingStatus: "pending",
          onboardingVersion: 1,
          completedAt: null,
        },
        error: null,
      }),
    };
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "student@example.com",
    });

    const state = await getStudentPreferenceState();
    expect(state.status).toBe("pending");
    if (state.status === "pending") {
      expect(state.userId).toBe("user-123");
      expect(state.preferences.focusMinutes).toBe(25);
    }
  });

  it("returns completed state for completed row", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          primarySubject: "Calculus",
          studyGoal: "exam",
          focusMinutes: 45,
          onboardingStatus: "completed",
          onboardingVersion: 1,
          completedAt: "2026-09-26T01:00:00Z",
        },
        error: null,
      }),
    };
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "student@example.com",
    });

    const state = await getStudentPreferenceState();
    expect(state.status).toBe("completed");
    if (state.status === "completed") {
      expect(state.preferences.primarySubject).toBe("Calculus");
    }
  });

  it("returns skipped state for skipped row", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          primarySubject: null,
          studyGoal: null,
          focusMinutes: 25,
          onboardingStatus: "skipped",
          onboardingVersion: 1,
          completedAt: null,
        },
        error: null,
      }),
    };
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "student@example.com",
    });

    const state = await getStudentPreferenceState();
    expect(state.status).toBe("skipped");
  });
});

describe("GET /api/account/study-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("AUTH_REQUIRED");
  });

  it("returns 503 STUDY_PREFERENCES_UNAVAILABLE when database fails", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: "connection timeout" },
      }),
    };
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "student@example.com",
    });

    const res = await GET();
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("STUDY_PREFERENCES_UNAVAILABLE");
  });

  it("returns 200 with preferences and no-store headers", async () => {
    const mockSupabase = {
      rpc: vi.fn().mockResolvedValue({
        data: {
          primarySubject: "Literature",
          studyGoal: "understand",
          focusMinutes: 25,
          onboardingStatus: "completed",
          onboardingVersion: 1,
          completedAt: "2026-09-26T01:00:00Z",
        },
        error: null,
      }),
    };
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: mockSupabase,
      userId: "user-123",
      email: "student@example.com",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    const json = await res.json();
    expect(json.preferences.primarySubject).toBe("Literature");
    expect(json.preferences.studyGoal).toBe("understand");
  });
});

describe("PATCH /api/account/study-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/account/study-preferences", {
      method: "PATCH",
      body: JSON.stringify({ action: "skip" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 INVALID_JSON on malformed json", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-123",
    });
    const req = new Request("http://localhost/api/account/study-preferences", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_JSON");
  });

  it("returns 400 INVALID_STUDY_PREFERENCES on invalid fields", async () => {
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: {},
      userId: "user-123",
    });
    const req = new Request("http://localhost/api/account/study-preferences", {
      method: "PATCH",
      body: JSON.stringify({
        primarySubject: "History",
        studyGoal: "invalid_goal",
        focusMinutes: 20, // invalid focus
        action: "save",
      }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_STUDY_PREFERENCES");
  });

  it("handles skip action by zeroing preferences", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        primarySubject: null,
        studyGoal: null,
        focusMinutes: 25,
        onboardingStatus: "skipped",
        onboardingVersion: 1,
        completedAt: null,
      },
      error: null,
    });
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: { rpc: mockRpc },
      userId: "user-123",
    });

    const req = new Request("http://localhost/api/account/study-preferences", {
      method: "PATCH",
      body: JSON.stringify({
        primarySubject: null,
        studyGoal: null,
        focusMinutes: 25,
        action: "skip",
      }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("save_student_preferences", {
      p_primary_subject: null,
      p_study_goal: null,
      p_focus_minutes: 25,
      p_action: "skip",
    });
  });

  it("handles complete action with valid preferences", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        primarySubject: "Biology",
        studyGoal: "exam",
        focusMinutes: 45,
        onboardingStatus: "completed",
        onboardingVersion: 1,
        completedAt: "2026-09-26T01:00:00Z",
      },
      error: null,
    });
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: { rpc: mockRpc },
      userId: "user-123",
    });

    const req = new Request("http://localhost/api/account/study-preferences", {
      method: "PATCH",
      body: JSON.stringify({
        primarySubject: "  Biology  ",
        studyGoal: "exam",
        focusMinutes: 45,
        action: "complete",
      }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("save_student_preferences", {
      p_primary_subject: "Biology",
      p_study_goal: "exam",
      p_focus_minutes: 45,
      p_action: "complete",
    });
    const json = await res.json();
    expect(json.preferences.onboardingStatus).toBe("completed");
  });

  it("returns 503 STUDY_PREFERENCES_SAVE_FAILED on RPC error", async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "disk full" },
    });
    mockGetAuthenticatedRequestContext.mockResolvedValueOnce({
      supabase: { rpc: mockRpc },
      userId: "user-123",
    });

    const req = new Request("http://localhost/api/account/study-preferences", {
      method: "PATCH",
      body: JSON.stringify({
        primarySubject: "Math",
        studyGoal: "habit",
        focusMinutes: 15,
        action: "save",
      }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("STUDY_PREFERENCES_SAVE_FAILED");
  });
});
