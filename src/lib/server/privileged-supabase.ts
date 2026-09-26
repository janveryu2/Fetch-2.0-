import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Question } from "@/lib/demo-types";

let cachedPrivilegedClient: SupabaseClient | null = null;

export function getPrivilegedSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (!cachedPrivilegedClient) {
    cachedPrivilegedClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedPrivilegedClient;
}

export function isPrivilegedSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export interface PersistStudyPackParams {
  ownerId: string;
  title: string;
  sourceType: string;
  sourceLabel: string;
  sourceContent: string;
  contentHash: string;
  questions: Question[];
  fallbackClient?: SupabaseClient;
}

export interface PersistStudyPackResult {
  id: string;
  packId?: string;
  artifactId?: string;
  questions: Question[];
}

export async function persistStudyPackServer(
  params: PersistStudyPackParams
): Promise<{ data: PersistStudyPackResult | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return {
      data: null,
      error: new Error("No database client available for persistence (service role key not configured)."),
    };
  }

  try {
    const serializedQuestions = params.questions.map((q) => {
      const choices = q.choices || (q as unknown as { options?: string[] }).options || [];
      return {
        ...q,
        type: q.type,
        kind: q.type,
        choices,
        options: choices,
        explanation: q.explanation || "",
        sourceQuote:
          (q as unknown as { sourceQuote?: string }).sourceQuote ||
          q.explanation ||
          "",
      };
    });

    const { data, error } = await client.rpc("create_study_pack", {
      p_title: params.title,
      p_source_type: params.sourceType,
      p_source_label: params.sourceLabel,
      p_source_content: params.sourceContent,
      p_content_hash: params.contentHash,
      p_questions: serializedQuestions,
      p_owner_id: params.ownerId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    const saved = data as { id?: unknown; packId?: unknown; artifactId?: unknown; questions?: unknown };
    if (!saved || typeof saved.id !== "string" || !Array.isArray(saved.questions)) {
      return { data: null, error: new Error("Invalid persistence response shape") };
    }

    return {
      data: {
        id: saved.id,
        packId: typeof saved.packId === "string" ? saved.packId : saved.id,
        artifactId: typeof saved.artifactId === "string" ? saved.artifactId : saved.id,
        questions: saved.questions as Question[],
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown persistence error"),
    };
  }
}

export type ReservationResult =
  | { status: "committed"; packId: string; requestId: string }
  | { status: "in_progress"; fencingToken: number; requestId: string }
  | {
      status: "reserved";
      fencingToken: number;
      monthKey: string;
      allowance: number;
      remaining: number;
    };

export async function reserveAiGenerationServer(params: {
  ownerId: string;
  requestId: string;
  payloadHash: string;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: ReservationResult | null; error: Error | null; code?: string }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available for quota reservation.") };
  }

  try {
    const { data, error } = await client.rpc("reserve_ai_generation", {
      p_owner_id: params.ownerId,
      p_request_id: params.requestId,
      p_payload_hash: params.payloadHash,
    });

    if (error) {
      const err = new Error(error.message);
      return { data: null, error: err, code: error.code };
    }

    return { data: data as ReservationResult, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown reservation error"),
    };
  }
}

export async function commitAiGenerationServer(params: {
  ownerId: string;
  requestId: string;
  fencingToken: number;
  packId: string;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { status: string; packId: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available for quota commit.") };
  }

  try {
    const { data, error } = await client.rpc("commit_ai_generation", {
      p_owner_id: params.ownerId,
      p_request_id: params.requestId,
      p_fencing_token: params.fencingToken,
      p_pack_id: params.packId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { status: string; packId: string }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown commit error"),
    };
  }
}

export async function releaseAiGenerationServer(params: {
  ownerId: string;
  requestId: string;
  fencingToken: number;
  failureClass?: string;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { status: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available for quota release.") };
  }

  try {
    const { data, error } = await client.rpc("release_ai_generation", {
      p_owner_id: params.ownerId,
      p_request_id: params.requestId,
      p_fencing_token: params.fencingToken,
      p_failure_class: params.failureClass || "unknown",
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { status: string }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown release error"),
    };
  }
}

export interface AiUsageData {
  allowance: number;
  used: number;
  reserved: number;
  remaining: number;
  monthKey: string;
}

export async function getAiUsageServer(params: {
  ownerId?: string;
  client: SupabaseClient;
}): Promise<{ data: AiUsageData | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("get_ai_usage");

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as AiUsageData, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Unknown usage fetch error"),
    };
  }
}

export async function deleteUserAccountServer(
  userId: string
): Promise<{ success: boolean; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  if (!privilegedClient) {
    return {
      success: false,
      error: new Error("Privileged client unavailable for account deletion."),
    };
  }

  try {
    try {
      const { data: files } = await privilegedClient.storage.from("study-sources").list(userId);
      if (files && files.length > 0) {
        const filePaths = files.map((f) => `${userId}/${f.name}`);
        await privilegedClient.storage.from("study-sources").remove(filePaths);
      }
    } catch {
      // Storage cleanup is best-effort
    }

    const { error: deleteError } = await privilegedClient.auth.admin.deleteUser(userId);
    if (deleteError) {
      return { success: false, error: new Error(deleteError.message) };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to delete user account"),
    };
  }
}

export async function reconstructCommittedStudyPack(params: {
  packId: string;
  ownerId: string;
  fallbackClient?: SupabaseClient;
}): Promise<{
  data: { packId: string; questions: Question[] } | null;
  error: Error | null;
}> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return {
      data: null,
      error: new Error("No database client available to reconstruct StudyPack."),
    };
  }

  try {
    const { data: packRow, error: packError } = await client
      .from("study_packs")
      .select("id")
      .eq("id", params.packId)
      .eq("owner_id", params.ownerId)
      .maybeSingle();

    if (packError || !packRow) {
      return {
        data: null,
        error: packError
          ? new Error(packError.message)
          : new Error("StudyPack not found."),
      };
    }

    const { data: questionRows, error: questionsError } = await client
      .from("questions")
      .select("id, position, kind, prompt, choices")
      .eq("pack_id", params.packId)
      .eq("owner_id", params.ownerId)
      .order("position", { ascending: true });

    if (questionsError) {
      return { data: null, error: new Error(questionsError.message) };
    }

    const questions: Question[] = (questionRows || []).map((q) => ({
      id: q.id,
      type: q.kind as "multiple_choice" | "fill_blank",
      prompt: q.prompt,
      choices: Array.isArray(q.choices) ? q.choices : undefined,
      answer: "",
      explanation: "",
    }));

    return {
      data: {
        packId: params.packId,
        questions,
      },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error:
        err instanceof Error
          ? err
          : new Error("Failed to reconstruct StudyPack"),
    };
  }
}

export interface StartGenerationJobParams {
  ownerId: string;
  requestId: string;
  payloadHash: string;
  artifactKind: "quiz" | "flashcards" | "summary";
  title: string;
  sourceType: string;
  sourceLabel: string;
  sourceContent: string;
  requestedCount: number;
  fallbackClient?: SupabaseClient;
}

export interface GenerationJobStatusData {
  jobId: string;
  artifactKind: "quiz" | "flashcards" | "summary";
  requestedCount: number;
  acceptedCount: number;
  stage: "queued" | "extracting" | "batching" | "grounding" | "finalizing" | "completed" | "failed" | "cancelled";
  status: "in_progress" | "completed" | "failed" | "cancelled";
  cancelRequested: boolean;
  failureCode?: string | null;
  failureMessage?: string | null;
  packId?: string | null;
  artifactId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function startGenerationJobServer(
  params: StartGenerationJobParams
): Promise<{ data: { jobId: string; status: string; stage: string; reused: boolean } | null; code?: string; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available to start generation job.") };
  }

  try {
    const { data, error } = await client.rpc("start_generation_job", {
      p_owner_id: params.ownerId,
      p_request_id: params.requestId,
      p_payload_hash: params.payloadHash,
      p_artifact_kind: params.artifactKind,
      p_title: params.title,
      p_source_type: params.sourceType,
      p_source_label: params.sourceLabel,
      p_source_content: params.sourceContent,
      p_requested_count: params.requestedCount,
    });

    if (error) {
      return { data: null, code: error.code, error: new Error(error.message) };
    }

    return {
      data: data as { jobId: string; status: string; stage: string; reused: boolean },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to start generation job"),
    };
  }
}

export async function getGenerationJobStatusServer(params: {
  jobId: string;
  client: SupabaseClient;
}): Promise<{ data: GenerationJobStatusData | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("get_generation_job_status", {
      p_job_id: params.jobId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as GenerationJobStatusData, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to fetch job status"),
    };
  }
}

export async function requestCancelGenerationJobServer(params: {
  jobId: string;
  client: SupabaseClient;
}): Promise<{ data: { jobId: string; cancelRequested: boolean; status: string } | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("request_cancel_generation_job", {
      p_job_id: params.jobId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { jobId: string; cancelRequested: boolean; status: string }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to cancel generation job"),
    };
  }
}

export async function atomicFinalizeGenerationJobServer(params: {
  jobId: string;
  questions?: unknown[];
  summary?: unknown;
  flashcards?: unknown[];
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { status: string; packId?: string; artifactId?: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available for job finalization.") };
  }

  try {
    const { data, error } = await client.rpc("atomic_finalize_generation_job", {
      p_job_id: params.jobId,
      p_questions: params.questions || [],
      p_summary: params.summary || null,
      p_flashcards: params.flashcards || [],
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: data as { status: string; packId?: string; artifactId?: string },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to finalize generation job"),
    };
  }
}

export async function getStudySummaryServer(params: {
  artifactId: string;
  client: SupabaseClient;
}): Promise<{ data: unknown | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("get_study_summary", {
      p_artifact_id: params.artifactId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to fetch study summary"),
    };
  }
}

export interface CreateManualDeckParams {
  title: string;
  cards?: Array<{
    front: string;
    back: string;
    aliases?: string[];
  }>;
  client: SupabaseClient;
}

export async function createManualDeckServer(
  params: CreateManualDeckParams
): Promise<{ data: { packId: string; artifactId: string; cardCount: number } | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("create_manual_deck", {
      p_title: params.title,
      p_cards: params.cards || [],
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: data as { packId: string; artifactId: string; cardCount: number },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to create manual deck"),
    };
  }
}

export interface ListFlashcardsResult {
  artifactId: string;
  version: number;
  cards: Array<{
    id: string;
    position: number;
    front: string;
    back: string;
    aliases: string[];
    origin: string;
    sourceQuote?: string;
    version: number;
  }>;
}

export async function listFlashcardsServer(params: {
  artifactId: string;
  client: SupabaseClient;
}): Promise<{ data: ListFlashcardsResult | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("list_flashcards", {
      p_artifact_id: params.artifactId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as ListFlashcardsResult, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to list flashcards"),
    };
  }
}

export interface StartFlashcardSessionResult {
  sessionId: string;
  status: "active" | "incomplete" | "mastered";
  queueState: string[];
  firstTryCorrect: number;
  cardsMastered: number;
  totalAttempts: number;
  reused: boolean;
}

export async function startFlashcardSessionServer(params: {
  artifactId: string;
  clientSessionId: string;
  client: SupabaseClient;
}): Promise<{ data: StartFlashcardSessionResult | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("start_flashcard_session", {
      p_artifact_id: params.artifactId,
      p_client_session_id: params.clientSessionId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as StartFlashcardSessionResult, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to start flashcard session"),
    };
  }
}

export interface RecordFlashcardAttemptParams {
  sessionId: string;
  cardId: string;
  ownerId: string;
  ordinal: number;
  submittedAnswer: string;
  isCorrect: boolean;
  retryCount: number;
  sessionUpdate: {
    status: "active" | "incomplete" | "mastered";
    queueState: string[];
    firstTryCorrect: number;
    cardsMastered: number;
    totalAttempts: number;
  };
  client: SupabaseClient;
}

export async function recordFlashcardAttemptServer(
  params: RecordFlashcardAttemptParams
): Promise<{ success: boolean; error: Error | null }> {
  try {
    // 1. Record attempt
    const { error: attemptError } = await params.client
      .from("flashcard_attempts")
      .insert({
        session_id: params.sessionId,
        card_id: params.cardId,
        owner_id: params.ownerId,
        ordinal: params.ordinal,
        submitted_answer: params.submittedAnswer,
        is_correct: params.isCorrect,
        retry_count: params.retryCount,
      });

    if (attemptError) {
      return { success: false, error: new Error(attemptError.message) };
    }

    // 2. Update session state
    const { error: sessionError } = await params.client
      .from("flashcard_sessions")
      .update({
        status: params.sessionUpdate.status,
        queue_state: params.sessionUpdate.queueState,
        first_try_correct: params.sessionUpdate.firstTryCorrect,
        cards_mastered: params.sessionUpdate.cardsMastered,
        total_attempts: params.sessionUpdate.totalAttempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.sessionId)
      .eq("owner_id", params.ownerId);

    if (sessionError) {
      return { success: false, error: new Error(sessionError.message) };
    }

    return { success: true, error: null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to record flashcard attempt"),
    };
  }
}


