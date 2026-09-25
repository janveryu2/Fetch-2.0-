import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const actionSchema = z.object({
  action: z.enum(["accept", "decline"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { requestId } = await params;
  if (!z.string().uuid().safeParse(requestId).success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid request ID.", 400);
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Action must be 'accept' or 'decline'.",
      400
    );
  }

  const { data, error } = await context.supabase.rpc("respond_friend_request", {
    p_request_id: requestId,
    p_action: parsed.data.action,
  });

  if (error) {
    return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
  }

  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { requestId } = await params;
  if (!z.string().uuid().safeParse(requestId).success) {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid request ID.", 400);
  }

  const { data, error } = await context.supabase.rpc("cancel_friend_request", {
    p_request_id: requestId,
  });

  if (error) {
    return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
  }

  return Response.json(data);
}
