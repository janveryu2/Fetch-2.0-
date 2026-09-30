import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const createRoomSchema = z.object({
  packId: z.string().uuid(),
  artifactId: z.string().uuid().optional(),
  visibility: z.enum(["public", "private"]).default("private"),
  maxPlayers: z.union([z.literal(2), z.literal(4), z.literal(6)]).default(4),
});

export async function POST(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", "Choose a valid quiz, room privacy, and player limit.", 400);
  }

  const rpcParams = {
    p_pack_id: parsed.data.packId,
    p_artifact_id: parsed.data.artifactId ?? null,
    p_visibility: parsed.data.visibility,
    p_max_players: parsed.data.maxPlayers,
  };

  const { data, error } = await context.supabase.rpc("create_live_room_configured", rpcParams);

  if (error) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      error.message || "Failed to create live room.",
      400
    );
  }

  return Response.json(data, { status: 201 });
}

export async function GET(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const period = z.enum(["today", "week", "all"]).safeParse(new URL(request.url).searchParams.get("period") ?? "week");
  if (!period.success) return createApiErrorResponse("INVALID_REQUEST", "Invalid leaderboard period.", 400);
  const { data, error } = await context.supabase.rpc("get_live_home", { p_period: period.data });
  if (error) return createApiErrorResponse("INTERNAL_ERROR", "Unable to load live rooms. Try again.", 500);
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
