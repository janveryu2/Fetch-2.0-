import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { getAiUsageServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET() {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to check your AI StudyPack usage.",
      401
    );
  }

  const { data, error } = await getAiUsageServer({ client: account.supabase });

  if (error || !data) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Unable to fetch AI usage balance. Please retry.",
      503
    );
  }

  return Response.json(data);
}
