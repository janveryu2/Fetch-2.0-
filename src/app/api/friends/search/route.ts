import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";

  if (q.trim().length < 2) {
    return Response.json({ results: [] });
  }

  const { data, error } = await context.supabase.rpc("search_users", {
    p_query: q.trim(),
    p_limit: 10,
  });

  if (error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "User search failed.",
      500
    );
  }

  return Response.json({ results: data ?? [] });
}
