import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
  }),
  z.object({
    action: z.literal("advance"),
  }),
  z.object({
    action: z.literal("submit_answer"),
    questionIndex: z.number().int().min(0),
    selectedIndex: z.number().int().min(0),
  }),
]);

interface RouteParams {
  params: Promise<{ roomId: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { roomId } = await params;
  if (!z.string().uuid().safeParse(roomId).success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid room ID.", 400);
  }

  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid action payload.", 400);
  }

  const { action } = parsed.data;

  if (action === "start") {
    const { data, error } = await context.supabase.rpc("start_live_game", {
      p_room_id: roomId,
    });
    if (error) {
      return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
    }
    return Response.json(data);
  }

  if (action === "advance") {
    const { data, error } = await context.supabase.rpc("advance_live_question", {
      p_room_id: roomId,
    });
    if (error) {
      return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
    }
    return Response.json(data);
  }

  if (action === "submit_answer") {
    const { data, error } = await context.supabase.rpc("submit_live_answer", {
      p_room_id: roomId,
      p_question_index: parsed.data.questionIndex,
      p_selected_index: parsed.data.selectedIndex,
    });
    if (error) {
      return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
    }
    return Response.json(data);
  }

  return createApiErrorResponse("INVALID_REQUEST", "Unsupported action.", 400);
}
