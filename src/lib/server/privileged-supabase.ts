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
    const { data, error } = await client.rpc("create_study_pack", {
      p_title: params.title,
      p_source_type: params.sourceType,
      p_source_label: params.sourceLabel,
      p_source_content: params.sourceContent,
      p_content_hash: params.contentHash,
      p_questions: params.questions,
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

