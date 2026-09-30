import { z } from "zod";
import {
  GeminiStudyPackProvider,
  verifySourceGrounding,
  isQuestionDuplicate,
  type GeneratedQuestion,
} from "./gemini-study-pack";
import {
  atomicFinalizeGenerationJobServer,
  checkpointGenerationBatchServer,
  getGenerationJobForRunnerServer,
  releaseGenerationJobServer,
  claimGenerationStepServer,
  heartbeatGenerationJobServer,
  recordGenerationRetryServer,
  dispatchGenerationJobServer,
  yieldGenerationStepServer,
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
  const initialParagraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  
  // If paragraphs are too large or fewer than target chunks, break long paragraphs at sentence boundaries
  const expandedSections: string[] = [];
  for (const para of initialParagraphs) {
    if (para.length > 1500) {
      const sentences = para.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      let curSec = "";
      for (const sent of sentences) {
        if (curSec.length + sent.length > 1200 && curSec.length > 0) {
          expandedSections.push(curSec.trim());
          curSec = sent;
        } else {
          curSec += (curSec ? " " : "") + sent;
        }
      }
      if (curSec.trim()) {
        expandedSections.push(curSec.trim());
      }
    } else {
      expandedSections.push(para);
    }
  }

  const sections = expandedSections.length > 0 ? expandedSections : initialParagraphs;
  if (sections.length <= targetChunks) {
    return sections.length > 0 ? sections : [cleaned];
  }

  const chunks: string[] = [];
  const charsPerChunk = Math.ceil(cleaned.length / targetChunks);
  let currentChunk = "";

  for (const sec of sections) {
    if (currentChunk.length + sec.length > charsPerChunk && chunks.length < targetChunks - 1) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sec;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + sec;
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
 * Plans flashcard batches: single-call generation for up to 20 cards,
 * 2 calls for 21-40 cards, 3 calls for 41-50 cards.
 * Can be reverted to legacy 10-item batching via FETCH_FLASHCARD_BATCH_V2="false".
 */
export function planFlashcardBatches(requestedCount: number, source: string): BatchPlan[] {
  if (process.env.FETCH_FLASHCARD_BATCH_V2 === "false") {
    return planBatches(requestedCount, source);
  }

  const boundedCount = Math.max(3, Math.min(50, requestedCount));
  let numBatches = 1;
  if (boundedCount > 40) {
    numBatches = 3;
  } else if (boundedCount > 20) {
    numBatches = 2;
  }

  const chunks = chunkSourceText(source, numBatches);
  const batches: BatchPlan[] = [];
  let remaining = boundedCount;

  for (let i = 0; i < numBatches; i++) {
    const allocated = Math.ceil(remaining / (numBatches - i));
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
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            response_mime_type: "application/json",
            thinkingConfig: m.startsWith("gemini-2.5-flash")
              ? { thinkingBudget: 0 }
              : { thinkingLevel: "low" },
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
            // maxOutputTokens also includes thought tokens. A small cap can
            // truncate otherwise valid JSON before all cards are emitted.
            maxOutputTokens: Math.max(8192, Math.min(16384, params.count * 350)),
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Gemini API error ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const data = await res.json();
      const candidate = data?.candidates?.[0];
      if (candidate?.finishReason === "MAX_TOKENS") {
        throw new Error(`Gemini ${m} response exceeded its output token limit.`);
      }
      const rawText = candidate?.content?.parts
        ?.filter((part: { thought?: boolean; text?: string }) => !part.thought && typeof part.text === "string")
        .map((part: { text: string }) => part.text)
        .join("");
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
async function generateSingleSummaryCall(
  title: string,
  source: string,
  apiKey: string,
  candidateModels: string[]
): Promise<StructuredSummary> {
  const systemPrompt = `You generate structured, high-yield study summaries from ONLY the supplied source text.
Return a structured JSON object matching this schema:
- overview: 2-4 sentence executive overview of the study text (min 10 chars).
- keyConcepts: array of at least 1 object with "concept" (min 2 chars), "explanation" (min 10 chars), and optional "relevance".
- definitions: array of objects with "term" and "definition".
- relationships: array of objects with "conceptA", "conceptB", and "relationship" describing how they relate.
- remember: array of at least 1 key takeaway to remember for exams.
- quickReview: array of review objects with "question" and "answer".

CRITICAL: Rely strictly on facts in the source.`;

  const userPrompt = `SOURCE TITLE: ${title}\n\nSOURCE MATERIAL:\n---\n${source}\n---`;

  let lastError: Error | null = null;
  for (const m of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(45_000),
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
 * Generates structured summary with Gemini matching structuredSummarySchema.
 * For oversized sources (> 20,000 characters), executes a chunk-reduce strategy.
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

  // For oversized inputs, execute chunk-reduce to prevent context truncation
  if (params.source.length > 20000) {
    const numChunks = Math.min(4, Math.ceil(params.source.length / 15000));
    const chunks = chunkSourceText(params.source, numChunks);
    const chunkExtracts: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkPrompt = `Summarize key definitions, principles, and concepts from section ${i + 1} of ${chunks.length} of "${params.title}":\n\n${chunks[i]}`;
      for (const m of candidateModels) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(30_000),
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: chunkPrompt }] }],
              generationConfig: { maxOutputTokens: 2048 },
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              chunkExtracts.push(`Section ${i + 1} Highlights:\n${text}`);
              break;
            }
          }
        } catch {
          // Try candidate model
        }
      }
    }

    const reducedSource = chunkExtracts.length > 0
      ? chunkExtracts.join("\n\n")
      : params.source.slice(0, 20000);

    return generateSingleSummaryCall(params.title, reducedSource, apiKey, candidateModels);
  }

  return generateSingleSummaryCall(params.title, params.source, apiKey, candidateModels);
}

/** Queue the wakeup in Postgres before acknowledging it. Cron retries missed wakeups. */
export async function dispatchGenerationWakeup(jobId: string) {
  return dispatchGenerationJobServer(jobId);
}

export interface ExecutionStepResult {
  success: boolean;
  done?: boolean;
  jobId?: string;
  batchNumber?: number;
  acceptedCount?: number;
  packId?: string;
  artifactId?: string;
  reason?: string;
  error?: string;
}

/**
 * Executes a single bounded step of durable generation with atomic claim & fencing.
 */
export async function executeGenerationStep(params?: {
  jobId?: string;
  workerId?: string;
}): Promise<ExecutionStepResult> {
  const workerId =
    params?.workerId ||
    `worker-${process.pid || "srv"}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // 1. Claim eligible job/step with atomic monotonic fencing
  const claimRes = await claimGenerationStepServer({
    workerId,
    jobId: params?.jobId,
    leaseSeconds: 90,
  });

  if (!claimRes.data || !claimRes.data.success) {
    return {
      success: false,
      reason: claimRes.data?.reason || claimRes.error?.message || "claim_failed",
    };
  }

  const claim = claimRes.data;
  const targetJobId = claim.jobId!;
  const fencingToken = claim.fencingToken || 1;
  let jobRecord: Record<string, unknown> | null = null;

  try {
    // 2. Read authoritative runner data (job, private source inputs, and existing batch checkpoints)
    const runnerRes = await getGenerationJobForRunnerServer({ jobId: targetJobId });
    if (!runnerRes.data) {
      throw new Error(runnerRes.error?.message || "Failed to load runner data for claimed job.");
    }

    jobRecord = runnerRes.data.job;
    const { sourceContent, batches: existingBatches } = runnerRes.data;
    const artifactKind = (jobRecord.artifact_kind as "quiz" | "flashcards" | "summary") || "quiz";
    const requestedCount = Number(jobRecord.requested_count) || 10;
    const title = String(jobRecord.title || "Study Pack");

    // 3. Early cancellation check
    if (jobRecord.cancel_requested || jobRecord.status === "cancelled") {
      await releaseGenerationJobServer({
        jobId: targetJobId,
        cancelled: true,
        failureCode: "USER_CANCELLED",
        failureMessage: "Job cancelled by student",
      });
      return { success: false, reason: "cancelled", jobId: targetJobId };
    }

    // 4. Production guard: prevent fake fixture generation if API key is missing
    if (!process.env.GEMINI_API_KEY && process.env.NODE_ENV === "production") {
      await releaseGenerationJobServer({
        jobId: targetJobId,
        cancelled: false,
        failureCode: "MISSING_PROVIDER_KEY",
        failureMessage: "Gemini provider API key is not configured.",
      });
      return { success: false, error: "Missing Gemini provider key in production.", jobId: targetJobId };
    }

    // 5. Artifact-specific execution
    if (artifactKind === "summary") {
      let summaryData: StructuredSummary;
      if (process.env.GEMINI_API_KEY) {
        try {
          summaryData = await generateSummaryWithGemini({
            title,
            source: sourceContent,
          });
        } catch (genErr) {
          if (process.env.NODE_ENV === "test") {
            summaryData = createFixtureSummary(title, sourceContent);
          } else {
            throw genErr;
          }
        }
      } else {
        summaryData = createFixtureSummary(title, sourceContent);
      }

      // Checkpoint and finalize summary atomically
      const finalizeResult = await atomicFinalizeGenerationJobServer({
        jobId: targetJobId,
        summary: summaryData,
      });

      if (finalizeResult.error || !finalizeResult.data) {
        throw new Error(finalizeResult.error?.message || "Failed to finalize summary job");
      }

      return {
        success: true,
        done: true,
        jobId: targetJobId,
        packId: finalizeResult.data.packId,
        artifactId: finalizeResult.data.artifactId,
      };
    }

    if (artifactKind === "flashcards") {
      const plannedBatches = planFlashcardBatches(requestedCount, sourceContent);
      const completedBatchMap = new Map<
        number,
        Array<{ front: string; back: string; aliases: string[]; sourceQuote: string }>
      >();

      // Identify already completed batch checkpoints
      if (Array.isArray(existingBatches)) {
        for (const b of existingBatches as Array<{
          batchNumber: number;
          status: string;
          acceptedQuestions?: unknown;
        }>) {
          if (b.status === "completed" && Array.isArray(b.acceptedQuestions)) {
            completedBatchMap.set(
              b.batchNumber,
              b.acceptedQuestions as Array<{ front: string; back: string; aliases: string[]; sourceQuote: string }>
            );
          }
        }
      }

      // Find first incomplete batch
      const nextBatchIndex = plannedBatches.findIndex((b) => !completedBatchMap.has(b.batchNumber));

      if (nextBatchIndex === -1) {
        // All batches already checkpointed! Finalize immediately.
        const allCards: Array<{ front: string; back: string; aliases: string[]; sourceQuote: string }> = [];
        for (const b of plannedBatches) {
          const cards = completedBatchMap.get(b.batchNumber) || [];
          allCards.push(...cards);
        }

        const finalizeResult = await atomicFinalizeGenerationJobServer({
          jobId: targetJobId,
          flashcards: allCards,
        });

        if (finalizeResult.error || !finalizeResult.data) {
          throw new Error(finalizeResult.error?.message || "Failed to finalize flashcard job");
        }

        return {
          success: true,
          done: true,
          jobId: targetJobId,
          packId: finalizeResult.data.packId,
          artifactId: finalizeResult.data.artifactId,
          acceptedCount: allCards.length,
        };
      }

      // Process this incomplete batch
      const currentBatch = plannedBatches[nextBatchIndex];

      // Heartbeat before calling Gemini
      await heartbeatGenerationJobServer({
        jobId: targetJobId,
        leaseOwner: workerId,
        fencingToken,
      });

      let cards: Array<{ front: string; back: string; aliases: string[]; sourceQuote: string }> = [];

      if (process.env.GEMINI_API_KEY) {
        try {
          const rawCards = await generateFlashcardsWithGemini({
            title: `${title} (Batch ${currentBatch.batchNumber})`,
            source: currentBatch.sourceChunk,
            count: currentBatch.allocatedCount,
          });
          cards = rawCards.filter((c) => verifySourceGrounding(sourceContent, c.sourceQuote));
        } catch (genErr) {
          if (process.env.NODE_ENV === "test") {
            cards = createFixtureBatchFlashcards(
              currentBatch.sourceChunk,
              currentBatch.allocatedCount,
              nextBatchIndex
            );
          } else {
            throw genErr;
          }
        }
      } else {
        cards = createFixtureBatchFlashcards(
          currentBatch.sourceChunk,
          currentBatch.allocatedCount,
          nextBatchIndex
        );
      }

      const isLastBatch = nextBatchIndex === plannedBatches.length - 1;

      // Fenced checkpoint
      const checkpointRes = await checkpointGenerationBatchServer({
        jobId: targetJobId,
        batchNumber: currentBatch.batchNumber,
        acceptedItems: cards,
        stage: isLastBatch ? "finalizing" : "batching",
        leaseOwner: workerId,
        fencingToken,
      });

      if (!checkpointRes.data?.success) {
        if (checkpointRes.data?.reason === "fenced") {
          return { success: false, reason: "fenced", jobId: targetJobId };
        }
        throw new Error(checkpointRes.error?.message || "Failed to checkpoint batch");
      }

      completedBatchMap.set(currentBatch.batchNumber, cards);

      if (isLastBatch) {
        // All batches now checkpointed! Collect all in stable order and finalize.
        const allCards: Array<{ front: string; back: string; aliases: string[]; sourceQuote: string }> = [];
        for (const b of plannedBatches) {
          const c = completedBatchMap.get(b.batchNumber) || [];
          allCards.push(...c);
        }

        const finalizeResult = await atomicFinalizeGenerationJobServer({
          jobId: targetJobId,
          flashcards: allCards,
        });

        if (finalizeResult.error || !finalizeResult.data) {
          throw new Error(finalizeResult.error?.message || "Failed to finalize flashcard job");
        }

        return {
          success: true,
          done: true,
          jobId: targetJobId,
          packId: finalizeResult.data.packId,
          artifactId: finalizeResult.data.artifactId,
          acceptedCount: allCards.length,
        };
      }

      // Checkpoint keeps the lease; yield it before queuing the next step.
      const yielded = await yieldGenerationStepServer({ jobId: targetJobId, leaseOwner: workerId, fencingToken });
      if (!yielded) return { success: false, reason: "fenced", jobId: targetJobId };
      const wakeup = await dispatchGenerationWakeup(targetJobId);
      if (!wakeup.success) console.error(`[Generation ${targetJobId}] Next batch wakeup: ${wakeup.reason}`);

      return {
        success: true,
        done: false,
        jobId: targetJobId,
        batchNumber: currentBatch.batchNumber,
        acceptedCount: checkpointRes.data.acceptedCount,
      };
    }

    // Quiz generation
    const plannedBatches = planBatches(requestedCount, sourceContent);
    const completedBatchMap = new Map<number, GeneratedQuestion[]>();

    if (Array.isArray(existingBatches)) {
      for (const b of existingBatches as Array<{
        batchNumber: number;
        status: string;
        acceptedQuestions?: unknown;
      }>) {
        if (b.status === "completed" && Array.isArray(b.acceptedQuestions)) {
          completedBatchMap.set(b.batchNumber, b.acceptedQuestions as GeneratedQuestion[]);
        }
      }
    }

    const nextBatchIndex = plannedBatches.findIndex((b) => !completedBatchMap.has(b.batchNumber));

    if (nextBatchIndex === -1) {
      const allQuestions: GeneratedQuestion[] = [];
      for (const b of plannedBatches) {
        allQuestions.push(...(completedBatchMap.get(b.batchNumber) || []));
      }

      const finalizeResult = await atomicFinalizeGenerationJobServer({
        jobId: targetJobId,
        questions: allQuestions,
      });

      if (finalizeResult.error || !finalizeResult.data) {
        throw new Error(finalizeResult.error?.message || "Failed to finalize quiz job");
      }

      return {
        success: true,
        done: true,
        jobId: targetJobId,
        packId: finalizeResult.data.packId,
        artifactId: finalizeResult.data.artifactId,
        acceptedCount: allQuestions.length,
      };
    }

    const currentBatch = plannedBatches[nextBatchIndex];

    await heartbeatGenerationJobServer({
      jobId: targetJobId,
      leaseOwner: workerId,
      fencingToken,
    });

    const previouslyAccepted: GeneratedQuestion[] = [];
    for (const b of plannedBatches) {
      if (completedBatchMap.has(b.batchNumber)) {
        previouslyAccepted.push(...completedBatchMap.get(b.batchNumber)!);
      }
    }

    let batchQuestions: GeneratedQuestion[] = [];

    if (process.env.GEMINI_API_KEY) {
      try {
        const provider = new GeminiStudyPackProvider();
        const rawBatch = await provider.generate({
          title: `${title} (Batch ${currentBatch.batchNumber})`,
          source: currentBatch.sourceChunk,
          count: currentBatch.allocatedCount,
        });

        for (const q of rawBatch) {
          if (
            verifySourceGrounding(sourceContent, q.sourceQuote) &&
            !isQuestionDuplicate(q, [...previouslyAccepted, ...batchQuestions])
          ) {
            batchQuestions.push(q);
          }
        }
      } catch (genErr) {
        if (process.env.NODE_ENV === "test") {
          batchQuestions = createFixtureBatchQuestions(
            currentBatch.sourceChunk,
            currentBatch.allocatedCount,
            nextBatchIndex,
            previouslyAccepted
          );
        } else {
          throw genErr;
        }
      }
    } else {
      batchQuestions = createFixtureBatchQuestions(
        currentBatch.sourceChunk,
        currentBatch.allocatedCount,
        nextBatchIndex,
        previouslyAccepted
      );
    }

    const isLastBatch = nextBatchIndex === plannedBatches.length - 1;

    const checkpointRes = await checkpointGenerationBatchServer({
      jobId: targetJobId,
      batchNumber: currentBatch.batchNumber,
      acceptedItems: batchQuestions,
      stage: isLastBatch ? "finalizing" : "batching",
      leaseOwner: workerId,
      fencingToken,
    });

    if (!checkpointRes.data?.success) {
      if (checkpointRes.data?.reason === "fenced") {
        return { success: false, reason: "fenced", jobId: targetJobId };
      }
      throw new Error(checkpointRes.error?.message || "Failed to checkpoint batch");
    }

    completedBatchMap.set(currentBatch.batchNumber, batchQuestions);

    if (isLastBatch) {
      const allQuestions: GeneratedQuestion[] = [];
      for (const b of plannedBatches) {
        allQuestions.push(...(completedBatchMap.get(b.batchNumber) || []));
      }

      const finalizeResult = await atomicFinalizeGenerationJobServer({
        jobId: targetJobId,
        questions: allQuestions,
      });

      if (finalizeResult.error || !finalizeResult.data) {
        throw new Error(finalizeResult.error?.message || "Failed to finalize quiz job");
      }

      return {
        success: true,
        done: true,
        jobId: targetJobId,
        packId: finalizeResult.data.packId,
        artifactId: finalizeResult.data.artifactId,
        acceptedCount: allQuestions.length,
      };
    }

    const yielded = await yieldGenerationStepServer({ jobId: targetJobId, leaseOwner: workerId, fencingToken });
    if (!yielded) return { success: false, reason: "fenced", jobId: targetJobId };
    const wakeup = await dispatchGenerationWakeup(targetJobId);
    if (!wakeup.success) console.error(`[Generation ${targetJobId}] Next batch wakeup: ${wakeup.reason}`);

    return {
      success: true,
      done: false,
      jobId: targetJobId,
      batchNumber: currentBatch.batchNumber,
      acceptedCount: checkpointRes.data.acceptedCount,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const isRateLimit = errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED");
    const isTimeout =
      errorMsg.includes("timeout") ||
      errorMsg.includes("aborted") ||
      errorMsg.includes("TIMEOUT");
    const isUnavailable =
      errorMsg.includes("503") ||
      errorMsg.includes("502") ||
      errorMsg.includes("500") ||
      errorMsg.includes("UNAVAILABLE") ||
      errorMsg.includes("fetch failed");

    const isRetryable = isRateLimit || isTimeout || isUnavailable;
    const currentProviderAttempts =
      typeof jobRecord?.provider_attempts === "number" ? jobRecord.provider_attempts : 0;

    if (isRetryable && currentProviderAttempts < 2) {
      const delaySeconds = isRateLimit
        ? 15 + Math.floor(Math.random() * 5)
        : Math.min(30, Math.pow(2, currentProviderAttempts + 1) * 2 + Math.floor(Math.random() * 3));

      const errorCode = isRateLimit
        ? "RATE_LIMITED"
        : isTimeout
        ? "TIMEOUT"
        : "PROVIDER_UNAVAILABLE";

      await recordGenerationRetryServer({
        jobId: targetJobId,
        fencingToken,
        errorCode,
        errorMessage: errorMsg,
        delaySeconds,
      });

      return {
        success: false,
        reason: "retry_scheduled",
        error: errorMsg,
        jobId: targetJobId,
      };
    }

    // Terminal failure or exhausted retries
    const terminalCode = isRetryable ? "PROVIDER_EXHAUSTED" : "GENERATION_FAILED";
    await releaseGenerationJobServer({
      jobId: targetJobId,
      cancelled: false,
      failureCode: terminalCode,
      failureMessage: errorMsg,
    });

    return { success: false, error: errorMsg, jobId: targetJobId };
  }
}

/**
 * Runs the durable generation workflow for a job to completion
 */
export async function runGenerationJob(
  jobId: string,
  options?: { workerId?: string; maxSteps?: number }
): Promise<{
  success: boolean;
  packId?: string;
  artifactId?: string;
  error?: string;
}> {
  const maxSteps = options?.maxSteps ?? 12;
  const workerId = options?.workerId;

  for (let step = 0; step < maxSteps; step++) {
    const stepResult = await executeGenerationStep({ jobId, workerId });
    if (!stepResult.success) {
      return {
        success: false,
        error: stepResult.error || stepResult.reason || "Generation step failed",
      };
    }
    if (stepResult.done) {
      return {
        success: true,
        packId: stepResult.packId,
        artifactId: stepResult.artifactId,
      };
    }
  }

  return { success: false, error: "Maximum generation steps exceeded" };
}
