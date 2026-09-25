import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupMockLocalStorage, type MockLocalStorage } from "../../tests/mocks/local-storage";
import type { StudyAttempt, StudyPack } from "./demo-types";
import { getStudyRecommendation, LOW_SCORE_THRESHOLD } from "./study-recommendation";
import { saveStudySessionDraft } from "./study-session-draft";

const mockPack1: StudyPack = {
  id: "pack-1",
  title: "Cell Biology",
  sourceLabel: "Notes",
  createdAt: "2026-09-01T10:00:00Z",
  progress: 0,
  questions: [
    {
      id: "q1",
      type: "multiple_choice",
      prompt: "What is the powerhouse of the cell?",
      choices: ["Mitochondria", "Nucleus", "Ribosome", "Chloroplast"],
      answer: "Mitochondria",
      explanation: "Mitochondria generate ATP.",
    },
  ],
};

const mockPack2: StudyPack = {
  id: "pack-2",
  title: "World History",
  sourceLabel: "PDF",
  createdAt: "2026-09-02T10:00:00Z",
  progress: 0,
  questions: [
    {
      id: "q2",
      type: "multiple_choice",
      prompt: "Which river flooded annually in ancient Egypt?",
      choices: ["Nile", "Tigris", "Euphrates", "Indus"],
      answer: "Nile",
      explanation: "The Nile provided fertile silt.",
    },
  ],
};

describe("getStudyRecommendation", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = setupMockLocalStorage();
  });

  afterEach(() => {
    mockStorage.clear();
  });

  it("returns create_pack recommendation when there are no packs and no attempts", () => {
    const rec = getStudyRecommendation({
      scopeId: "demo",
      packs: [],
      attempts: [],
    });

    expect(rec.type).toBe("create_pack");
    expect(rec.actionHref).toBe("/app/home#add-material");
  });

  it("returns start_pack recommendation when packs exist but no attempts have been made", () => {
    const rec = getStudyRecommendation({
      scopeId: "demo",
      packs: [mockPack1, mockPack2],
      attempts: [],
    });

    expect(rec.type).toBe("start_pack");
    expect(rec.packId).toBe("pack-1");
    expect(rec.actionHref).toBe("/app/study-packs/pack-1");
    expect(rec.actionLabel).toBe("Start studying");
  });

  it("prioritizes an active session draft over past attempts", () => {
    saveStudySessionDraft({
      version: 1,
      sessionId: "session-123",
      clientAttemptId: "attempt-123",
      scopeId: "demo",
      packId: mockPack2.id,
      packTitle: mockPack2.title,
      packFingerprint: `${mockPack2.id}:1:q2`,
      currentIndex: 0,
      currentAnswer: "Nile",
      checked: false,
      feedback: null,
      submittedAnswers: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isCompleted: false,
    });

    const pastAttempt: StudyAttempt = {
      id: "att-1",
      packId: mockPack1.id,
      packTitle: mockPack1.title,
      score: 50,
      correct: 1,
      total: 2,
      completedAt: "2026-09-20T10:00:00Z",
    };

    const rec = getStudyRecommendation({
      scopeId: "demo",
      packs: [mockPack1, mockPack2],
      attempts: [pastAttempt],
    });

    expect(rec.type).toBe("resume_draft");
    expect(rec.packId).toBe(mockPack2.id);
    expect(rec.actionLabel).toBe("Resume session");
  });

  it("recommends retrying a pack with a score below threshold (< 80%)", () => {
    const attempts: StudyAttempt[] = [
      {
        id: "att-1",
        packId: mockPack1.id,
        packTitle: mockPack1.title,
        score: 60,
        correct: 3,
        total: 5,
        completedAt: "2026-09-22T10:00:00Z",
      },
      {
        id: "att-2",
        packId: mockPack2.id,
        packTitle: mockPack2.title,
        score: 100,
        correct: 5,
        total: 5,
        completedAt: "2026-09-21T10:00:00Z",
      },
    ];

    const rec = getStudyRecommendation({
      scopeId: "demo",
      packs: [mockPack1, mockPack2],
      attempts,
    });

    expect(rec.type).toBe("retry_low_score");
    expect(rec.packId).toBe(mockPack1.id);
    expect(rec.score).toBe(60);
    expect(rec.actionLabel).toBe("Practice again");
    expect(rec.reasonText).toContain(`${LOW_SCORE_THRESHOLD}%`);
  });

  it("recommends revisiting the most recent pack when all scores are >= threshold", () => {
    const attempts: StudyAttempt[] = [
      {
        id: "att-1",
        packId: mockPack2.id,
        packTitle: mockPack2.title,
        score: 95,
        correct: 19,
        total: 20,
        completedAt: "2026-09-24T12:00:00Z",
      },
      {
        id: "att-2",
        packId: mockPack1.id,
        packTitle: mockPack1.title,
        score: 90,
        correct: 9,
        total: 10,
        completedAt: "2026-09-20T10:00:00Z",
      },
    ];

    const rec = getStudyRecommendation({
      scopeId: "demo",
      packs: [mockPack1, mockPack2],
      attempts,
    });

    expect(rec.type).toBe("revisit_recent");
    expect(rec.packId).toBe(mockPack2.id);
    expect(rec.score).toBe(95);
    expect(rec.actionLabel).toBe("Study again");
  });

  it("tailors empty-state recommendation to exam, understand, and habit goals", () => {
    const examRec = getStudyRecommendation({
      scopeId: "demo",
      packs: [],
      attempts: [],
      studyGoal: "exam",
      primarySubject: "Biology",
    });
    expect(examRec.type).toBe("create_pack");
    expect(examRec.headline).toBe("Prepare for your Biology exam");
    expect(examRec.badge).toBe("Exam prep");

    const understandRec = getStudyRecommendation({
      scopeId: "demo",
      packs: [],
      attempts: [],
      studyGoal: "understand",
      primarySubject: "History",
    });
    expect(understandRec.type).toBe("create_pack");
    expect(understandRec.headline).toBe("Master difficult History concepts");
    expect(understandRec.badge).toBe("Deep understanding");

    const habitRec = getStudyRecommendation({
      scopeId: "demo",
      packs: [],
      attempts: [],
      studyGoal: "habit",
      primarySubject: "Spanish",
    });
    expect(habitRec.type).toBe("create_pack");
    expect(habitRec.headline).toBe("Build a daily Spanish study habit");
    expect(habitRec.badge).toBe("Daily habit");
  });
});
