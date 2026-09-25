import { createHash } from "node:crypto";
import { extractText } from "unpdf";

export const MAX_PDF_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_PDF_PAGES = 25;
export const MIN_PDF_CHARACTERS = 80;
export const MAX_PDF_CHARACTERS = 20_000;

export interface PdfParseResult {
  text: string;
  pageCount: number;
  contentHash: string;
}

export function validatePdfMagicBytes(buffer: Uint8Array): boolean {
  if (buffer.length < 4) return false;
  // %PDF in ASCII is 0x25, 0x50, 0x44, 0x46
  return (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  );
}

export async function parsePdfBuffer(
  buffer: Uint8Array
): Promise<PdfParseResult> {
  if (buffer.length > MAX_PDF_SIZE_BYTES) {
    throw new Error(
      `PDF file exceeds the 10 MiB size limit (${(buffer.length / (1024 * 1024)).toFixed(1)} MiB).`
    );
  }

  if (!validatePdfMagicBytes(buffer)) {
    throw new Error(
      "Invalid PDF file. The uploaded file does not begin with standard PDF header bytes."
    );
  }

  let totalPages = 0;
  let textParts: string[] = [];

  try {
    const result = await extractText(buffer);
    totalPages = result.totalPages;
    textParts = Array.isArray(result.text) ? result.text : [String(result.text || "")];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("password")) {
      throw new Error("Password-protected PDFs cannot be processed. Please upload an unlocked PDF.");
    }
    throw new Error(`Failed to extract text from PDF: ${message}`);
  }

  if (totalPages > MAX_PDF_PAGES) {
    throw new Error(
      `PDF has ${totalPages} pages, which exceeds the limit of ${MAX_PDF_PAGES} pages. Please upload a shorter chapter or document.`
    );
  }

  const combinedText = textParts
    .join("\n\n")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (combinedText.length < MIN_PDF_CHARACTERS) {
    throw new Error(
      `PDF contains insufficient selectable text (${combinedText.length} characters, minimum 80 required). Scanned documents without OCR cannot be processed.`
    );
  }

  // Bounded extraction to fit generator bounds
  const boundedText =
    combinedText.length > MAX_PDF_CHARACTERS
      ? combinedText.slice(0, MAX_PDF_CHARACTERS)
      : combinedText;

  const contentHash = createHash("sha256").update(buffer).digest("hex");

  return {
    text: boundedText,
    pageCount: totalPages,
    contentHash,
  };
}
