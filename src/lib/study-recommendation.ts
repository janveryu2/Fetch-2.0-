import type { StudyAttempt, StudyPack } from "./demo-types";
import { findActiveDraft } from "./study-session-draft";

export type RecommendationType =
  | "resume_draft"
  | "retry_low_score"
  | "revisit_recent"
  | "start_pack"
  | "create_pack";

export interface StudyRecommendation {
  type: RecommendationType;
  packId?: string;
  packTitle?: string;
  score?: number;
  badge: string;
  headline: string;
  reasonText: string;
  actionLabel: string;
  actionHref: string;
}

export const LOW_SCORE_THRESHOLD = 80;

/**
 * Deterministically determines the next best study action:
 * 1. Resuming an unfinished study session draft (highest priority)
 * 2. Retrying the most recent study pack with a score below threshold (< 80%)
 * 3. Reviewing or continuing the most recently completed study pack
 * 4. Starting a created pack that has not yet been practiced
 * 5. Creating a brand new study pack if no packs exist
 */
export function getStudyRecommendation(params: {
  scopeId: string;
  packs: StudyPack[];
  attempts: StudyAttempt[];
  activeDraft?: { packId: string; packTitle: string; progress: number } | null;
  threshold?: number;
  studyGoal?: string | null;
  primarySubject?: string | null;
}): StudyRecommendation {
  const {
    scopeId,
    packs,
    attempts,
    activeDraft,
    threshold = LOW_SCORE_THRESHOLD,
    studyGoal,
    primarySubject,
  } = params;

  // 1. Check for active, unfinished draft (provided or read from storage)
  const draft = activeDraft !== undefined ? activeDraft : findActiveDraft(scopeId);
  if (draft) {
    const matchingPack = packs.find((p) => p.id === draft.packId);
    return {
      type: "resume_draft",
      packId: draft.packId,
      packTitle: matchingPack?.title ?? draft.packTitle,
      badge: "In progress",
      headline: `Resume "${matchingPack?.title ?? draft.packTitle}"`,
      reasonText: `You have an unfinished session at question ${draft.progress + 1}. Resume now to keep your progress.`,
      actionLabel: "Resume session",
      actionHref: `/app/study-packs/${draft.packId}`,
    };
  }

  // 2. Check for recent low score attempt (< threshold%)
  // Sort attempts from most recent to oldest
  const sortedAttempts = [...attempts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );

  const lowScoreAttempt = sortedAttempts.find((a) => {
    if (a.score >= threshold) return false;
    // Ensure the pack still exists if packs are loaded
    if (packs.length > 0 && !packs.some((p) => p.id === a.packId)) return false;
    return true;
  });

  if (lowScoreAttempt) {
    return {
      type: "retry_low_score",
      packId: lowScoreAttempt.packId,
      packTitle: lowScoreAttempt.packTitle,
      score: lowScoreAttempt.score,
      badge: "Review recommendation",
      headline: `Practice "${lowScoreAttempt.packTitle}" again`,
      reasonText: `You scored ${lowScoreAttempt.score}% on your last attempt. Reviewing packs below ${threshold}% helps reinforce tricky topics.`,
      actionLabel: "Practice again",
      actionHref: `/app/study-packs/${lowScoreAttempt.packId}`,
    };
  }

  // 3. Most recent completed attempt
  const latestAttempt = sortedAttempts.find((a) =>
    packs.length > 0 ? packs.some((p) => p.id === a.packId) : true,
  );

  if (latestAttempt) {
    return {
      type: "revisit_recent",
      packId: latestAttempt.packId,
      packTitle: latestAttempt.packTitle,
      score: latestAttempt.score,
      badge: "Keep your streak",
      headline: `Revisit "${latestAttempt.packTitle}"`,
      reasonText: `Great work scoring ${latestAttempt.score}%! Practice again to lock in your recall or try a new pack.`,
      actionLabel: "Study again",
      actionHref: `/app/study-packs/${latestAttempt.packId}`,
    };
  }

  // 4. Have packs, but haven't attempted any yet
  if (packs.length > 0) {
    const firstPack = packs[0];
    return {
      type: "start_pack",
      packId: firstPack.id,
      packTitle: firstPack.title,
      badge: "Suggested pack",
      headline: `Start studying "${firstPack.title}"`,
      reasonText: `You have ${firstPack.questions.length} questions ready to practice. Start your first session to build your study history.`,
      actionLabel: "Start studying",
      actionHref: `/app/study-packs/${firstPack.id}`,
    };
  }

  // 5. No packs and no attempts - tailored to student goal
  if (studyGoal === "exam") {
    return {
      type: "create_pack",
      badge: "Exam prep",
      headline: primarySubject ? `Prepare for your ${primarySubject} exam` : "Prepare for your upcoming exam",
      reasonText: "Turn your exam study guide or lecture notes into practice questions to test what you know.",
      actionLabel: "Create a StudyPack",
      actionHref: "/app/home#add-material",
    };
  }

  if (studyGoal === "understand") {
    return {
      type: "create_pack",
      badge: "Deep understanding",
      headline: primarySubject ? `Master difficult ${primarySubject} concepts` : "Understand difficult material",
      reasonText: "Paste complex notes to break them down into bite-sized questions and clear explanations.",
      actionLabel: "Create a StudyPack",
      actionHref: "/app/home#add-material",
    };
  }

  if (studyGoal === "habit") {
    return {
      type: "create_pack",
      badge: "Daily habit",
      headline: primarySubject ? `Build a daily ${primarySubject} study habit` : "Build a daily study habit",
      reasonText: "Start with a short StudyPack to get your daily practice streak underway.",
      actionLabel: "Create a StudyPack",
      actionHref: "/app/home#add-material",
    };
  }

  return {
    type: "create_pack",
    badge: "Get started",
    headline: "Create your first StudyPack",
    reasonText: "Paste your study notes or syllabus to generate flashcards and quiz questions in seconds.",
    actionLabel: "Create a StudyPack",
    actionHref: "/app/home#add-material",
  };
}
