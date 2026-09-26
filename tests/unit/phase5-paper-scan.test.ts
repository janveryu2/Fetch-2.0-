import { describe, expect, it, beforeEach, vi } from "vitest";

const mockGetAuth = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
}));

// Mock GeminiOcrService
const mockExtractPageText = vi.fn();
vi.mock("@/lib/scan/ocr-service", () => ({
  GeminiOcrService: class {
    extractPageText = mockExtractPageText;
  },
}));

import { POST as handleUpload } from "@/app/api/scan/upload/route";
import { POST as handleExtract } from "@/app/api/scan/extract/route";
import {
  PATCH as handlePatchDoc,
  DELETE as handleDeleteDoc,
} from "@/app/api/scan/documents/[id]/route";
import { POST as handleReorder } from "@/app/api/scan/reorder/route";

describe("Phase 5: Physical-Paper Scan Intake", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
    mockExtractPageText.mockReset();
  });

  describe("POST /api/scan/upload", () => {
    it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const req = new Request("http://localhost/api/scan/upload", { method: "POST" });
      const res = await handleUpload(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("AUTH_REQUIRED");
    });

    it("returns 400 INVALID_REQUEST when no file is present", async () => {
      mockGetAuth.mockResolvedValue({ userId: "u-1", supabase: {} });
      const formData = new FormData();
      const req = new Request("http://localhost/api/scan/upload", {
        method: "POST",
        body: formData,
      });
      const res = await handleUpload(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 INVALID_SOURCE for HEIC images with explicit notice", async () => {
      mockGetAuth.mockResolvedValue({ userId: "u-1", supabase: {} });
      const formData = new FormData();
      const heicBlob = new Blob(["fake-heic"], { type: "image/heic" });
      formData.append("file", heicBlob, "notes.heic");

      const req = new Request("http://localhost/api/scan/upload", {
        method: "POST",
        body: formData,
      });
      const res = await handleUpload(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_SOURCE");
      expect(body.error).toContain("HEIC images are not currently supported");
    });

    it("returns 400 INVALID_SOURCE for files exceeding 5 MiB", async () => {
      mockGetAuth.mockResolvedValue({ userId: "u-1", supabase: {} });
      const formData = new FormData();
      // 5.5 MiB buffer
      const largeBlob = new Blob([new Uint8Array(5.5 * 1024 * 1024)], {
        type: "image/jpeg",
      });
      formData.append("file", largeBlob, "large.jpg");

      const req = new Request("http://localhost/api/scan/upload", {
        method: "POST",
        body: formData,
      });
      const res = await handleUpload(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_SOURCE");
      expect(body.error).toContain("5 MiB");
    });

    it("successfully uploads JPEG image to study-scans and registers page", async () => {
      const mockUpload = vi.fn().mockResolvedValue({ error: null });
      const mockRpc = vi.fn().mockImplementation((name, args) => {
        if (name === "create_scan_document") {
          return Promise.resolve({ data: { id: "doc-123", status: "draft" }, error: null });
        }
        if (name === "register_scan_page") {
          return Promise.resolve({
            data: { id: "page-1", position: args.p_position, pageCount: 1 },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-123",
        supabase: {
          storage: { from: () => ({ upload: mockUpload }) },
          rpc: mockRpc,
        },
      });

      const formData = new FormData();
      const imgBlob = new Blob(["jpeg-content"], { type: "image/jpeg" });
      formData.append("file", imgBlob, "notes.jpg");
      formData.append("position", "0");

      const req = new Request("http://localhost/api/scan/upload", {
        method: "POST",
        body: formData,
      });
      const res = await handleUpload(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.documentId).toBe("doc-123");
      expect(body.pageId).toBe("page-1");
      expect(body.position).toBe(0);
      expect(mockUpload).toHaveBeenCalled();
    });
  });

  describe("POST /api/scan/extract", () => {
    it("returns 401 when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const req = new Request("http://localhost/api/scan/extract", {
        method: "POST",
        body: JSON.stringify({ documentId: "doc-123" }),
      });
      const res = await handleExtract(req);
      expect(res.status).toBe(401);
    });

    it("returns 404 when scan document is not found", async () => {
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: {
          rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("Not found") }),
        },
      });
      const req = new Request("http://localhost/api/scan/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "nonexistent" }),
      });
      const res = await handleExtract(req);
      expect(res.status).toBe(404);
    });

    it("extracts text from ordered pages and aggregates combined text", async () => {
      const mockDoc = {
        id: "doc-123",
        pages: [
          {
            id: "p-1",
            position: 0,
            storagePath: "u-1/doc-123/page-0.jpg",
            mimeType: "image/jpeg",
          },
          {
            id: "p-2",
            position: 1,
            storagePath: "u-1/doc-123/page-1.png",
            mimeType: "image/png",
          },
        ],
      };

      const mockDownload = vi.fn().mockResolvedValue({
        data: new Blob(["img-bytes"]),
        error: null,
      });

      const mockRpc = vi.fn().mockImplementation((name) => {
        if (name === "get_scan_document") {
          return Promise.resolve({ data: mockDoc, error: null });
        }
        if (name === "update_scan_page_text") {
          return Promise.resolve({ data: { success: true }, error: null });
        }
        if (name === "update_scan_document_text") {
          return Promise.resolve({ data: { success: true }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: {
          storage: { from: () => ({ download: mockDownload }) },
          rpc: mockRpc,
        },
      });

      mockExtractPageText
        .mockResolvedValueOnce({
          text: "Cellular respiration occurs in mitochondria.",
          qualityFlag: "ok",
        })
        .mockResolvedValueOnce({
          text: "ATP is produced via oxidative phosphorylation.",
          qualityFlag: "ok",
        });

      const req = new Request("http://localhost/api/scan/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: "doc-123" }),
      });

      const res = await handleExtract(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("extracted");
      expect(body.combinedText).toContain("Cellular respiration");
      expect(body.combinedText).toContain("ATP is produced");
      expect(body.pages).toHaveLength(2);
    });
  });

  describe("PATCH /api/scan/documents/[id] & Flow C (Edited Text Provenance)", () => {
    it("updates scan document with human-reviewed edited text", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { id: "doc-123", status: "extracted", characterCount: 120 },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const correctedText =
        "The mitochondria is the powerhouse of the cell. Human edited and verified notes.";
      const req = new Request("http://localhost/api/scan/documents/doc-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ combinedText: correctedText }),
      });

      const res = await handlePatchDoc(req, {
        params: Promise.resolve({ id: "doc-123" }),
      });

      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("update_scan_document_text", {
        p_document_id: "doc-123",
        p_combined_text: correctedText,
        p_status: "extracted",
      });
    });
  });

  describe("DELETE /api/scan/documents/[id]", () => {
    it("deletes document and purges physical files from study-scans bucket", async () => {
      const mockRemove = vi.fn().mockResolvedValue({ error: null });
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          id: "doc-123",
          storagePaths: ["u-1/doc-123/page-0.jpg", "u-1/doc-123/page-1.jpg"],
        },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: {
          rpc: mockRpc,
          storage: { from: () => ({ remove: mockRemove }) },
        },
      });

      const req = new Request("http://localhost/api/scan/documents/doc-123", {
        method: "DELETE",
      });

      const res = await handleDeleteDoc(req, {
        params: Promise.resolve({ id: "doc-123" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(true);
      expect(mockRemove).toHaveBeenCalledWith([
        "u-1/doc-123/page-0.jpg",
        "u-1/doc-123/page-1.jpg",
      ]);
    });
  });

  describe("POST /api/scan/reorder", () => {
    it("updates scan page order via RPC", async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { id: "doc-123", pageCount: 2 },
        error: null,
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/scan/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: "doc-123",
          pageOrder: ["page-2", "page-1"],
        }),
      });

      const res = await handleReorder(req);
      expect(res.status).toBe(200);
      expect(mockRpc).toHaveBeenCalledWith("reorder_scan_pages", {
        p_document_id: "doc-123",
        p_page_order: ["page-2", "page-1"],
      });
    });
  });
});
