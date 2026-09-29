import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createFixtureSummary,
  structuredSummarySchema,
} from "@/lib/ai/durable-generation";
import { isQuestionDuplicate } from "@/lib/ai/gemini-study-pack";
import { POST as handleJobPost } from "@/app/api/generate/job/route";
import * as auth from "@/lib/supabase/authorization";

describe("Phase 4: Quiz, Summary, and Source-Processing Strategy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Quiz Choice, Answer, and Cross-Batch Deduplication", () => {
    it("detects exact duplicate prompt strings", () => {
      const candidate = { prompt: "What is the powerhouse of the cell?", answer: "mitochondria" };
      const existing = [{ prompt: "what is the powerhouse of the cell?", answer: "mitochondria" }];
      expect(isQuestionDuplicate(candidate, existing)).toBe(true);
    });

    it("detects semantically overlapping questions with identical answer", () => {
      const candidate = {
        prompt: "What organelle generates ATP cellular energy?",
        answer: "mitochondria",
      };
      const existing = [
        {
          prompt: "What organelle produces ATP cellular energy?",
          answer: "mitochondria",
        },
      ];
      expect(isQuestionDuplicate(candidate, existing)).toBe(true);
    });

    it("allows different questions with different answers", () => {
      const candidate = {
        prompt: "Which organelle contains chromosomal DNA?",
        answer: "nucleus",
      };
      const existing = [
        {
          prompt: "What organelle produces ATP cellular energy?",
          answer: "mitochondria",
        },
      ];
      expect(isQuestionDuplicate(candidate, existing)).toBe(false);
    });
  });

  describe("2. Summary Schema Integrity and Chunk-Reduce Boundary", () => {
    it("generates and parses schema-compliant structured summary", () => {
      const summary = createFixtureSummary(
        "Photosynthesis Overview",
        "Photosynthesis converts light into chemical energy. Chlorophyll absorbs solar radiation. Plants generate glucose and release oxygen."
      );

      const parsed = structuredSummarySchema.safeParse(summary);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.overview.length).toBeGreaterThanOrEqual(10);
        expect(parsed.data.keyConcepts.length).toBeGreaterThanOrEqual(1);
        expect(parsed.data.remember.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("3. Preprocessing Separation: Distinct Document Extraction Errors", () => {
    it("returns 404 DOCUMENT_NOT_FOUND when referenced PDF is missing", async () => {
      vi.spyOn(auth, "getAuthenticatedRequestContext").mockResolvedValue({
        userId: "user-test",
        supabase: {
          rpc: vi.fn().mockImplementation((name) => {
            if (name === "get_source_document") {
              return Promise.resolve({ data: null, error: null });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        },
      } as unknown as auth.AuthenticatedRequestContext);

      const req = new Request("http://localhost:3000/api/generate/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "My Lecture PDF",
          documentId: "11111111-1111-4111-8111-111111111111",
          sourceType: "pdf",
          artifactKind: "quiz",
        }),
      });

      const res = await handleJobPost(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.code).toBe("DOCUMENT_NOT_FOUND");
    });

    it("returns 422 EXTRACTION_FAILED when PDF extraction yielded insufficient text", async () => {
      vi.spyOn(auth, "getAuthenticatedRequestContext").mockResolvedValue({
        userId: "user-test",
        supabase: {
          rpc: vi.fn().mockImplementation((name) => {
            if (name === "get_source_document") {
              return Promise.resolve({
                data: { extractedText: "Too short" },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        },
      } as unknown as auth.AuthenticatedRequestContext);

      const req = new Request("http://localhost:3000/api/generate/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "My Scanned PDF",
          documentId: "11111111-1111-4111-8111-111111111111",
          sourceType: "pdf",
          artifactKind: "quiz",
        }),
      });

      const res = await handleJobPost(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe("EXTRACTION_FAILED");
      expect(json.error).toContain("PDF text extraction produced insufficient readable text");
    });

    it("returns 422 EXTRACTION_FAILED when Scan OCR yielded insufficient text", async () => {
      vi.spyOn(auth, "getAuthenticatedRequestContext").mockResolvedValue({
        userId: "user-test",
        supabase: {
          rpc: vi.fn().mockImplementation((name) => {
            if (name === "get_scan_document") {
              return Promise.resolve({
                data: { title: "Unclear Scan", pages: [{ extractedText: "" }] },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        },
      } as unknown as auth.AuthenticatedRequestContext);

      const req = new Request("http://localhost:3000/api/generate/job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Biology Handwritten Notes",
          documentId: "22222222-2222-4222-8222-222222222222",
          sourceType: "scan",
          artifactKind: "flashcards",
        }),
      });

      const res = await handleJobPost(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.code).toBe("EXTRACTION_FAILED");
      expect(json.error).toContain("Scan OCR extraction produced insufficient readable text");
    });
  });
});
