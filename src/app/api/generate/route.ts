import { z } from "zod";
import { createHash } from "node:crypto";
import {
  GeminiStudyPackProvider,
  GeminiStudyPackError,
  sanitizeErrorMessage,
} from "@/lib/ai/gemini-study-pack";
import { generateStudyPack } from "@/lib/ai/study-pack";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import {
  persistStudyPackServer,
  reserveAiGenerationServer,
  commitAiGenerationServer,
  releaseAiGenerationServer,
  reconstructCommittedStudyPack,
} from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";
import type { Question } from "@/lib/demo-types";

export const maxDuration = 60;

export const requestSchema = z.object({
  title: z.string().trim().min(2).max(80),
  source: z.string().trim().min(80).max(20_000),
  count: z.number().int().min(3).max(20),
  requestId: z.string().uuid().optional(),
});

export function fixtureQuestions(source: string, count: number): Question[] {
  const cleaned = source.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 30);
  const material = sentences.length ? sentences : [cleaned];
  return Array.from({ length: Math.min(count, Math.max(3, material.length)) }, (_, index) => {
    const sentence = material[index % material.length];
    const words = sentence.replace(/[^a-zA-Z0-9\s-]/g, "").split(/\s+/).filter((word) => word.length > 5);
    const answer = words[index % Math.max(words.length, 1)] || sentence.split(" ")[0] || "concept";
    const prompt = sentence.replace(new RegExp(`\\b${answer}\\b`, "i"), "____");
    return {
      id: crypto.randomUUID(),
      type: index % 2 === 0 ? "fill_blank" : "multiple_choice",
      prompt: index % 2 === 0 ? prompt : `Which key term best completes this source idea: “${prompt}”?`,
      answer,
      choices: index % 2 === 0 ? undefined : [answer, "context", "evidence", "revision"].filter((value, choiceIndex, all) => all.indexOf(value) === choiceIndex),
      explanation: `The source sentence states: “${sentence}”`,
    };
  });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Add a title and at least 80 characters of study material.",
      400
    );
  }

  const account = await getAuthenticatedRequestContext();

  // Unauthenticated requests are browser-demo requests.
  // They strictly return deterministic local fixtures with a clear warning,
  // preventing any unauthenticated AI spend or database persistence.
  if (!account) {
    const questions = fixtureQuestions(parsed.data.source, parsed.data.count);
    return Response.json({
      provider: "development-fixture",
      warning: "These questions are deterministic development fixtures, not AI-generated production content.",
      questions,
    });
  }

  const requestId = parsed.data.requestId || crypto.randomUUID();
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        title: parsed.data.title,
        source: parsed.data.source,
        count: parsed.data.count,
      })
    )
    .digest("hex");

  // Reserve generation quota atomically with idempotency checks
  const reservation = await reserveAiGenerationServer({
    ownerId: account.userId,
    requestId,
    payloadHash,
    fallbackClient: account.supabase,
  });

  if (reservation.error || !reservation.data) {
    if (
      reservation.code === "42901" ||
      reservation.error?.message.includes("Monthly AI StudyPack allowance reached")
    ) {
      return createApiErrorResponse(
        "QUOTA_EXCEEDED",
        "You have reached your monthly allowance of 15 AI StudyPacks. Allowance resets at the start of next month.",
        429
      );
    }
    if (
      reservation.code === "23505" ||
      reservation.error?.message.includes("conflict")
    ) {
      return createApiErrorResponse(
        "REQUEST_CONFLICT",
        "A different generation request has already been submitted with this request ID.",
        409
      );
    }
    console.error("Quota reservation failed", reservation.error?.message);
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Unable to reserve generation quota. Please retry.",
      503
    );
  }

  if (reservation.data.status === "committed") {
    // Idempotent retry: return previously completed pack reconstructed from authoritative questions table
    const reconstructed = await reconstructCommittedStudyPack({
      packId: reservation.data.packId,
      ownerId: account.userId,
      fallbackClient: account.supabase,
    });

    if (reconstructed.error || !reconstructed.data) {
      console.error("[StudyPack Replay Error]", {
        requestId,
        packId: reservation.data.packId,
        error: reconstructed.error?.message,
      });
      return createApiErrorResponse(
        "STORAGE_UNAVAILABLE",
        "Unable to retrieve previously generated StudyPack. Please retry.",
        503
      );
    }

    return Response.json({
      provider: "gemini",
      packId: reconstructed.data.packId,
      questions: reconstructed.data.questions,
    });
  }

  if (reservation.data.status === "in_progress") {
    return createApiErrorResponse(
      "REQUEST_IN_PROGRESS",
      "This StudyPack generation is already in progress. Please wait a moment.",
      409
    );
  }

  const fencingToken = reservation.data.fencingToken;

  let questions: Question[];
  let provider: "gemini" | "openai" | "development-fixture";
  let warning: string | undefined;

  const startTime = Date.now();

  if (process.env.GEMINI_API_KEY) {
    try {
      const generator = new GeminiStudyPackProvider();
      questions = await generator.generate(parsed.data);
      provider = "gemini";
    } catch (error) {
      const elapsedMs = Date.now() - startTime;
      const failureClass =
        error instanceof GeminiStudyPackError
          ? error.classification
          : "UNKNOWN_ERROR";
      const httpStatus =
        error instanceof GeminiStudyPackError ? error.httpStatus : undefined;
      const validationStage =
        error instanceof GeminiStudyPackError ? error.validationStage : undefined;

      console.error("[Gemini study-pack generation failed]", {
        requestId,
        provider: "gemini",
        model: process.env.GEMINI_STUDYPACK_MODEL || "gemini-3.7-flash",
        errorClassification: failureClass,
        httpStatus,
        elapsedMs,
        validationStage,
        message: sanitizeErrorMessage(
          error instanceof Error ? error.message : String(error)
        ),
      });

      await releaseAiGenerationServer({
        ownerId: account.userId,
        requestId,
        fencingToken,
        failureClass: failureClass.toLowerCase(),
        fallbackClient: account.supabase,
      });

      return createApiErrorResponse(
        "GENERATION_FAILED",
        "Generation failed safely. Your material was not saved and your quota was not charged; please retry.",
        502
      );
    }
  } else if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    try {
      questions = await generateStudyPack(parsed.data);
      provider = "openai";
    } catch (error) {
      console.error("OpenAI study-pack generation failed", error);
      await releaseAiGenerationServer({
        ownerId: account.userId,
        requestId,
        fencingToken,
        failureClass: "openai_generation_failed",
        fallbackClient: account.supabase,
      });
      return createApiErrorResponse(
        "GENERATION_FAILED",
        "Generation failed safely. Your material was not saved and your quota was not charged; please retry.",
        502
      );
    }
  } else if (process.env.NODE_ENV === "production" && process.env.FETCH_ENABLE_DEV_FIXTURE !== "true") {
    await releaseAiGenerationServer({
      ownerId: account.userId,
      requestId,
      fencingToken,
      failureClass: "provider_unavailable",
      fallbackClient: account.supabase,
    });
    return createApiErrorResponse(
      "PROVIDER_UNAVAILABLE",
      "AI generation is not configured. Add GEMINI_API_KEY.",
      503
    );
  } else {
    questions = fixtureQuestions(parsed.data.source, parsed.data.count);
    provider = "development-fixture";
    warning = "These questions are deterministic development fixtures, not AI-generated production content.";
  }

  const contentHash = createHash("sha256").update(parsed.data.source).digest("hex");
  const { data: saved, error: persistError } = await persistStudyPackServer({
    ownerId: account.userId,
    title: parsed.data.title,
    sourceType: "text",
    sourceLabel:
      provider === "gemini"
        ? "Pasted text · Gemini AI"
        : provider === "openai"
        ? "Pasted text · AI generated"
        : "Pasted text · development fixture",
    sourceContent: parsed.data.source,
    contentHash,
    questions,
    fallbackClient: account.supabase,
  });

  if (persistError || !saved) {
    console.error("StudyPack persistence failed", persistError?.message);
    await releaseAiGenerationServer({
      ownerId: account.userId,
      requestId,
      fencingToken,
      failureClass: "persistence_failed",
      fallbackClient: account.supabase,
    });
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "FETCH generated the questions but could not save this StudyPack. Your quota was not charged; please retry.",
      503
    );
  }

  // Atomically commit the generation and count towards quota
  await commitAiGenerationServer({
    ownerId: account.userId,
    requestId,
    fencingToken,
    packId: saved.id,
    fallbackClient: account.supabase,
  });

  return Response.json({
    provider,
    warning,
    packId: saved.id,
    questions: saved.questions,
  });
}
