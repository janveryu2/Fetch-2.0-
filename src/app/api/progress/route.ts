import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import {
  computeProgressSummary,
  type SessionRow,
  type PackRow,
  type FlashcardSessionRow,
} from "@/lib/study-progress";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to view your account learning progress.",
      401
    );
  }

  const { supabase, userId } = context;

  const [sessionsRes, packsRes, flashcardsRes] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("id,pack_id,score,correct_count,question_count,completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(200),
    supabase
      .from("study_packs")
      .select("id,title")
      .eq("owner_id", userId),
    typeof supabase.from("flashcard_sessions")?.select === "function"
      ? supabase
          .from("flashcard_sessions")
          .select("id,status,first_try_correct,cards_mastered,total_attempts,completed_at,updated_at")
          .eq("owner_id", userId)
          .order("updated_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as FlashcardSessionRow[], error: null }),
  ]);

  if (sessionsRes.error) {
    console.error("Progress sessions query failed", sessionsRes.error.message);
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Failed to load study sessions for progress.",
      503
    );
  }

  const sessions = (sessionsRes.data || []) as SessionRow[];
  const packs = (packsRes.data || []) as PackRow[];
  const flashcardSessions = (flashcardsRes.data || []) as FlashcardSessionRow[];

  const summary = computeProgressSummary(sessions, packs, flashcardSessions);

  return Response.json(summary);
}
