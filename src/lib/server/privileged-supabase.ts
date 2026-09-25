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
