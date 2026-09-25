import { type NextRequest } from "next/server";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { extractRequestId, logger } from "@/lib/server/logger";

type WorkspaceQuestionRow = {
  id: string;
  pack_id: string;
  position: number;
  kind: "multiple_choice" | "fill_blank";
  prompt: string;
  choices: unknown;
};

export async function GET(request: NextRequest) {
  const requestId = extractRequestId(request);
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const { supabase, userId } = context;

  // Bounded pagination parameters
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0);

  const [packResult, attemptResult, eventResult] = await Promise.all([
    supabase
      .from("study_packs")
      .select("id,title,source_type,source_label,status,created_at")
      .eq("owner_id", userId)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("study_sessions")
      .select("id,pack_id,score,correct_count,question_count,completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(50),
    supabase
      .from("calendar_events")
      .select("id,title,event_type,event_date,start_time,end_time,all_day,color,subject,location,pack_id")
      .eq("user_id", userId)
      .order("event_date", { ascending: true })
      .limit(100),
  ]);

  if (packResult.error || attemptResult.error || eventResult.error) {
    logger.error("Account workspace data could not be loaded", undefined, {
      requestId,
      userId,
      packsErrorCode: packResult.error?.code,
      attemptsErrorCode: attemptResult.error?.code,
      eventsErrorCode: eventResult.error?.code,
    });
    return new Response(
      JSON.stringify({
        error: "Account storage is not ready. Apply the FETCH database schema and try again.",
        code: "STORAGE_UNAVAILABLE",
        requestId,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      }
    );
  }

  const packRows = packResult.data ?? [];
  const packIds = packRows.map((pack) => pack.id);
  const questionsResult = packIds.length
    ? await supabase
        .from("questions")
        .select("id,pack_id,position,kind,prompt,choices")
        .eq("owner_id", userId)
        .in("pack_id", packIds)
        .order("position", { ascending: true })
    : { data: [], error: null };

  if (questionsResult.error) {
    logger.error("Account StudyPack questions could not be loaded", undefined, {
      requestId,
      userId,
      questionsErrorCode: questionsResult.error.code,
    });
    return new Response(
      JSON.stringify({
        error: "StudyPacks could not be loaded right now.",
        code: "STORAGE_UNAVAILABLE",
        requestId,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
      }
    );
  }

  const questionsByPack = new Map<string, WorkspaceQuestionRow[]>();
  for (const question of (questionsResult.data ?? []) as WorkspaceQuestionRow[]) {
    const current = questionsByPack.get(question.pack_id) ?? [];
    current.push(question);
    questionsByPack.set(question.pack_id, current);
  }
  const packTitles = new Map(packRows.map((pack) => [pack.id, pack.title]));

  const responsePayload = {
    packs: packRows.map((pack) => ({
      id: pack.id,
      title: pack.title,
      sourceLabel: pack.source_label,
      createdAt: pack.created_at,
      progress: 0,
      questions: (questionsByPack.get(pack.id) ?? []).map((question) => ({
        id: question.id,
        type: question.kind,
        prompt: question.prompt,
        choices: Array.isArray(question.choices) ? question.choices : undefined,
      })),
    })),
    attempts: (attemptResult.data ?? []).map((attempt) => ({
      id: attempt.id,
      packId: attempt.pack_id,
      packTitle: packTitles.get(attempt.pack_id) ?? "StudyPack",
      score: attempt.score,
      correct: attempt.correct_count,
      total: attempt.question_count,
      completedAt: attempt.completed_at,
    })),
    events: (eventResult.data ?? []).map((event) => ({
      id: event.id,
      title: event.title,
      date: event.event_date,
      type: event.event_type,
      allDay: event.all_day,
      start: event.start_time?.slice(0, 5) ?? undefined,
      end: event.end_time?.slice(0, 5) ?? undefined,
      color: event.color,
      subject: event.subject,
      location: event.location,
      packId: event.pack_id ?? undefined,
    })),
    pagination: {
      limit,
      offset,
      count: packRows.length,
    },
  };

  return new Response(JSON.stringify(responsePayload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
  });
}
