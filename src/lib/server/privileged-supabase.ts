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

export async function releaseGenerationJobServer(params: {
  jobId: string;
  failureCode?: string;
  failureMessage?: string;
  cancelled?: boolean;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { success: boolean; status: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available for job release.") };
  }

  try {
    const { data, error } = await client.rpc("release_generation_job", {
      p_job_id: params.jobId,
      p_failure_code: params.failureCode || null,
      p_failure_message: params.failureMessage || null,
      p_cancelled: params.cancelled || false,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return {
      data: data as { success: boolean; status: string },
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to release generation job"),
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
): Promise<{ success: boolean; error: Error | null; data?: unknown }> {
  try {
    const { data, error } = await params.client.rpc("record_flashcard_attempt", {
      p_session_id: params.sessionId,
      p_card_id: params.cardId,
      p_ordinal: params.ordinal,
      p_submitted_answer: params.submittedAnswer,
      p_is_correct: params.isCorrect,
      p_retry_count: params.retryCount,
      p_next_queue: params.sessionUpdate.queueState,
      p_new_status: params.sessionUpdate.status,
    });

    if (error) {
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null, data };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err : new Error("Failed to record flashcard attempt"),
    };
  }
}

export async function claimGenerationBatchServer(params: {
  jobId: string;
  batchNumber: number;
  leaseOwner: string;
  leaseSeconds?: number;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { success: boolean; fencingToken?: number; leaseExpiresAt?: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available.") };
  }

  try {
    const { data, error } = await client.rpc("claim_generation_batch", {
      p_job_id: params.jobId,
      p_batch_number: params.batchNumber,
      p_lease_owner: params.leaseOwner,
      p_lease_seconds: params.leaseSeconds ?? 60,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { success: boolean; fencingToken?: number; leaseExpiresAt?: string }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to claim generation batch"),
    };
  }
}

export async function checkpointGenerationBatchServer(params: {
  jobId: string;
  batchNumber: number;
  acceptedItems: unknown;
  newAcceptedCount?: number;
  stage?: string;
  leaseOwner?: string;
  fencingToken?: number;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { success: boolean; acceptedCount?: number; reason?: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available.") };
  }

  try {
    const { data, error } = await client.rpc("checkpoint_generation_batch", {
      p_job_id: params.jobId,
      p_batch_number: params.batchNumber,
      p_accepted_items: params.acceptedItems,
      p_new_accepted_count: params.newAcceptedCount ?? null,
      p_stage: params.stage ?? "batching",
      p_lease_owner: params.leaseOwner ?? null,
      p_fencing_token: params.fencingToken ?? null,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { success: boolean; acceptedCount?: number; reason?: string }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to checkpoint generation batch"),
    };
  }
}

export interface ClaimGenerationStepResult {
  success: boolean;
  reason: string;
  jobId?: string;
  fencingToken?: number;
  leaseExpiresAt?: string;
  artifactKind?: "quiz" | "flashcards" | "summary";
  requestedCount?: number;
  acceptedCount?: number;
  stage?: string;
  title?: string;
  sourceType?: string;
  sourceLabel?: string;
  status?: string;
  leaseOwner?: string;
}

export async function claimGenerationStepServer(params: {
  workerId: string;
  jobId?: string;
  leaseSeconds?: number;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: ClaimGenerationStepResult | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available.") };
  }

  try {
    const { data, error } = await client.rpc("claim_generation_step", {
      p_worker_id: params.workerId,
      p_job_id: params.jobId || null,
      p_lease_seconds: params.leaseSeconds ?? 75,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as ClaimGenerationStepResult, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to claim generation step"),
    };
  }
}

export async function heartbeatGenerationJobServer(params: {
  jobId: string;
  leaseOwner: string;
  fencingToken: number;
  extendSeconds?: number;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { success: boolean; leaseExpiresAt?: string; reason?: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available.") };
  }

  try {
    const { data, error } = await client.rpc("heartbeat_generation_job", {
      p_job_id: params.jobId,
      p_lease_owner: params.leaseOwner,
      p_fencing_token: params.fencingToken,
      p_extend_seconds: params.extendSeconds ?? 60,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { success: boolean; leaseExpiresAt?: string; reason?: string }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to heartbeat generation job"),
    };
  }
}

export async function listMyGenerationJobsServer(params: {
  client: SupabaseClient;
  activeOnly?: boolean;
}): Promise<{ data: GenerationJobStatusData[] | null; error: Error | null }> {
  try {
    const { data, error } = await params.client.rpc("list_my_generation_jobs", {
      p_active_only: params.activeOnly ?? true,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as GenerationJobStatusData[], error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to list generation jobs"),
    };
  }
}

export async function sweepGenerationJobsServer(params?: {
  staleSeconds?: number;
  deadlineMinutes?: number;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { success: boolean; expiredCount: number; cancelledCount: number; reclaimedCount: number } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params?.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available.") };
  }

  try {
    const { data, error } = await client.rpc("sweep_generation_jobs", {
      p_stale_seconds: params?.staleSeconds ?? 75,
      p_deadline_minutes: params?.deadlineMinutes ?? 30,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { success: boolean; expiredCount: number; cancelledCount: number; reclaimedCount: number }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to sweep generation jobs"),
    };
  }
}

export async function getGenerationJobForRunnerServer(params: {
  jobId: string;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { job: Record<string, unknown>; sourceContent: string; batches: unknown[] } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available.") };
  }

  try {
    const { data, error } = await client.rpc("get_generation_job_for_runner", {
      p_job_id: params.jobId,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { job: Record<string, unknown>; sourceContent: string; batches: unknown[] }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to get runner job data"),
    };
  }
}

export async function recordGenerationRetryServer(params: {
  jobId: string;
  fencingToken: number;
  errorCode: string;
  errorMessage: string;
  delaySeconds?: number;
  fallbackClient?: SupabaseClient;
}): Promise<{ data: { success: boolean; nextRunAt?: string; providerAttempts?: number; reason?: string } | null; error: Error | null }> {
  const privilegedClient = getPrivilegedSupabaseClient();
  const client = privilegedClient || params.fallbackClient;

  if (!client) {
    return { data: null, error: new Error("No database client available.") };
  }

  try {
    const { data, error } = await client.rpc("record_generation_retry", {
      p_job_id: params.jobId,
      p_fencing_token: params.fencingToken,
      p_error_code: params.errorCode,
      p_error_message: params.errorMessage,
      p_delay_seconds: params.delaySeconds ?? 10,
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }

    return { data: data as { success: boolean; nextRunAt?: string; providerAttempts?: number; reason?: string }, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error("Failed to record generation retry"),
    };
  }
}



