import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ friendId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { friendId } = await params;
  if (!z.string().uuid().safeParse(friendId).success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid friend ID.", 400);
  }

  const { data, error } = await context.supabase.rpc("remove_friend", {
    p_friend_id: friendId,
  });

  if (error) {
    return createApiErrorResponse("STORAGE_UNAVAILABLE", error.message, 500);
  }

  return Response.json(data);
}
