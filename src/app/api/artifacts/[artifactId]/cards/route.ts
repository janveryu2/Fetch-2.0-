import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { listFlashcardsServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET(
  _request: Request,
  props: { params: Promise<{ artifactId: string }> }
) {
  const { artifactId } = await props.params;
  const account = await getAuthenticatedRequestContext();

  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to view flashcards.",
      401
    );
  }

  const result = await listFlashcardsServer({
    artifactId,
    client: account.supabase,
  });

  if (result.error || !result.data) {
    return createApiErrorResponse(
      "NOT_FOUND",
      result.error?.message || "Flashcards not found.",
      404
    );
  }

  return Response.json(result.data);
}
