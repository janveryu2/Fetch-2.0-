import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { parsePdfBuffer, MAX_PDF_SIZE_BYTES } from "@/lib/pdf/pdf-parser";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function POST(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to upload PDF documents and create StudyPacks.",
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
      "No PDF file uploaded. Please select a PDF file.",
      400
    );
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return createApiErrorResponse(
      "INVALID_SOURCE",
      `File exceeds the 10 MiB size limit (${(file.size / (1024 * 1024)).toFixed(1)} MiB).`,
      400
    );
  }

  const fileName = (file instanceof File ? file.name : "document.pdf")
    .replace(/[^\w\s.-]/g, "_")
    .slice(0, 100);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  let parsed;
  try {
    parsed = await parsePdfBuffer(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to process PDF.";
    return createApiErrorResponse("INVALID_SOURCE", message, 400);
  }

  const docId = crypto.randomUUID();
  const storagePath = `${account.userId}/${docId}.pdf`;

  // Upload to private Supabase Storage bucket 'study-sources'
  const { error: uploadError } = await account.supabase.storage
    .from("study-sources")
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("Storage upload error", uploadError.message);
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Unable to store PDF in private storage. Please retry.",
      503
    );
  }

  // Register document metadata in database
  const { data: docData, error: dbError } = await account.supabase.rpc(
    "register_source_document",
    {
      p_storage_path: storagePath,
      p_file_name: fileName,
      p_file_size: file.size,
      p_content_hash: parsed.contentHash,
    }
  );

  const registeredId = (docData as { id?: string })?.id || docId;

  // Save the extracted text so subsequent generation can reference it
  if (!dbError) {
    await account.supabase.rpc("update_source_document", {
      p_doc_id: registeredId,
      p_extraction_status: "extracted",
      p_extracted_text: parsed.text,
      p_page_count: parsed.pageCount,
    });
  }

  return Response.json({
    docId: registeredId,
    fileName,
    pageCount: parsed.pageCount,
    characterCount: parsed.text.length,
    textPreview: parsed.text.slice(0, 300) + (parsed.text.length > 300 ? "..." : ""),
    text: parsed.text,
  });
}
