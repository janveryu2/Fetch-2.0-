import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to view scan documents.",
      401
    );
  }

  const { id } = await params;
  if (!id) {
    return createApiErrorResponse("INVALID_REQUEST", "Missing scan document ID.", 400);
  }

  const { data, error } = await account.supabase.rpc("get_scan_document", {
    p_document_id: id,
  });

  if (error || !data) {
    return createApiErrorResponse("NOT_FOUND", "Scan document not found.", 404);
  }

  return Response.json(data);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to update scan documents.",
      401
    );
  }

  const { id } = await params;
  if (!id) {
    return createApiErrorResponse("INVALID_REQUEST", "Missing scan document ID.", 400);
  }

  let body: { combinedText?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("INVALID_REQUEST", "Invalid JSON body.", 400);
  }

  if (typeof body.combinedText !== "string") {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Field combinedText must be a string.",
      400
    );
  }

  const { data, error } = await account.supabase.rpc(
    "update_scan_document_text",
    {
      p_document_id: id,
      p_combined_text: body.combinedText,
      p_status: body.status || "extracted",
    }
  );

  if (error) {
    return createApiErrorResponse("INVALID_REQUEST", error.message, 400);
  }

  return Response.json(data);
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to delete scan documents.",
      401
    );
  }

  const { id } = await params;
  if (!id) {
    return createApiErrorResponse("INVALID_REQUEST", "Missing scan document ID.", 400);
  }

  const { data, error } = await account.supabase.rpc("delete_scan_document", {
    p_document_id: id,
  });

  if (error || !data) {
    return createApiErrorResponse("NOT_FOUND", "Scan document not found.", 404);
  }

  const storagePaths: string[] = data.storagePaths || [];

  // Cleanup physical files from private study-scans bucket
  if (storagePaths.length > 0) {
    const { error: storageError } = await account.supabase.storage
      .from("study-scans")
      .remove(storagePaths);

    if (storageError) {
      console.error("Storage delete warning for paths:", storagePaths, storageError.message);
    }
  }

  return Response.json({
    id,
    deleted: true,
    deletedPaths: storagePaths,
  });
}
