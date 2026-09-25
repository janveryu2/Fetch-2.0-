import { describe, expect, it } from "vitest";
import {
  validatePdfMagicBytes,
  parsePdfBuffer,
  MAX_PDF_SIZE_BYTES,
} from "@/lib/pdf/pdf-parser";

describe("PDF Parser & Validation", () => {
  it("validates PDF magic bytes (%PDF)", () => {
    const validBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4
    expect(validatePdfMagicBytes(validBytes)).toBe(true);

    const invalidBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header
    expect(validatePdfMagicBytes(invalidBytes)).toBe(false);

    const emptyBytes = new Uint8Array([]);
    expect(validatePdfMagicBytes(emptyBytes)).toBe(false);
  });

  it("rejects files exceeding 10 MiB limit", async () => {
    const oversizedBuffer = new Uint8Array(MAX_PDF_SIZE_BYTES + 1);
    await expect(parsePdfBuffer(oversizedBuffer)).rejects.toThrow(
      "exceeds the 10 MiB size limit"
    );
  });

  it("rejects files with invalid PDF magic bytes", async () => {
    const invalidBuffer = new Uint8Array([1, 2, 3, 4, 5]);
    await expect(parsePdfBuffer(invalidBuffer)).rejects.toThrow(
      "The uploaded file does not begin with standard PDF header bytes"
    );
  });
});
