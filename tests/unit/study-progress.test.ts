import { describe, expect, it, vi, beforeEach } from "vitest";
import { computeProgressSummary } from "@/lib/study-progress";

const mockGetAuth = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
}));

import { GET } from "@/app/api/progress/route";

describe("Study Progress Summary Calculation", () => {
  it("computes empty summary when no sessions exist", () => {
    const summary = computeProgressSummary([], []);
    expect(summary.completedSessions).toBe(0);
    expect(summary.averageAccuracy).toBe(0);
    expect(summary.questionsAnswered).toBe(0);
    expect(summary.correctAnswers).toBe(0);
    expect(summary.weakPacks).toEqual([]);
    expect(summary.dailyActivity).toHaveLength(7);
  });

  it("calculates accurate totals, averages, and weak pack identification", () => {
    const today = new Date().toISOString();
    const sessions = [
      {
        id: "s1",
        pack_id: "p1",
        score: 80,
        correct_count: 8,
        question_count: 10,
        completed_at: today,
      },
      {
        id: "s2",
        pack_id: "p2",
        score: 50,
        correct_count: 5,
        question_count: 10,
        completed_at: today,
      },
      {
        id: "s3",
        pack_id: "p2",
        score: 60,
        correct_count: 6,
        question_count: 10,
        completed_at: today,
      },
    ];

    const packs = [
      { id: "p1", title: "Chemistry Pack" },
      { id: "p2", title: "Physics Pack" },
    ];

    const summary = computeProgressSummary(sessions, packs);

    expect(summary.completedSessions).toBe(3);
    expect(summary.questionsAnswered).toBe(30);
    expect(summary.correctAnswers).toBe(19);
    // Average accuracy: (80 + 50 + 60) / 3 = 63.33 -> 63%
    expect(summary.averageAccuracy).toBe(63);

    // Weak packs: p2 has average score 55% (< 70%), p1 has 80% (>= 70%)
    expect(summary.weakPacks).toHaveLength(1);
    expect(summary.weakPacks[0].packId).toBe("p2");
    expect(summary.weakPacks[0].title).toBe("Physics Pack");
    expect(summary.weakPacks[0].averageScore).toBe(55);
    expect(summary.weakPacks[0].attemptsCount).toBe(2);
  });
});

describe("GET /api/progress API Route", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
  });

  it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_REQUIRED");
  });

  it("returns 200 with progress summary when authenticated", async () => {
    const mockSessions = [
      {
        id: "s-1",
        pack_id: "p-1",
        score: 90,
        correct_count: 9,
        question_count: 10,
        completed_at: new Date().toISOString(),
      },
    ];

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "study_sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockSessions, error: null }),
          };
        }
        if (table === "study_packs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: [{ id: "p-1", title: "Biology" }],
              error: null,
            }),
          };
        }
        if (table === "flashcard_sessions") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      }),
    };

    mockGetAuth.mockResolvedValue({
      userId: "u-123",
      supabase: mockSupabase,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completedSessions).toBe(1);
    expect(body.averageAccuracy).toBe(90);
    expect(body.questionsAnswered).toBe(10);
  });
});
