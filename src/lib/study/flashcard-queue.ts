import { gradeFlashcardAnswer, type FlashcardGradeResult } from "./flashcard-grading";

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  aliases: string[];
  position: number;
}

export interface CardSessionStats {
  attempts: number;
  misses: number;
  isFirstTryCorrect: boolean;
  isMastered: boolean;
}

export interface FlashcardSessionState {
  sessionId: string;
  totalCards: number;
  queue: string[]; // card IDs remaining in study queue
  cardStats: Record<string, CardSessionStats>;
  status: "active" | "incomplete" | "mastered";
  totalAttempts: number;
  firstTryCorrectCount: number;
  masteredCount: number;
}

export function initializeFlashcardSession(
  sessionId: string,
  cards: FlashcardItem[]
): FlashcardSessionState {
  const cardStats: Record<string, CardSessionStats> = {};
  const queue: string[] = [];

  for (const card of cards) {
    queue.push(card.id);
    cardStats[card.id] = {
      attempts: 0,
      misses: 0,
      isFirstTryCorrect: false,
      isMastered: false,
    };
  }

  return {
    sessionId,
    totalCards: cards.length,
    queue,
    cardStats,
    status: cards.length === 0 ? "mastered" : "active",
    totalAttempts: 0,
    firstTryCorrectCount: 0,
    masteredCount: 0,
  };
}

export interface ProcessAttemptResult {
  nextState: FlashcardSessionState;
  grade: FlashcardGradeResult;
  isFirstTry: boolean;
  requeuedAt?: number; // index in queue where card was inserted
  threeMissesReached: boolean;
}

export function processCardAttempt(
  currentState: FlashcardSessionState,
  card: FlashcardItem,
  submittedAnswer: string
): ProcessAttemptResult {
  const grade = gradeFlashcardAnswer(submittedAnswer, card.back, card.aliases);
  const cardStat = currentState.cardStats[card.id] || {
    attempts: 0,
    misses: 0,
    isFirstTryCorrect: false,
    isMastered: false,
  };

  const isFirstTry = cardStat.attempts === 0;
  const attempts = cardStat.attempts + 1;
  let misses = cardStat.misses;
  let isFirstTryCorrect = cardStat.isFirstTryCorrect;
  let isMastered = cardStat.isMastered;

  // Clone current queue without current head
  const nextQueue = currentState.queue.filter((id, idx) => !(id === card.id && idx === 0));
  let requeuedAt: number | undefined = undefined;
  let threeMissesReached = false;

  let firstTryCorrectCount = currentState.firstTryCorrectCount;
  let masteredCount = currentState.masteredCount;

  if (grade.isCorrect) {
    isMastered = true;
    if (isFirstTry) {
      isFirstTryCorrect = true;
      firstTryCorrectCount++;
    }
    masteredCount++;
  } else {
    misses++;
    if (misses >= 3) {
      threeMissesReached = true;
    }
    // Requeue card behind min(3, remaining queue length) cards
    const insertOffset = Math.min(3, nextQueue.length);
    nextQueue.splice(insertOffset, 0, card.id);
    requeuedAt = insertOffset;
  }

  const nextStats = {
    ...currentState.cardStats,
    [card.id]: {
      attempts,
      misses,
      isFirstTryCorrect,
      isMastered,
    },
  };

  const nextStatus: "active" | "incomplete" | "mastered" =
    nextQueue.length === 0
      ? masteredCount === currentState.totalCards
        ? "mastered"
        : "incomplete"
      : "active";

  const nextState: FlashcardSessionState = {
    ...currentState,
    queue: nextQueue,
    cardStats: nextStats,
    status: nextStatus,
    totalAttempts: currentState.totalAttempts + 1,
    firstTryCorrectCount,
    masteredCount,
  };

  return {
    nextState,
    grade,
    isFirstTry,
    requeuedAt,
    threeMissesReached,
  };
}
