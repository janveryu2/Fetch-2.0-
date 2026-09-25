import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { computeProgressSummary, type SessionRow, type PackRow } from "@/lib/study-progress";
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

  const [sessionsRes, packsRes] = await Promise.all([
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

  const summary = computeProgressSummary(sessions, packs);

  return Response.json(summary);
}
