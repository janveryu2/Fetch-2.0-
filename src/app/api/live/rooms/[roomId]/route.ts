import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ roomId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { roomId } = await params;
  if (!z.string().uuid().safeParse(roomId).success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid room ID.", 400);
  }

  const { data, error } = await context.supabase.rpc("get_live_room_state", {
    p_room_id: roomId,
  });

  if (error) {
    const isForbidden = error.message?.includes("Access denied");
    return createApiErrorResponse(
      isForbidden ? "FORBIDDEN" : "STORAGE_UNAVAILABLE",
      error.message || "Failed to load live room state.",
      isForbidden ? 403 : 500
    );
  }

  return Response.json(data);
}
