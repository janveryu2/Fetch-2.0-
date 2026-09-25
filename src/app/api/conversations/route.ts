import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const createConversationSchema = z.object({
  participantId: z.string().uuid(),
});

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { data, error } = await context.supabase.rpc("list_user_conversations");
  if (error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Failed to load conversations.",
      503
    );
  }

  return Response.json({ conversations: data ?? [] });
}

export async function POST(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const body = await request.json().catch(() => null);
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid participant ID.", 400);
  }

  if (parsed.data.participantId === context.userId) {
    return createApiErrorResponse("INVALID_REQUEST", "Cannot start a conversation with yourself.", 400);
  }

  const { data, error } = await context.supabase.rpc("get_or_create_direct_conversation", {
    p_participant_id: parsed.data.participantId,
  });

  if (error) {
    return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
  }

  return Response.json({ conversation: data }, { status: 201 });
}
