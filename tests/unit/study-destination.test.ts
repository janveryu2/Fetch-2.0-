import { describe, expect, it } from "vitest";
import { resolveStudyDestination } from "@/lib/study-destination";
import type { StudyAttempt, StudyPack } from "@/lib/demo-types";

describe("resolveStudyDestination", () => {
  const dummyPack1: StudyPack = {
    id: "pack-1",
    title: "Cell Biology",
    sourceLabel: "Notes",
    createdAt: "2026-09-01T10:00:00Z",
    progress: 0,
    questions: [
      {
        id: "q1",
        type: "multiple_choice",
        prompt: "What is mitochondria?",
        choices: ["Powerhouse", "Nucleus", "Ribosome", "Lipid"],
        answer: "Powerhouse",
        explanation: "Powerhouse of the cell.",
      },
    ],
  };

  const dummyPack2: StudyPack = {
    id: "pack-2",
    title: "Organic Chemistry",
    sourceLabel: "Textbook",
    createdAt: "2026-09-02T10:00:00Z",
    progress: 0,
    questions: [
      {
        id: "q2",
        type: "multiple_choice",
        prompt: "What is benzene?",
        choices: ["Aromatic ring", "Alkane", "Ketone", "Aldehyde"],
        answer: "Aromatic ring",
        explanation: "Aromatic hydrocarbon.",
      },
    ],
  };

  const attemptPack1: StudyAttempt = {
    id: "attempt-1",
    packId: "pack-1",
    packTitle: "Cell Biology",
    score: 90,
    correct: 9,
    total: 10,
    completedAt: "2026-09-10T12:00:00Z",
  };

  const attemptPack2: StudyAttempt = {
    id: "attempt-2",
    packId: "pack-2",
    packTitle: "Organic Chemistry",
    score: 70,
    correct: 7,
    total: 10,
    completedAt: "2026-09-15T12:00:00Z",
  };

  it("prioritizes an active resumable draft with 'Resume studying'", () => {
    const destination = resolveStudyDestination({
      scopeId: "demo",
      packs: [dummyPack1, dummyPack2],
      attempts: [attemptPack2],
      activeDraft: {
        packId: "pack-1",
        packTitle: "Cell Biology",
        progress: 2,
      },
    });

    expect(destination).toEqual({
      href: "/app/study/pack-1",
      label: "Resume studying",
      type: "draft",
      packId: "pack-1",
      packTitle: "Cell Biology",
    });
  });

  it("chooses the most recently studied existing pack when no draft exists", () => {
    const destination = resolveStudyDestination({
      scopeId: "demo",
      packs: [dummyPack1, dummyPack2],
      attempts: [attemptPack1, attemptPack2],
      activeDraft: null,
    });

    expect(destination).toEqual({
      href: "/app/study/pack-2",
      label: "Start studying",
      type: "recently_studied",
      packId: "pack-2",
      packTitle: "Organic Chemistry",
    });
  });

  it("chooses the most recently created pack when packs exist but have not been studied", () => {
    const destination = resolveStudyDestination({
      scopeId: "demo",
      packs: [dummyPack2, dummyPack1],
      attempts: [],
      activeDraft: null,
    });

    expect(destination).toEqual({
      href: "/app/study/pack-2",
      label: "Start studying",
      type: "recently_created",
      packId: "pack-2",
      packTitle: "Organic Chemistry",
    });
  });

  it("falls back to /app/home#add-material when no packs exist", () => {
    const destination = resolveStudyDestination({
      scopeId: "demo",
      packs: [],
      attempts: [],
      activeDraft: null,
    });

    expect(destination).toEqual({
      href: "/app/home#add-material",
      label: "Start studying",
      type: "empty",
    });
  });
});
