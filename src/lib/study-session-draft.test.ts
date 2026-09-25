import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupMockLocalStorage, type MockLocalStorage } from "../../tests/mocks/local-storage";
import {
  clearStudySessionDraft,
  computePackFingerprint,
  findActiveDraft,
  loadStudySessionDraft,
  saveStudySessionDraft,
  type StudySessionDraft,
} from "./study-session-draft";
import type { StudyPack } from "./demo-types";

describe("StudySession draft persistence", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = setupMockLocalStorage();
  });

  afterEach(() => {
    mockStorage.clear();
  });

  const testPack: StudyPack = {
    id: "pack-123",
    title: "Cell Biology",
    sourceLabel: "Notes",
    createdAt: "2026-09-20T00:00:00Z",
    progress: 0,
    questions: [
      { id: "q-1", type: "multiple_choice", prompt: "What is mitochondria?" },
      { id: "q-2", type: "fill_blank", prompt: "Photosynthesis produces ____." },
    ],
  };

  const sampleDraft: StudySessionDraft = {
    version: 1,
    sessionId: "sess-abc",
    clientAttemptId: "attempt-xyz",
    scopeId: "demo",
    packId: "pack-123",
    packTitle: "Cell Biology",
    packFingerprint: computePackFingerprint(testPack),
    currentIndex: 1,
    currentAnswer: "glucose",
    checked: true,
    feedback: { correct: true, explanation: "Correct!" },
    submittedAnswers: [{ questionId: "q-1", answer: "powerhouse", correct: true }],
    startedAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
    isCompleted: false,
  };

  it("saves and loads a valid draft", () => {
    const saved = saveStudySessionDraft(sampleDraft);
    expect(saved).toBe(true);

    const result = loadStudySessionDraft("demo", testPack);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.draft.sessionId).toBe("sess-abc");
      expect(result.draft.currentIndex).toBe(1);
      expect(result.draft.clientAttemptId).toBe("attempt-xyz");
      expect(result.draft.submittedAnswers).toHaveLength(1);
    }
  });

  it("detects fingerprint mismatch when pack questions change", () => {
    saveStudySessionDraft(sampleDraft);

    const modifiedPack: StudyPack = {
      ...testPack,
      questions: [
        { id: "q-1", type: "multiple_choice", prompt: "What is mitochondria?" },
        { id: "q-3-new", type: "fill_blank", prompt: "Different question" },
      ],
    };

    const result = loadStudySessionDraft("demo", modifiedPack);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("fingerprint_mismatch");
    }
  });

  it("enforces scope isolation between demo and account users", () => {
    saveStudySessionDraft(sampleDraft);

    // Another user or account scope cannot load demo's draft
    const accountResult = loadStudySessionDraft("user-456", testPack);
    expect(accountResult.success).toBe(false);
    if (!accountResult.success) {
      expect(accountResult.reason).toBe("not_found");
    }
  });

  it("expires drafts older than 30 days and removes them", () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const expiredDraft: StudySessionDraft = {
      ...sampleDraft,
      updatedAt: oldDate,
    };
    saveStudySessionDraft(expiredDraft);

    const result = loadStudySessionDraft("demo", testPack);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("expired");
    }

    // Verify it was cleared
    const secondCheck = loadStudySessionDraft("demo", testPack);
    expect(secondCheck.success).toBe(false);
    if (!secondCheck.success) {
      expect(secondCheck.reason).toBe("not_found");
    }
  });

  it("clears draft on demand", () => {
    saveStudySessionDraft(sampleDraft);
    clearStudySessionDraft("demo", "pack-123");

    const result = loadStudySessionDraft("demo", testPack);
    expect(result.success).toBe(false);
  });

  it("finds the most recently active draft for a scope", () => {
    saveStudySessionDraft(sampleDraft);

    const active = findActiveDraft("demo");
    expect(active).not.toBeNull();
    expect(active?.packId).toBe("pack-123");
    expect(active?.packTitle).toBe("Cell Biology");
    expect(active?.progress).toBe(1);

    // Account scope has no active draft
    expect(findActiveDraft("user-456")).toBeNull();
  });
});
