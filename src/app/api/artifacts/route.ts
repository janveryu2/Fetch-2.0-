import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const url = new URL(request.url);
  const packId = url.searchParams.get("packId");

  const { data, error } = await context.supabase.rpc("list_study_artifacts", {
    p_pack_id: packId || null,
  });

  if (error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Failed to load study artifacts.",
      503
    );
  }

  return Response.json({ artifacts: data ?? [] });
}
