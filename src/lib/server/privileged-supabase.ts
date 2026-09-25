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

    const saved = data as { id?: unknown; questions?: unknown };
    if (!saved || typeof saved.id !== "string" || !Array.isArray(saved.questions)) {
      return { data: null, error: new Error("Invalid persistence response shape") };
    }

    return {
      data: {
        id: saved.id,
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

