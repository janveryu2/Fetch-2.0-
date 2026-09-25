import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { notFoundError } from "@/lib/api-errors";

const paramsSchema = z.object({
  packId: z.string().uuid(),
  attemptId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ packId: string; attemptId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const resolvedParams = await params;
  const parsed = paramsSchema.safeParse(resolvedParams);
  if (!parsed.success) {
    return notFoundError("Attempt not found.");
  }

  const { packId, attemptId } = parsed.data;

  // Verify pack belongs to the authenticated user
  const { data: pack, error: packError } = await context.supabase
    .from("study_packs")
    .select("id, title")
    .eq("id", packId)
    .eq("owner_id", context.userId)
    .maybeSingle();

  if (packError || !pack) {
    return notFoundError("StudyPack not found.");
  }

  // Fetch session
  const { data: session, error: sessionError } = await context.supabase
    .from("study_sessions")
    .select("id, pack_id, score, correct_count, question_count, completed_at, client_attempt_id")
    .eq("id", attemptId)
    .eq("pack_id", packId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (sessionError || !session) {
    return notFoundError("Attempt not found.");
  }

  // Fetch answers
  const { data: answers, error: answersError } = await context.supabase
    .from("study_session_answers")
    .select("id, question_id, submitted_answer, is_correct, answered_at, ordinal")
    .eq("session_id", attemptId)
    .order("ordinal", { ascending: true });

  if (answersError) {
    return notFoundError("Answers not found.");
  }

  return Response.json({
    attempt: {
      id: session.id,
      packId: session.pack_id,
      packTitle: pack.title,
      score: session.score,
      correct: session.correct_count,
      total: session.question_count,
      completedAt: session.completed_at,
      clientAttemptId: session.client_attempt_id,
      answers: (answers || []).map((a) => ({
        id: a.id,
        questionId: a.question_id,
        submittedAnswer: a.submitted_answer,
        isCorrect: a.is_correct,
        answeredAt: a.answered_at,
        ordinal: a.ordinal,
      })),
    },
  });
}
