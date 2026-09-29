import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { getGenerationJobStatusServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET(
  _request: Request,
  props: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await props.params;
  const account = await getAuthenticatedRequestContext();

  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to check job status.",
      401
    );
  }

  const result = await getGenerationJobStatusServer({
    jobId,
    client: account.supabase,
  });

  if (result.error || !result.data) {
    return createApiErrorResponse(
      "NOT_FOUND",
      result.error?.message || "Generation job not found.",
      404
    );
  }

  return Response.json(result.data);
}

