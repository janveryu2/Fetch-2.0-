import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty").max(4000, "Message too long"),
  clientMessageId: z.string().min(1).max(128).optional(),
});

interface RouteParams {
  params: Promise<{ conversationId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid conversation ID.", 400);
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const beforeParam = url.searchParams.get("before");

  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  const before = beforeParam ? new Date(beforeParam).toISOString() : null;

  const { data, error } = await context.supabase.rpc("list_direct_messages", {
    p_conversation_id: conversationId,
    p_limit: isNaN(limit) ? 50 : limit,
    p_before: before,
  });

  if (error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      error.message || "Failed to load messages.",
      error.message?.includes("Not authorized") ? 403 : 500
    );
  }

  return Response.json({ messages: data ?? [] });
}

export async function POST(request: Request, { params }: RouteParams) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { conversationId } = await params;
  if (!z.string().uuid().safeParse(conversationId).success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid conversation ID.", 400);
  }

  const json = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(json);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message || "Invalid message.";
    return createApiErrorResponse("INVALID_REQUEST", errorMsg, 400);
  }

  const { data, error } = await context.supabase.rpc("send_direct_message", {
    p_conversation_id: conversationId,
    p_body: parsed.data.body,
    p_client_message_id: parsed.data.clientMessageId ?? null,
  });

  if (error) {
    const isAuthErr = error.message?.includes("Not authorized");
    return createApiErrorResponse(
      "INVALID_REQUEST",
      error.message,
      isAuthErr ? 403 : 400
    );
  }

  return Response.json({ message: data }, { status: 201 });
}
