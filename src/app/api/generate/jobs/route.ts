import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { listMyGenerationJobsServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to list generation jobs.",
      401
    );
  }

  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "1" || searchParams.get("active") === "true";

  const result = await listMyGenerationJobsServer({
    client: account.supabase,
    activeOnly,
  });

  if (result.error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      result.error.message || "Failed to list generation jobs",
      500
    );
  }

  return Response.json({ jobs: result.data || [] });
}
