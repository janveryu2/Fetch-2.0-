import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ username: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to view student profiles.",
      401
    );
  }

  const { username } = await params;
  if (!username) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Username is required.",
      400
    );
  }

  const { data, error } = await account.supabase.rpc("get_friend_profile", {
    p_username: username,
  });

  if (error || !data) {
    return createApiErrorResponse(
      "NOT_FOUND",
      "Profile not found or access denied.",
      404
    );
  }

  return Response.json({ profile: data });
}
