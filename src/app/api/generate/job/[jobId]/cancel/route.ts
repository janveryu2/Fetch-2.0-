import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { requestCancelGenerationJobServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function POST(
  _request: Request,
  props: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await props.params;
  const account = await getAuthenticatedRequestContext();

  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to cancel job.",
      401
    );
  }

  const result = await requestCancelGenerationJobServer({
    jobId,
    client: account.supabase,
  });

  if (result.error || !result.data) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      result.error?.message || "Failed to cancel generation job.",
      400
    );
  }

  return Response.json(result.data);
}
