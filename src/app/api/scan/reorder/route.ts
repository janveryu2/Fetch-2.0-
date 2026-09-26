import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function POST(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to reorder scan pages.",
      401
    );
  }

  let body: { documentId?: string; pageOrder?: string[] };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid JSON payload.", 400);
  }

  const { documentId, pageOrder } = body;
  if (!documentId || !Array.isArray(pageOrder) || pageOrder.length === 0) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Missing documentId or pageOrder array.",
      400
    );
  }

  const { data, error } = await account.supabase.rpc("reorder_scan_pages", {
    p_document_id: documentId,
    p_page_order: pageOrder,
  });

  if (error) {
    return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
  }

  return Response.json(data);
}
