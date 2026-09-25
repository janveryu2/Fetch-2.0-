import { describe, expect, it, beforeEach, vi } from "vitest";

const mockGetAuth = vi.fn();
const mockPersist = vi.fn();
const mockReserve = vi.fn();
const mockCommit = vi.fn();
const mockRelease = vi.fn();
const mockReconstruct = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => mockGetAuth(),
}));

vi.mock("@/lib/server/privileged-supabase", () => ({
  persistStudyPackServer: (args: unknown) => mockPersist(args),
  reserveAiGenerationServer: (args: unknown) => mockReserve(args),
  commitAiGenerationServer: (args: unknown) => mockCommit(args),
  releaseAiGenerationServer: (args: unknown) => mockRelease(args),
  reconstructCommittedStudyPack: (args: unknown) => mockReconstruct(args),
}));

import { POST as handleUpload } from "@/app/api/pdf/upload/route";
import { POST as handleGenerate } from "@/app/api/pdf/generate/route";

describe("PDF Upload & Generation API Routes", () => {
  beforeEach(() => {
    mockGetAuth.mockReset();
    mockPersist.mockReset();
    mockReserve.mockReset();
    mockCommit.mockReset();
    mockRelease.mockReset();
    mockReconstruct.mockReset();
  });

  describe("POST /api/pdf/upload", () => {
    it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const req = new Request("http://localhost/api/pdf/upload", {
        method: "POST",
      });
      const res = await handleUpload(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("AUTH_REQUIRED");
    });

    it("returns 400 INVALID_REQUEST when no file is uploaded", async () => {
      mockGetAuth.mockResolvedValue({ userId: "u-1", supabase: {} });
      const formData = new FormData();
      const req = new Request("http://localhost/api/pdf/upload", {
        method: "POST",
        body: formData,
      });
      const res = await handleUpload(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe("INVALID_REQUEST");
    });
  });

  describe("POST /api/pdf/generate", () => {
    it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
      mockGetAuth.mockResolvedValue(null);
      const req = new Request("http://localhost/api/pdf/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docId: "11111111-1111-4111-8111-111111111111",
          title: "Bio PDF",
          count: 5,
        }),
      });
      const res = await handleGenerate(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe("AUTH_REQUIRED");
    });

    it("returns 404 NOT_FOUND if document does not exist or has no text", async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      const req = new Request("http://localhost/api/pdf/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docId: "11111111-1111-4111-8111-111111111111",
          title: "Bio PDF",
          count: 5,
        }),
      });
      const res = await handleGenerate(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.code).toBe("NOT_FOUND");
    });

    it("reserves quota, persists PDF StudyPack, and commits quota successfully", async () => {
      const longText =
        "Photosynthesis is a process used by plants and other organisms to convert light energy into chemical energy that, through cellular respiration, can later be released to fuel the organism's activities.";

      const mockRpc = vi.fn().mockImplementation((name) => {
        if (name === "get_source_document") {
          return Promise.resolve({
            data: {
              id: "11111111-1111-4111-8111-111111111111",
              fileName: "photosynthesis.pdf",
              extractedText: longText,
              pageCount: 3,
            },
            error: null,
          });
        }
        if (name === "update_source_document") {
          return Promise.resolve({ data: { status: "processed" }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      });

      mockGetAuth.mockResolvedValue({
        userId: "u-1",
        supabase: { rpc: mockRpc },
      });

      mockReserve.mockResolvedValue({
        data: {
          status: "reserved",
          fencingToken: 10,
          monthKey: "2026-09",
          allowance: 15,
          remaining: 14,
        },
        error: null,
      });

      mockPersist.mockResolvedValue({
        data: {
          id: "pack-pdf-1",
          questions: [{ id: "q1", prompt: "What is photosynthesis?" }],
        },
        error: null,
      });

      mockCommit.mockResolvedValue({
        data: { status: "committed", packId: "pack-pdf-1" },
        error: null,
      });

      const req = new Request("http://localhost/api/pdf/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          docId: "11111111-1111-4111-8111-111111111111",
          title: "Photosynthesis Notes",
          count: 3,
          requestId: "22222222-2222-4222-8222-222222222222",
        }),
      });

      const res = await handleGenerate(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.packId).toBe("pack-pdf-1");

      expect(mockReserve).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "u-1",
          requestId: "22222222-2222-4222-8222-222222222222",
        })
      );

      expect(mockPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "u-1",
          sourceType: "pdf",
          title: "Photosynthesis Notes",
        })
      );

      expect(mockCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: "u-1",
          requestId: "22222222-2222-4222-8222-222222222222",
          fencingToken: 10,
          packId: "pack-pdf-1",
        })
      );
    });
  });
});
