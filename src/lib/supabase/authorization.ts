import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AuthenticatedRequestContext = {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
};

export async function getAuthenticatedRequestContext(): Promise<AuthenticatedRequestContext | null> {
  if (!getSupabaseEnv().success) return null;
  // Do not swallow cookies()' dynamic-render signal in a Server Component.
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = claims?.sub;
  if (error || typeof userId !== "string" || claims?.is_anonymous === true) {
    return null;
  }
  return {
    supabase,
    userId,
    email: typeof claims?.email === "string" ? claims.email : null,
  };
}

export function unauthorizedResponse() {
  return Response.json({ error: "Sign in to use account storage." }, { status: 401 });
}
