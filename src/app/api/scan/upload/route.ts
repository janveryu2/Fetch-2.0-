import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

const MAX_PAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB per page
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

export async function POST(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to upload scanned notes and create StudyPacks.",
      401
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Invalid multipart form data.",
      400
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "No image file uploaded. Please select a JPEG or PNG image.",
      400
    );
  }

  const fileName = (file instanceof File ? file.name : "scan.jpg").toLowerCase();

  // Explicit check for unsupported HEIC format
  if (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif")
  ) {
    return createApiErrorResponse(
      "INVALID_SOURCE",
      "HEIC images are not currently supported. Please take or convert photos in JPEG or PNG format.",
      400
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return createApiErrorResponse(
      "INVALID_SOURCE",
      `Unsupported file type (${file.type || "unknown"}). Only JPEG and PNG images are supported.`,
      400
    );
  }

  if (file.size > MAX_PAGE_SIZE_BYTES) {
    return createApiErrorResponse(
      "INVALID_SOURCE",
      `Image exceeds the 5 MiB size limit per page (${(file.size / (1024 * 1024)).toFixed(1)} MiB).`,
      400
    );
  }

  let documentId = formData.get("documentId")?.toString();

  // If documentId was not supplied, create a new scan document record
  if (!documentId) {
    const { data: docData, error: docError } = await account.supabase.rpc(
      "create_scan_document"
    );
    if (docError || !docData?.id) {
      return createApiErrorResponse(
        "STORAGE_UNAVAILABLE",
        "Failed to initialize scan document record.",
        500
      );
    }
    documentId = docData.id;
  }

  const positionStr = formData.get("position")?.toString();
  const position = positionStr !== undefined ? parseInt(positionStr, 10) : 0;

  if (isNaN(position) || position < 0 || position >= 5) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Position must be an integer between 0 and 4.",
      400
    );
  }

  const ext = file.type === "image/png" ? "png" : "jpg";
  const storagePath = `${account.userId}/${documentId}/page-${position}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  // Upload to private Supabase Storage bucket 'study-scans'
  const { error: uploadError } = await account.supabase.storage
    .from("study-scans")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    console.error("Scan Storage upload error:", uploadError.message);
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Unable to store scan in private storage. Please retry.",
      503
    );
  }

  // Register scan page in database
  const { data: pageData, error: pageError } = await account.supabase.rpc(
    "register_scan_page",
    {
      p_document_id: documentId,
      p_position: position,
      p_storage_path: storagePath,
      p_mime_type: file.type,
      p_file_size: file.size,
      p_dimensions: null,
    }
  );

  if (pageError) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      pageError.message || "Failed to register scan page.",
      400
    );
  }

  return Response.json({
    documentId,
    pageId: pageData?.id,
    position: pageData?.position ?? position,
    pageCount: pageData?.pageCount,
    storagePath,
  });
}
