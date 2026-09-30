import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const joinRoomSchema = z.union([
  z.object({ joinCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/) }),
  z.object({ roomId: z.string().uuid() }),
]);

export async function POST(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const parsed = joinRoomSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid room code format.", 400);
  }

  const { data, error } = "roomId" in parsed.data
    ? await context.supabase.rpc("join_public_live_room", { p_room_id: parsed.data.roomId })
    : await context.supabase.rpc("join_live_room", { p_join_code: parsed.data.joinCode });

  if (error) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      error.message || "Failed to join room.",
      400
    );
  }

  return Response.json(data, { status: 200 });
}
