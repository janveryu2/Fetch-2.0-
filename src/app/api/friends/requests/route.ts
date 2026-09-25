import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const sendRequestSchema = z.object({
  recipientId: z.string().uuid(),
});

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { data, error } = await context.supabase.rpc("list_friend_requests");
  if (error) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Failed to load friend requests.",
      503
    );
  }

  return Response.json(data ?? { incoming: [], outgoing: [] });
}

export async function POST(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const parsed = sendRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid recipient ID.", 400);
  }

  const { data, error } = await context.supabase.rpc("send_friend_request", {
    p_recipient_id: parsed.data.recipientId,
  });

  if (error) {
    return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
  }

  return Response.json(data, { status: 201 });
}
