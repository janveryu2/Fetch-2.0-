import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks for database interactions in isolated unit tests
const mockClaimStep = vi.fn();
const mockHeartbeat = vi.fn();
const mockCheckpoint = vi.fn();
const mockGetRunnerData = vi.fn();
const mockFinalize = vi.fn();
const mockRelease = vi.fn();

vi.mock("@/lib/server/privileged-supabase", () => ({
  claimGenerationStepServer: (args: unknown) => mockClaimStep(args),
  heartbeatGenerationJobServer: (args: unknown) => mockHeartbeat(args),
  checkpointGenerationBatchServer: (args: unknown) => mockCheckpoint(args),
  getGenerationJobForRunnerServer: (args: unknown) => mockGetRunnerData(args),
  atomicFinalizeGenerationJobServer: (args: unknown) => mockFinalize(args),
  releaseGenerationJobServer: (args: unknown) => mockRelease(args),
  getPrivilegedSupabaseClient: () => ({}),
}));

import { executeGenerationStep, runGenerationJob } from "@/lib/ai/durable-generation";
import { POST as internalStepHandler } from "@/app/api/internal/generation/step/route";

describe("Phase 1: Canonical Quota & Durable Generation Dispatch", () => {
  const sampleSource =
    "Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar. " +
    "Chloroplasts in plant cells contain chlorophyll which absorbs sunlight. The light-dependent reactions produce ATP and NADPH in the thylakoid membranes.";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Atomic Step Claims & Monotonic Fencing", () => {
    it("claims eligible job and receives monotonic fencing token", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-111",
          fencingToken: 1,
          leaseExpiresAt: new Date(Date.now() + 90000).toISOString(),
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-111",
            artifact_kind: "summary",
            requested_count: 1,
            title: "Photosynthesis",
            status: "in_progress",
          },
          sourceContent: sampleSource,
          batches: [],
        },
        error: null,
      });

      mockFinalize.mockResolvedValueOnce({
        data: {
          status: "completed",
          packId: "pack-111",
          artifactId: "artifact-111",
        },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-111", workerId: "worker-A" });

      expect(mockClaimStep).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-111",
          workerId: "worker-A",
        })
      );
      expect(result.success).toBe(true);
      expect(result.done).toBe(true);
      expect(result.packId).toBe("pack-111");
    });

    it("refuses claim when job is busy with an active unexpired lease", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: false,
          reason: "busy",
          leaseOwner: "worker-A",
        },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-111", workerId: "worker-B" });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("busy");
      expect(mockGetRunnerData).not.toHaveBeenCalled();
    });

    it("halts execution immediately when batch checkpoint reports fenced", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-222",
          fencingToken: 1,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-222",
            artifact_kind: "flashcards",
            requested_count: 15,
            title: "Cell Energy",
            status: "in_progress",
          },
          sourceContent: sampleSource,
          batches: [],
        },
        error: null,
      });

      mockHeartbeat.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      // Newer worker took over, so checkpoint returns fenced
      mockCheckpoint.mockResolvedValueOnce({
        data: { success: false, reason: "fenced" },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-222", workerId: "stale-worker" });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("fenced");
      expect(mockFinalize).not.toHaveBeenCalled();
    });
  });

  describe("2. Resume From Persisted Checkpoints", () => {
    it("skips already completed batches and processes only remaining batches", async () => {
      const existingBatchCards = [
        {
          front: "What is photosynthesis?",
          back: "Process converting sunlight into sugar",
          aliases: [],
          sourceQuote: "Photosynthesis is the process by which plants use sunlight",
        },
      ];

      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-333",
          fencingToken: 2,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-333",
            artifact_kind: "flashcards",
            requested_count: 25,
            title: "Photosynthesis",
            status: "in_progress",
          },
          sourceContent: sampleSource,
          batches: [
            {
              batchNumber: 1,
              status: "completed",
              acceptedQuestions: existingBatchCards,
            },
          ],
        },
        error: null,
      });

      mockHeartbeat.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      mockCheckpoint.mockResolvedValueOnce({
        data: { success: true, acceptedCount: 15 },
        error: null,
      });

      mockFinalize.mockResolvedValueOnce({
        data: { status: "completed", packId: "pack-333", artifactId: "art-333" },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-333", workerId: "resuming-worker" });

      expect(result.success).toBe(true);
      // Batch 1 was already completed, so batch 2 was processed
      expect(mockCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          batchNumber: 2,
        })
      );
    });
  });

  describe("3. Production Guard Against Missing Provider Key", () => {
    it("fails terminally without creating fake fixture cards when in production without GEMINI_API_KEY", async () => {
      const originalKey = process.env.GEMINI_API_KEY;

      try {
        vi.stubEnv("NODE_ENV", "production");
        delete process.env.GEMINI_API_KEY;

        mockClaimStep.mockResolvedValueOnce({
          data: {
            success: true,
            reason: "claimed",
            jobId: "job-prod-guard",
            fencingToken: 1,
          },
          error: null,
        });

        mockGetRunnerData.mockResolvedValueOnce({
          data: {
            job: {
              id: "job-prod-guard",
              artifact_kind: "flashcards",
              requested_count: 10,
              title: "Production Guard Test",
              status: "in_progress",
            },
            sourceContent: sampleSource,
            batches: [],
          },
          error: null,
        });

        mockRelease.mockResolvedValueOnce({
          data: { success: true, status: "failed" },
          error: null,
        });

        const result = await executeGenerationStep({ jobId: "job-prod-guard", workerId: "prod-worker" });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Missing Gemini provider key in production");
        expect(mockRelease).toHaveBeenCalledWith(
          expect.objectContaining({
            jobId: "job-prod-guard",
            cancelled: false,
            failureCode: "MISSING_PROVIDER_KEY",
          })
        );
      } finally {
        vi.unstubAllEnvs();
        if (originalKey) {
          process.env.GEMINI_API_KEY = originalKey;
        }
      }
    });
  });

  describe("4. Cancellation and Cleanup", () => {
    it("releases reservation and cancels job when cancel_requested is observed", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-cancelled",
          fencingToken: 1,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-cancelled",
            artifact_kind: "flashcards",
            requested_count: 10,
            title: "Cancelled Job",
            status: "in_progress",
            cancel_requested: true,
          },
          sourceContent: sampleSource,
          batches: [],
        },
        error: null,
      });

      mockRelease.mockResolvedValueOnce({
        data: { success: true, status: "cancelled" },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-cancelled" });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("cancelled");
      expect(mockRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-cancelled",
          cancelled: true,
          failureCode: "USER_CANCELLED",
        })
      );
    });
  });

  describe("5. Internal Step Worker Endpoint Authentication", () => {
    it("rejects unauthorized step requests without server secret", async () => {
      const originalSecret = process.env.FETCH_INTERNAL_WORKER_SECRET;
      process.env.FETCH_INTERNAL_WORKER_SECRET = "super-secret-test-key";

      try {
        const req = new Request("http://localhost:3000/api/internal/generation/step", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-fetch-worker-secret": "wrong-secret",
          },
          body: JSON.stringify({ jobId: "job-123" }),
        });

        const res = await internalStepHandler(req);
        expect(res.status).toBe(401);
      } finally {
        if (originalSecret) {
          process.env.FETCH_INTERNAL_WORKER_SECRET = originalSecret;
        } else {
          delete process.env.FETCH_INTERNAL_WORKER_SECRET;
        }
      }
    });

    it("accepts authorized step requests with valid secret header", async () => {
      const originalSecret = process.env.FETCH_INTERNAL_WORKER_SECRET;
      process.env.FETCH_INTERNAL_WORKER_SECRET = "super-secret-test-key";

      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: false,
          reason: "no_eligible_jobs",
        },
        error: null,
      });

      try {
        const req = new Request("http://localhost:3000/api/internal/generation/step", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-fetch-worker-secret": "super-secret-test-key",
          },
          body: JSON.stringify({}),
        });

        const res = await internalStepHandler(req);
        expect(res.status).toBe(400); // Because success: false, reason: no_eligible_jobs
        const body = await res.json();
        expect(body.reason).toBe("no_eligible_jobs");
      } finally {
        if (originalSecret) {
          process.env.FETCH_INTERNAL_WORKER_SECRET = originalSecret;
        } else {
          delete process.env.FETCH_INTERNAL_WORKER_SECRET;
        }
      }
    });
  });

  describe("6. Full Runner Execution via runGenerationJob", () => {
    it("runs steps sequentially until generation job reports completed", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-run-all",
          fencingToken: 1,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-run-all",
            artifact_kind: "summary",
            requested_count: 1,
            title: "Cell Summary",
            status: "in_progress",
          },
          sourceContent: sampleSource,
          batches: [],
        },
        error: null,
      });

      mockFinalize.mockResolvedValueOnce({
        data: { status: "completed", packId: "pack-all", artifactId: "art-all" },
        error: null,
      });

      const outcome = await runGenerationJob("job-run-all");
      expect(outcome.success).toBe(true);
      expect(outcome.packId).toBe("pack-all");
    });
  });
});

