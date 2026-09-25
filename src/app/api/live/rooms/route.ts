import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const createRoomSchema = z.object({
  packId: z.string().uuid(),
});

export async function POST(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", "Valid pack ID required.", 400);
  }

  const { data, error } = await context.supabase.rpc("create_live_room", {
    p_pack_id: parsed.data.packId,
  });

  if (error) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      error.message || "Failed to create live room.",
      400
    );
  }

  return Response.json(data, { status: 201 });
}
