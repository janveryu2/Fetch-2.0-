import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";
import { GeminiOcrService } from "@/lib/scan/ocr-service";

export async function POST(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to process paper scans.",
      401
    );
  }

  let body: { documentId?: string };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Invalid JSON payload.",
      400
    );
  }

  const { documentId } = body;
  if (!documentId) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Missing documentId parameter.",
      400
    );
  }

  // Retrieve scan document and its ordered pages
  const { data: docData, error: docError } = await account.supabase.rpc(
    "get_scan_document",
    { p_document_id: documentId }
  );

  if (docError || !docData) {
    return createApiErrorResponse(
      "NOT_FOUND",
      "Scan document not found or access denied.",
      404
    );
  }

  const pages = docData.pages || [];
  if (pages.length === 0) {
    return createApiErrorResponse(
      "INVALID_SOURCE",
      "No scan pages found to extract.",
      400
    );
  }

  const ocrService = new GeminiOcrService();
  const extractedPages: Array<{
    id: string;
    position: number;
    extractedText: string;
    qualityFlag: string;
  }> = [];

  for (const page of pages) {
    try {
      // Download image data from private storage bucket
      const { data: fileBlob, error: downloadError } = await account.supabase.storage
        .from("study-scans")
        .download(page.storagePath);

      if (downloadError || !fileBlob) {
        console.error("Storage download error for scan page:", page.storagePath);
        extractedPages.push({
          id: page.id,
          position: page.position,
          extractedText: "",
          qualityFlag: "unreadable",
        });
        continue;
      }

      const buffer = new Uint8Array(await fileBlob.arrayBuffer());
      const ocrResult = await ocrService.extractPageText(
        buffer,
        page.mimeType as "image/jpeg" | "image/png"
      );

      // Save extracted text and quality flag to page record
      await account.supabase.rpc("update_scan_page_text", {
        p_page_id: page.id,
        p_extracted_text: ocrResult.text,
        p_quality_flag: ocrResult.qualityFlag,
      });

      extractedPages.push({
        id: page.id,
        position: page.position,
        extractedText: ocrResult.text,
        qualityFlag: ocrResult.qualityFlag,
      });
    } catch (err) {
      console.error(`OCR extraction failed for page ${page.position}:`, err);
      await account.supabase.rpc("update_scan_page_text", {
        p_page_id: page.id,
        p_extracted_text: "",
        p_quality_flag: "unreadable",
      });

      extractedPages.push({
        id: page.id,
        position: page.position,
        extractedText: "",
        qualityFlag: "unreadable",
      });
    }
  }

  // Combine page texts into a unified document text
  const combinedParts: string[] = [];
  for (const page of extractedPages) {
    if (page.extractedText.trim().length > 0) {
      combinedParts.push(`--- Page ${page.position + 1} ---\n${page.extractedText.trim()}`);
    }
  }

  const combinedText = combinedParts.join("\n\n");

  await account.supabase.rpc("update_scan_document_text", {
    p_document_id: documentId,
    p_combined_text: combinedText,
    p_status: "extracted",
  });

  return Response.json({
    documentId,
    status: "extracted",
    combinedText,
    pages: extractedPages,
  });
}
