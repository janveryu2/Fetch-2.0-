import { z } from "zod";
import {
  GeminiStudyPackProvider,
  verifySourceGrounding,
  isQuestionDuplicate,
  type GeneratedQuestion,
} from "./gemini-study-pack";
import {
  atomicFinalizeGenerationJobServer,
  claimGenerationBatchServer,
  checkpointGenerationBatchServer,
  getGenerationJobForRunnerServer,
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
  const offset = batchIndex * 10;

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

export interface GeneratedFlashcard {
  front: string;
  back: string;
  aliases: string[];
  sourceQuote: string;
}

/**
 * Creates deterministic development fixture flashcards for tests / dev mode
 */
export function createFixtureBatchFlashcards(
  source: string,
  count: number,
  batchIndex: number
): GeneratedFlashcard[] {
  const cleaned = source.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((s) => s.length > 25);
  const pool = sentences.length > 0 ? sentences : [cleaned];

  const cards: GeneratedFlashcard[] = [];
  const offset = batchIndex * 10;

  for (let i = 0; i < count; i++) {
    const sentenceIndex = (offset + i) % pool.length;
    const sentence = pool[sentenceIndex];
    const words = sentence
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const answer = words[i % Math.max(1, words.length)] || "concept";
    const front = `What term or concept completes: "${sentence.replace(
      new RegExp(`\\b${answer}\\b`, "i"),
      "____"
    )}"?`;

    cards.push({
      front,
      back: answer,
      aliases: [answer.toLowerCase()],
      sourceQuote: sentence,
    });
  }

  return cards;
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
 * Generates flashcards with Gemini with full source quote grounding
 */
export async function generateFlashcardsWithGemini(params: {
  title: string;
  source: string;
  count: number;
}): Promise<Array<{
  front: string;
  back: string;
  aliases: string[];
  sourceQuote: string;
}>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const model = process.env.GEMINI_STUDYPACK_MODEL || "gemini-3.7-flash";
  const candidateModels = [model, ...(model === "gemini-3.7-flash" ? ["gemini-2.5-flash"] : [])];

  const systemPrompt = `You create high-retention study flashcards using ONLY the supplied source text.
Create exactly ${params.count} flashcards covering the primary concepts, terminology, and principles.
For every card:
1. "front": clear term, concept, or question prompt.
2. "back": concise, accurate definition or answer.
3. "aliases": array of acceptable alternative terms or synonyms (can be empty).
4. "sourceQuote": verbatim, exact excerpt from the source text verifying the card content.

CRITICAL RULES:
- The "sourceQuote" MUST be an exact, word-for-word excerpt from the source text.
- Never invent quotes or hallucinate facts not in the source text.`;

  const userPrompt = `SOURCE TITLE: ${params.title}\n\nSOURCE MATERIAL:\n---\n${params.source}\n---`;

  let lastError: Error | null = null;
  for (const m of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: {
              type: "OBJECT",
              properties: {
                flashcards: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      front: { type: "STRING" },
                      back: { type: "STRING" },
                      aliases: { type: "ARRAY", items: { type: "STRING" } },
                      sourceQuote: { type: "STRING" },
                    },
                    required: ["front", "back", "sourceQuote"],
                  },
                },
              },
              required: ["flashcards"],
            },
            maxOutputTokens: 8192,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Gemini API error ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty response from Gemini.");
      const parsed = JSON.parse(rawText);
      interface RawCardData {
        front?: unknown;
        back?: unknown;
        aliases?: unknown;
        sourceQuote?: unknown;
      }
      const rawCards = (Array.isArray(parsed?.flashcards) ? parsed.flashcards : []) as RawCardData[];
      return rawCards
        .map((c) => ({
          front: String(c.front || "").trim(),
          back: String(c.back || "").trim(),
          aliases: Array.isArray(c.aliases) ? c.aliases.map((a) => String(a).trim()).filter(Boolean) : [],
          sourceQuote: String(c.sourceQuote || "").trim(),
        }))
        .filter((c) => c.front && c.back && c.sourceQuote);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("Failed to generate flashcards with Gemini.");
}

/**
 * Generates structured summary with Gemini matching structuredSummarySchema
 */
export async function generateSummaryWithGemini(params: {
  title: string;
  source: string;
}): Promise<StructuredSummary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  const model = process.env.GEMINI_STUDYPACK_MODEL || "gemini-3.7-flash";
  const candidateModels = [model, ...(model === "gemini-3.7-flash" ? ["gemini-2.5-flash"] : [])];

  const systemPrompt = `You generate structured, high-yield study summaries from ONLY the supplied source text.
Return a structured JSON object matching this schema:
- overview: 2-4 sentence executive overview of the study text (min 10 chars).
- keyConcepts: array of at least 1 object with "concept" (min 2 chars), "explanation" (min 10 chars), and optional "relevance".
- definitions: array of objects with "term" and "definition".
- relationships: array of objects with "conceptA", "conceptB", and "relationship" describing how they relate.
- remember: array of at least 1 key takeaway to remember for exams.
- quickReview: array of review objects with "question" and "answer".

CRITICAL: Rely strictly on facts in the source.`;

  const userPrompt = `SOURCE TITLE: ${params.title}\n\nSOURCE MATERIAL:\n---\n${params.source}\n---`;

  let lastError: Error | null = null;
  for (const m of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
            maxOutputTokens: 8192,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Gemini API error ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Empty response from Gemini.");
      const parsed = JSON.parse(rawText);
      const validated = structuredSummarySchema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      throw new Error(`Invalid summary structure: ${validated.error.message}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error("Failed to generate summary with Gemini.");
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

  interface JobRunnerRecord {
    id: string;
    title: string;
    artifact_kind: "quiz" | "flashcards" | "summary";
    requested_count: number;
    status: string;
    cancel_requested?: boolean;
    pack_id?: string;
    artifact_id?: string;
  }

  // 1. Fetch job record and full source content via server RPC
  const runnerRes = await getGenerationJobForRunnerServer({ jobId });
  let job: JobRunnerRecord;
  let sourceContent = "";

  if (runnerRes.data?.job) {
    job = runnerRes.data.job as unknown as JobRunnerRecord;
    sourceContent = runnerRes.data.sourceContent || "";
  } else {
    const { data: jobRow, error: jobError } = await privilegedClient
      .from("generation_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (jobError || !jobRow) {
      return { success: false, error: "Job not found." };
    }
    job = jobRow;

    const { data: inputRow } = await privilegedClient
      .from("generation_job_inputs")
      .select("source_content")
      .eq("job_id", jobId)
      .single();

    sourceContent = inputRow?.source_content || "";
  }

  if (job.status === "completed") {
    return { success: true, packId: job.pack_id, artifactId: job.artifact_id };
  }

  if (job.cancel_requested || job.status === "cancelled") {
    return { success: false, error: "Job was cancelled by user." };
  }

  const workerId = `runner-${process.pid || "worker"}-${Date.now()}`;

  try {
    // 2. Update stage: extracting
    await privilegedClient
      .from("generation_jobs")
      .update({ stage: "extracting", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    if (job.artifact_kind === "summary") {
      let summaryData: StructuredSummary;

      if (process.env.GEMINI_API_KEY) {
        try {
          summaryData = await generateSummaryWithGemini({
            title: job.title,
            source: sourceContent,
          });
        } catch (genErr) {
          if (process.env.NODE_ENV === "test") {
            summaryData = createFixtureSummary(job.title, sourceContent);
          } else {
            throw genErr;
          }
        }
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

    if (job.artifact_kind === "flashcards") {
      const batches = planBatches(job.requested_count, sourceContent);
      const collectedCards: Array<{
        front: string;
        back: string;
        aliases: string[];
        sourceQuote: string;
      }> = [];

      await privilegedClient
        .from("generation_jobs")
        .update({ stage: "batching", updated_at: new Date().toISOString() })
        .eq("id", jobId);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        await claimGenerationBatchServer({
          jobId,
          batchNumber: batch.batchNumber,
          leaseOwner: workerId,
          leaseSeconds: 90,
        });

        let cards: Array<{
          front: string;
          back: string;
          aliases: string[];
          sourceQuote: string;
        }> = [];

        if (process.env.GEMINI_API_KEY) {
          try {
            const rawCards = await generateFlashcardsWithGemini({
              title: `${job.title} (Batch ${batch.batchNumber})`,
              source: batch.sourceChunk,
              count: batch.allocatedCount,
            });
            cards = rawCards.filter((c) => verifySourceGrounding(sourceContent, c.sourceQuote));
          } catch (genErr) {
            if (process.env.NODE_ENV === "test") {
              cards = createFixtureBatchFlashcards(batch.sourceChunk, batch.allocatedCount, i);
            } else {
              throw genErr;
            }
          }
        } else {
          cards = createFixtureBatchFlashcards(batch.sourceChunk, batch.allocatedCount, i);
        }

        collectedCards.push(...cards);

        await checkpointGenerationBatchServer({
          jobId,
          batchNumber: batch.batchNumber,
          acceptedItems: cards,
          newAcceptedCount: collectedCards.length,
          stage: i === batches.length - 1 ? "finalizing" : "batching",
        });
      }

      const finalizeResult = await atomicFinalizeGenerationJobServer({
        jobId,
        flashcards: collectedCards,
      });

      if (finalizeResult.error || !finalizeResult.data) {
        throw new Error(finalizeResult.error?.message || "Failed to finalize flashcard job");
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

    const checkCancel = async () => {
      const { data: check } = await privilegedClient
        .from("generation_jobs")
        .select("cancel_requested, status")
        .eq("id", jobId)
        .single();
      return Boolean(check?.cancel_requested || check?.status === "cancelled");
    };

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
      await claimGenerationBatchServer({
        jobId,
        batchNumber: batch.batchNumber,
        leaseOwner: workerId,
        leaseSeconds: 90,
      });

      let batchQuestions: GeneratedQuestion[] = [];

      if (process.env.GEMINI_API_KEY) {
        try {
          const provider = new GeminiStudyPackProvider();
          const rawBatch = await provider.generate({
            title: `${job.title} (Batch ${batch.batchNumber})`,
            source: batch.sourceChunk,
            count: batch.allocatedCount,
          });

          for (const q of rawBatch) {
            if (
              verifySourceGrounding(sourceContent, q.sourceQuote) &&
              !isQuestionDuplicate(q, collectedQuestions)
            ) {
              batchQuestions.push(q);
            }
          }
        } catch (genErr) {
          if (process.env.NODE_ENV === "test") {
            const fallback = createFixtureBatchQuestions(
              batch.sourceChunk,
              batch.allocatedCount,
              i,
              collectedQuestions
            );
            batchQuestions.push(...fallback);
          } else {
            throw genErr;
          }
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

      await checkpointGenerationBatchServer({
        jobId,
        batchNumber: batch.batchNumber,
        acceptedItems: batchQuestions,
        newAcceptedCount: collectedQuestions.length,
        stage: i === batches.length - 1 ? "finalizing" : "batching",
      });
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
