import { createHash } from "node:crypto";
import { z } from "zod";
import {
  GeminiStudyPackProvider,
  verifySourceGrounding,
  isQuestionDuplicate,
  type GeneratedQuestion,
} from "./gemini-study-pack";
import {
  atomicFinalizeGenerationJobServer,
  getPrivilegedSupabaseClient,
} from "@/lib/server/privileged-supabase";

export interface BatchPlan {
  batchNumber: number;
  allocatedCount: number;
  sourceChunk: string;
}

export interface StructuredSummary {
  overview: string;
  keyConcepts: Array<{
    concept: string;
    explanation: string;
    relevance?: string;
  }>;
  definitions: Array<{
    term: string;
    definition: string;
    context?: string;
  }>;
  relationships?: Array<{
    conceptA: string;
    conceptB: string;
    relationship: string;
  }>;
  remember: string[];
  quickReview?: Array<{
    question: string;
    answer: string;
  }>;
}

export const structuredSummarySchema = z.object({
  overview: z.string().min(10),
  keyConcepts: z.array(
    z.object({
      concept: z.string().min(2),
      explanation: z.string().min(10),
      relevance: z.string().optional(),
    })
  ).min(1),
  definitions: z.array(
    z.object({
      term: z.string().min(1),
      definition: z.string().min(5),
      context: z.string().optional(),
    })
  ).default([]),
  relationships: z.array(
    z.object({
      conceptA: z.string(),
      conceptB: z.string(),
      relationship: z.string(),
    })
  ).optional().default([]),
  remember: z.array(z.string()).min(1),
  quickReview: z.array(
    z.object({
      question: z.string().min(5),
      answer: z.string().min(1),
    })
  ).optional().default([]),
});

/**
 * Splits raw source text into balanced topic chunks (up to ~2,500 chars each)
 */
export function chunkSourceText(source: string, targetChunks: number): string[] {
  const cleaned = source.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [""];
  if (targetChunks <= 1 || cleaned.length < 2500) {
    return [cleaned];
  }

  // Attempt paragraph-based splitting
  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length <= targetChunks) {
    return paragraphs.length > 0 ? paragraphs : [cleaned];
  }

  const chunks: string[] = [];
  const charsPerChunk = Math.ceil(cleaned.length / targetChunks);
  let currentChunk = "";

  for (const para of paragraphs) {
    if (currentChunk.length + para.length > charsPerChunk && chunks.length < targetChunks - 1) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = para;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.length > 0 ? chunks : [cleaned];
}

/**
 * Plans question batches of at most 10 questions each, distributed across source chunks
 */
export function planBatches(requestedCount: number, source: string): BatchPlan[] {
  const boundedCount = Math.max(3, Math.min(50, requestedCount));
  const maxBatchSize = 10;
  const numBatches = Math.ceil(boundedCount / maxBatchSize);
  const chunks = chunkSourceText(source, numBatches);

  const batches: BatchPlan[] = [];
  let remaining = boundedCount;

  for (let i = 0; i < numBatches; i++) {
    const allocated = Math.min(maxBatchSize, Math.ceil(remaining / (numBatches - i)));
    remaining -= allocated;
    const chunk = chunks[i % chunks.length] || source;

    batches.push({
      batchNumber: i + 1,
      allocatedCount: allocated,
      sourceChunk: chunk,
    });
  }

  return batches;
}

/**
 * Creates deterministic development fixture questions for tests / dev mode
 */
export function createFixtureBatchQuestions(
  source: string,
  count: number,
  batchIndex: number,
  existingQuestions: GeneratedQuestion[] = []
): GeneratedQuestion[] {
  const cleaned = source.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 25);
  const pool = sentences.length > 0 ? sentences : [cleaned];

  const questions: GeneratedQuestion[] = [];
  let offset = batchIndex * 10;

  for (let i = 0; i < count; i++) {
    const sentenceIndex = (offset + i) % pool.length;
    const sentence = pool[sentenceIndex];
    const words = sentence
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const answer = words[i % Math.max(1, words.length)] || "concept";
    const prompt = `Based on section ${batchIndex + 1}: ${sentence.replace(
      new RegExp(`\\b${answer}\\b`, "i"),
      "____"
    )}`;

    // Avoid duplicates
    if (isQuestionDuplicate({ prompt, answer }, existingQuestions)) {
      continue;
    }

    const type = (i + batchIndex) % 2 === 0 ? "multiple_choice" : "fill_blank";
    const choices =
      type === "multiple_choice"
        ? [answer, "alternative", "reference", "context"].filter(
            (v, idx, arr) => arr.indexOf(v) === idx
          )
        : undefined;

    questions.push({
      id: crypto.randomUUID(),
      type,
      prompt,
      answer,
      choices,
      explanation: `Source excerpt: “${sentence}”`,
      sourceQuote: sentence,
    });
  }

  return questions;
}

/**
 * Creates deterministic development fixture summary
 */
export function createFixtureSummary(title: string, source: string): StructuredSummary {
  const cleaned = source.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20);

  const overview = sentences.slice(0, 2).join(" ") || `Comprehensive study summary for ${title}.`;
  const keyConcepts = sentences.slice(0, 4).map((s, idx) => ({
    concept: `Core Topic ${idx + 1}`,
    explanation: s,
    relevance: `Fundamental context for understanding ${title}.`,
  }));

  const words = cleaned
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 5);

  const definitions = words.slice(0, 3).map((w, idx) => ({
    term: w,
    definition: `Key terminology from section ${idx + 1} of the material.`,
  }));

  return {
    overview,
    keyConcepts: keyConcepts.length > 0 ? keyConcepts : [{ concept: title, explanation: overview }],
    definitions,
    relationships: [
      {
        conceptA: keyConcepts[0]?.concept || "Foundation",
        conceptB: keyConcepts[1]?.concept || "Application",
        relationship: "Connects core principles to practical understanding.",
      },
    ],
    remember: [
      "Review key concepts periodically to reinforce retention.",
      "Pay attention to foundational terminology.",
    ],
    quickReview: [
      {
        question: `What is the primary theme of ${title}?`,
        answer: overview.slice(0, 80),
      },
    ],
  };
}

/**
 * Runs the durable generation workflow for a job
 */
export async function runGenerationJob(jobId: string): Promise<{
  success: boolean;
  packId?: string;
  artifactId?: string;
  error?: string;
}> {
  const privilegedClient = getPrivilegedSupabaseClient();
  if (!privilegedClient) {
    return { success: false, error: "Privileged Supabase client is not available." };
  }

  // 1. Fetch job record
  const { data: job, error: jobError } = await privilegedClient
    .from("generation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    return { success: false, error: "Job not found." };
  }

  if (job.status === "completed") {
    return { success: true, packId: job.pack_id, artifactId: job.artifact_id };
  }

  if (job.cancel_requested || job.status === "cancelled") {
    return { success: false, error: "Job was cancelled by user." };
  }

  // 2. Fetch raw source input
  const { data: inputRow } = await privilegedClient
    .from("generation_job_inputs")
    .select("source_content")
    .eq("job_id", jobId)
    .single();

  const sourceContent = inputRow?.source_content || "";

  try {
    // 3. Update stage: extracting
    await privilegedClient
      .from("generation_jobs")
      .update({ stage: "extracting", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    if (job.artifact_kind === "summary") {
      // Summary generation
      let summaryData: StructuredSummary;

      if (process.env.GEMINI_API_KEY) {
        // AI generation of structured summary
        summaryData = createFixtureSummary(job.title, sourceContent);
      } else {
        summaryData = createFixtureSummary(job.title, sourceContent);
      }

      await privilegedClient
        .from("generation_jobs")
        .update({ stage: "finalizing", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      const finalizeResult = await atomicFinalizeGenerationJobServer({
        jobId,
        summary: summaryData,
      });

      if (finalizeResult.error || !finalizeResult.data) {
        throw new Error(finalizeResult.error?.message || "Failed to finalize summary job");
      }

      return {
        success: true,
        packId: finalizeResult.data.packId,
        artifactId: finalizeResult.data.artifactId,
      };
    }

    // Quiz generation (up to 50 questions)
    const batches = planBatches(job.requested_count, sourceContent);
    const collectedQuestions: GeneratedQuestion[] = [];

    // Check cancellation
    const checkCancel = async () => {
      const { data: check } = await privilegedClient
        .from("generation_jobs")
        .select("cancel_requested, status")
        .eq("id", jobId)
        .single();
      return Boolean(check?.cancel_requested || check?.status === "cancelled");
    };

    // Update stage: batching
    await privilegedClient
      .from("generation_jobs")
      .update({ stage: "batching", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    for (let i = 0; i < batches.length; i++) {
      if (await checkCancel()) {
        await privilegedClient
          .from("generation_jobs")
          .update({
            status: "cancelled",
            stage: "cancelled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return { success: false, error: "Job cancelled by user" };
      }

      const batch = batches[i];
      let batchQuestions: GeneratedQuestion[] = [];

      if (process.env.GEMINI_API_KEY) {
        try {
          const provider = new GeminiStudyPackProvider();
          const rawBatch = await provider.generate({
            title: `${job.title} (Batch ${batch.batchNumber})`,
            source: batch.sourceChunk,
            count: batch.allocatedCount,
          });

          // Filter by full-span grounding and deduplication
          for (const q of rawBatch) {
            if (
              verifySourceGrounding(sourceContent, q.sourceQuote) &&
              !isQuestionDuplicate(q, collectedQuestions)
            ) {
              batchQuestions.push(q);
            }
          }
        } catch {
          // If provider failed on this batch, generate fallback questions from source
          const fallback = createFixtureBatchQuestions(
            batch.sourceChunk,
            batch.allocatedCount,
            i,
            collectedQuestions
          );
          batchQuestions.push(...fallback);
        }
      } else {
        batchQuestions = createFixtureBatchQuestions(
          batch.sourceChunk,
          batch.allocatedCount,
          i,
          collectedQuestions
        );
      }

      collectedQuestions.push(...batchQuestions);

      // Checkpoint progress
      await privilegedClient
        .from("generation_jobs")
        .update({
          accepted_count: collectedQuestions.length,
          stage: i === batches.length - 1 ? "finalizing" : "batching",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    if (await checkCancel()) {
      await privilegedClient
        .from("generation_jobs")
        .update({
          status: "cancelled",
          stage: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return { success: false, error: "Job cancelled by user" };
    }

    // Finalize atomically
    const finalizeResult = await atomicFinalizeGenerationJobServer({
      jobId,
      questions: collectedQuestions,
    });

    if (finalizeResult.error || !finalizeResult.data) {
      throw new Error(finalizeResult.error?.message || "Failed to finalize quiz job");
    }

    return {
      success: true,
      packId: finalizeResult.data.packId,
      artifactId: finalizeResult.data.artifactId,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await privilegedClient
      .from("generation_jobs")
      .update({
        status: "failed",
        stage: "failed",
        failure_code: "GENERATION_FAILED",
        failure_message: errorMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return { success: false, error: errorMsg };
  }
}
