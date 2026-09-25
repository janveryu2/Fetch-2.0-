import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { data, error } = await context.supabase.rpc("list_friends");
  if (error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Failed to load friends list.",
      503
    );
  }

  return Response.json({ friends: data ?? [] });
}
