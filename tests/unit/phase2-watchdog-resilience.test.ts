import { describe, it, expect, vi, beforeEach } from "vitest";

const mockClaimStep = vi.fn();
const mockHeartbeat = vi.fn();
const mockCheckpoint = vi.fn();
const mockGetRunnerData = vi.fn();
const mockFinalize = vi.fn();
const mockRelease = vi.fn();
const mockRecordRetry = vi.fn();
const mockSweep = vi.fn();

vi.mock("@/lib/server/privileged-supabase", () => ({
  claimGenerationStepServer: (args: unknown) => mockClaimStep(args),
  heartbeatGenerationJobServer: (args: unknown) => mockHeartbeat(args),
  checkpointGenerationBatchServer: (args: unknown) => mockCheckpoint(args),
  getGenerationJobForRunnerServer: (args: unknown) => mockGetRunnerData(args),
  atomicFinalizeGenerationJobServer: (args: unknown) => mockFinalize(args),
  releaseGenerationJobServer: (args: unknown) => mockRelease(args),
  recordGenerationRetryServer: (args: unknown) => mockRecordRetry(args),
  sweepGenerationJobsServer: (args: unknown) => mockSweep(args),
  getPrivilegedSupabaseClient: () => ({}),
}));

import { executeGenerationStep } from "@/lib/ai/durable-generation";

describe("Phase 2: Watchdog, Retries, Cancellation & Resilient Recovery", () => {
  const sampleSource =
    "Photosynthesis is the process by which plants use sunlight, water, and carbon dioxide to create oxygen and energy in the form of sugar. " +
    "Chloroplasts in plant cells contain chlorophyll which absorbs sunlight. The light-dependent reactions produce ATP and NADPH in the thylakoid membranes.";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Retry Classification and Bounded Backoff", () => {
    it("schedules a bounded retry on 429 rate limit without failing the job", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-rate-limit",
          fencingToken: 1,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-rate-limit",
            artifact_kind: "summary",
            requested_count: 1,
            title: "Photosynthesis",
            status: "in_progress",
            provider_attempts: 0,
          },
          sourceContent: sampleSource,
          batches: [],
        },
        error: null,
      });

      // Force an error during summary generation to simulate 429
      mockFinalize.mockRejectedValueOnce(new Error("Gemini rate limit exceeded (429 RESOURCE_EXHAUSTED)"));
      mockRecordRetry.mockResolvedValueOnce({
        data: { success: true, nextRunAt: new Date(Date.now() + 15000).toISOString() },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-rate-limit", workerId: "worker-1" });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("retry_scheduled");
      expect(mockRecordRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-rate-limit",
          fencingToken: 1,
          errorCode: "RATE_LIMITED",
        })
      );
      // Ensure job was NOT marked permanently failed
      expect(mockRelease).not.toHaveBeenCalled();
    });

    it("schedules a bounded retry on 503 provider unavailability", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-503",
          fencingToken: 2,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-503",
            artifact_kind: "summary",
            requested_count: 1,
            title: "Photosynthesis",
            status: "in_progress",
            provider_attempts: 1,
          },
          sourceContent: sampleSource,
          batches: [],
        },
        error: null,
      });

      mockFinalize.mockRejectedValueOnce(new Error("Gemini upstream service unavailable (503)"));
      mockRecordRetry.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-503", workerId: "worker-2" });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("retry_scheduled");
      expect(mockRecordRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-503",
          fencingToken: 2,
          errorCode: "PROVIDER_UNAVAILABLE",
        })
      );
      expect(mockRelease).not.toHaveBeenCalled();
    });

    it("releases job with PROVIDER_EXHAUSTED when retry attempts are exhausted", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-exhausted",
          fencingToken: 3,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-exhausted",
            artifact_kind: "summary",
            requested_count: 1,
            title: "Photosynthesis",
            status: "in_progress",
            provider_attempts: 2, // Already reached 2 previous attempts
          },
          sourceContent: sampleSource,
          batches: [],
        },
        error: null,
      });

      mockFinalize.mockRejectedValueOnce(new Error("Gemini upstream service unavailable (503)"));
      mockRelease.mockResolvedValueOnce({
        data: { success: true, status: "failed" },
        error: null,
      });

      const result = await executeGenerationStep({ jobId: "job-exhausted", workerId: "worker-3" });

      expect(result.success).toBe(false);
      expect(mockRecordRetry).not.toHaveBeenCalled();
      expect(mockRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-exhausted",
          cancelled: false,
          failureCode: "PROVIDER_EXHAUSTED",
        })
      );
    });
  });

  describe("2. Cancellation Lock & Quota Guarantee", () => {
    it("immediately aborts generation and releases reservation when cancellation is detected", async () => {
      mockClaimStep.mockResolvedValueOnce({
        data: {
          success: true,
          reason: "claimed",
          jobId: "job-user-cancel",
          fencingToken: 1,
        },
        error: null,
      });

      mockGetRunnerData.mockResolvedValueOnce({
        data: {
          job: {
            id: "job-user-cancel",
            artifact_kind: "flashcards",
            requested_count: 15,
            title: "Biology Cards",
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

      const result = await executeGenerationStep({ jobId: "job-user-cancel" });

      expect(result.success).toBe(false);
      expect(result.reason).toBe("cancelled");
      expect(mockRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: "job-user-cancel",
          cancelled: true,
          failureCode: "USER_CANCELLED",
        })
      );
      expect(mockCheckpoint).not.toHaveBeenCalled();
      expect(mockFinalize).not.toHaveBeenCalled();
    });
  });

  describe("3. Sweeper Watchdog Recovery", () => {
    it("sweeps expired jobs and reclaims dead leases", async () => {
      mockSweep.mockResolvedValueOnce({
        data: {
          success: true,
          expiredCount: 1,
          cancelledCount: 1,
          reclaimedCount: 2,
        },
        error: null,
      });

      const { sweepGenerationJobsServer } = await import("@/lib/server/privileged-supabase");
      const outcome = await sweepGenerationJobsServer({ staleSeconds: 75, deadlineMinutes: 30 });

      expect(outcome.data?.success).toBe(true);
      expect(outcome.data?.expiredCount).toBe(1);
      expect(outcome.data?.reclaimedCount).toBe(2);
    });
  });
});
