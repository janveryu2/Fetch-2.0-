import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  planBatches,
  planFlashcardBatches,
  chunkSourceText,
  executeGenerationStep,
} from "@/lib/ai/durable-generation";
import * as privilegedServer from "@/lib/server/privileged-supabase";

describe("Phase 3: Flashcard Speed and Provider Admission", () => {
  const originalEnv = process.env.FETCH_FLASHCARD_BATCH_V2;

  beforeEach(() => {
    delete process.env.FETCH_FLASHCARD_BATCH_V2;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.FETCH_FLASHCARD_BATCH_V2 = originalEnv;
    } else {
      delete process.env.FETCH_FLASHCARD_BATCH_V2;
    }
  });

  describe("Flashcard Batch Planning (V2 Single-Call & Low-Batch Strategy)", () => {
    const dummySource = "A".repeat(500);

    it("plans a single batch for <= 20 flashcards (15 cards = 1 call)", () => {
      const plan15 = planFlashcardBatches(15, dummySource);
      expect(plan15).toHaveLength(1);
      expect(plan15[0].allocatedCount).toBe(15);
      expect(plan15[0].batchNumber).toBe(1);

      const plan20 = planFlashcardBatches(20, dummySource);
      expect(plan20).toHaveLength(1);
      expect(plan20[0].allocatedCount).toBe(20);
    });

    it("plans 2 batches for 21-40 flashcards", () => {
      const plan25 = planFlashcardBatches(25, dummySource);
      expect(plan25).toHaveLength(2);
      expect(plan25.reduce((acc, b) => acc + b.allocatedCount, 0)).toBe(25);
      expect(plan25[0].allocatedCount).toBe(13);
      expect(plan25[1].allocatedCount).toBe(12);

      const plan40 = planFlashcardBatches(40, dummySource);
      expect(plan40).toHaveLength(2);
      expect(plan40.reduce((acc, b) => acc + b.allocatedCount, 0)).toBe(40);
    });

    it("plans 3 batches for 41-50 flashcards", () => {
      const plan50 = planFlashcardBatches(50, dummySource);
      expect(plan50).toHaveLength(3);
      expect(plan50.reduce((acc, b) => acc + b.allocatedCount, 0)).toBe(50);
      expect(plan50[0].allocatedCount).toBe(17);
      expect(plan50[1].allocatedCount).toBe(17);
      expect(plan50[2].allocatedCount).toBe(16);
    });

    it("respects FETCH_FLASHCARD_BATCH_V2='false' flag by reverting to 10-item batches", () => {
      process.env.FETCH_FLASHCARD_BATCH_V2 = "false";
      const plan15Legacy = planFlashcardBatches(15, dummySource);
      expect(plan15Legacy).toHaveLength(2);
      expect(plan15Legacy[0].allocatedCount).toBe(8);
      expect(plan15Legacy[1].allocatedCount).toBe(7);

      const plan25Legacy = planFlashcardBatches(25, dummySource);
      expect(plan25Legacy).toHaveLength(3);
    });

    it("preserves standard 10-item batching for planBatches (quiz)", () => {
      const quizPlan15 = planBatches(15, dummySource);
      expect(quizPlan15).toHaveLength(2);
      expect(quizPlan15[0].allocatedCount).toBe(8);
      expect(quizPlan15[1].allocatedCount).toBe(7);
    });
  });

  describe("Sentence-Aware Source Chunking", () => {
    it("splits long single-paragraph text into balanced sentence-aligned chunks", () => {
      const longSentence = "The mitochondria is the powerhouse of the cellular respiration system. ";
      const hugeParagraph = longSentence.repeat(40); // ~2900 chars
      expect(hugeParagraph.length).toBeGreaterThan(2500);

      const chunks = chunkSourceText(hugeParagraph, 3);
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      for (const chunk of chunks) {
        expect(chunk.length).toBeGreaterThan(0);
        // Ensure no sentences are truncated abruptly in the middle
        expect(chunk.endsWith(".") || chunk.endsWith("!") || chunk.endsWith("?")).toBe(true);
      }
    });

    it("returns single chunk for small texts", () => {
      const short = "Just a short text for quick review.";
      const chunks = chunkSourceText(short, 3);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(short);
    });
  });

  describe("End-to-End Flashcard Step Execution (Single Step for 15 Cards)", () => {
    it("completes 15 flashcards in a single batch step without multiple round-trips", async () => {
      const jobId = "flashcard-job-15";
      const workerId = "test-worker";

      vi.spyOn(privilegedServer, "claimGenerationStepServer").mockResolvedValue({
        data: { success: true, reason: "claimed", jobId, fencingToken: 1 },
        error: null,
      });

      vi.spyOn(privilegedServer, "getGenerationJobForRunnerServer").mockResolvedValue({
        data: {
          job: {
            id: jobId,
            artifact_kind: "flashcards",
            requested_count: 15,
            title: "Biology 101",
            status: "in_progress",
            cancel_requested: false,
          },
          sourceContent:
            "Cellular biology is the study of cell structure and function. Mitochondria generate ATP. Ribosomes synthesize proteins. The nucleus stores genetic DNA. Chloroplasts perform photosynthesis in plants. The cell membrane regulates transport.",
          batches: [],
        },
        error: null,
      });

      vi.spyOn(privilegedServer, "heartbeatGenerationJobServer").mockResolvedValue({
        data: { success: true },
        error: null,
      });

      vi.spyOn(privilegedServer, "checkpointGenerationBatchServer").mockResolvedValue({
        data: { success: true, acceptedCount: 15 },
        error: null,
      });

      vi.spyOn(privilegedServer, "atomicFinalizeGenerationJobServer").mockResolvedValue({
        data: {
          status: "completed",
          packId: "pack-15",
          artifactId: "artifact-15",
        },
        error: null,
      });

      const result = await executeGenerationStep({ jobId, workerId });

      expect(result.success).toBe(true);
      expect(result.done).toBe(true); // Must finish in 1 step!
      expect(result.packId).toBe("pack-15");
      expect(result.acceptedCount).toBe(15);
      expect(privilegedServer.checkpointGenerationBatchServer).toHaveBeenCalledTimes(1);
      expect(privilegedServer.atomicFinalizeGenerationJobServer).toHaveBeenCalledTimes(1);
    });
  });
});
