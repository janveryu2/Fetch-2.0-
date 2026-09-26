import { z } from "zod";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { recordFlashcardAttemptServer } from "@/lib/server/privileged-supabase";
import { gradeFlashcardAnswer } from "@/lib/study/flashcard-grading";
import { createApiErrorResponse } from "@/lib/api-errors";

const attemptSchema = z.object({
  sessionId: z.string().uuid(),
  cardId: z.string().uuid(),
  submittedAnswer: z.string().default(""),
  ordinal: z.number().int().min(0),
});

export async function POST(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to submit flashcard attempt.",
      401
    );
  }

  const parsed = attemptSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Valid sessionId, cardId, and ordinal are required.",
      400
    );
  }

  const { sessionId, cardId, submittedAnswer, ordinal } = parsed.data;

  // 1. Fetch current session and card
  const { data: session, error: sessionErr } = await account.supabase
    .from("flashcard_sessions")
    .select("*")
    .eq("id", sessionId)
    .single();

  if (sessionErr || !session) {
    return createApiErrorResponse("NOT_FOUND", "Study session not found.", 404);
  }

  const { data: card, error: cardErr } = await account.supabase
    .from("flashcards")
    .select("*")
    .eq("id", cardId)
    .single();

  if (cardErr || !card) {
    return createApiErrorResponse("NOT_FOUND", "Card not found.", 404);
  }

  // Count prior attempts on this specific card in this session
  const { data: priorAttempts } = await account.supabase
    .from("flashcard_attempts")
    .select("is_correct")
    .eq("session_id", sessionId)
    .eq("card_id", cardId);

  const retryCount = priorAttempts ? priorAttempts.length : 0;
  const isFirstTry = retryCount === 0;

  // 2. Grade answer
  const grade = gradeFlashcardAnswer(submittedAnswer, card.back, card.aliases || []);

  // 3. Compute updated queue state
  const rawQueue: string[] = Array.isArray(session.queue_state) ? session.queue_state : [];
  // Remove current card from queue
  const remainingQueue = rawQueue.filter((id, idx) => !(id === cardId && idx === 0));

  let firstTryCorrect = session.first_try_correct;
  let cardsMastered = session.cards_mastered;
  let status = session.status;

  if (grade.isCorrect) {
    cardsMastered++;
    if (isFirstTry) {
      firstTryCorrect++;
    }
  } else {
    // Insert behind min(3, remaining queue length)
    const insertOffset = Math.min(3, remainingQueue.length);
    remainingQueue.splice(insertOffset, 0, cardId);
  }

  if (remainingQueue.length === 0) {
    status = "mastered";
  }

  const totalAttempts = session.total_attempts + 1;

  // 4. Record attempt and update session atomically
  const result = await recordFlashcardAttemptServer({
    sessionId,
    cardId,
    ownerId: account.userId,
    ordinal,
    submittedAnswer,
    isCorrect: grade.isCorrect,
    retryCount,
    sessionUpdate: {
      status,
      queueState: remainingQueue,
      firstTryCorrect,
      cardsMastered,
      totalAttempts,
    },
    client: account.supabase,
  });

  if (result.error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      result.error.message || "Failed to record attempt.",
      500
    );
  }

  return Response.json({
    isCorrect: grade.isCorrect,
    normalizedSubmitted: grade.normalizedSubmitted,
    normalizedExpected: grade.normalizedExpected,
    matchedAnswer: grade.matchedAnswer,
    retryCount,
    isFirstTry,
    session: {
      status,
      queueState: remainingQueue,
      firstTryCorrect,
      cardsMastered,
      totalAttempts,
    },
  });
}
