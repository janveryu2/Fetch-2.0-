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
import { fixtureQuestions } from "@/app/api/generate/route";
import type { Question } from "@/lib/demo-types";

export const maxDuration = 60;

export const pdfGenerateSchema = z.object({
  docId: z.string().uuid(),
  title: z.string().trim().min(2).max(80),
  count: z.number().int().min(3).max(20),
  requestId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = pdfGenerateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Provide a valid document ID, title, and question count between 3 and 20.",
      400
    );
  }

  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Sign in to generate StudyPacks from PDF documents.",
      401
    );
  }

  // Retrieve the owned document
  const { data: docData, error: docError } = await account.supabase.rpc(
    "get_source_document",
    { p_doc_id: parsed.data.docId }
  );

  const doc = docData as {
    id: string;
    fileName?: string;
    extractedText?: string;
    pageCount?: number;
    status?: string;
    linkedPackId?: string;
  } | null;

  if (docError || !doc || !doc.extractedText) {
    return createApiErrorResponse(
      "NOT_FOUND",
      "PDF source document not found or does not contain extracted text.",
      404
    );
  }

  const requestId = parsed.data.requestId || crypto.randomUUID();
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        docId: parsed.data.docId,
        title: parsed.data.title,
        count: parsed.data.count,
      })
    )
    .digest("hex");

  // Reserve quota atomically
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
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      "Unable to reserve generation quota. Please retry.",
      503
    );
  }

  if (reservation.data.status === "committed") {
    const reconstructed = await reconstructCommittedStudyPack({
      packId: reservation.data.packId,
      ownerId: account.userId,
      fallbackClient: account.supabase,
    });

    if (reconstructed.error || !reconstructed.data) {
      console.error("[PDF StudyPack Replay Error]", {
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

  const boundedSource = doc.extractedText.slice(0, 20_000);

  const generationInput = {
    title: parsed.data.title,
    source: boundedSource,
    count: parsed.data.count,
  };

  const startTime = Date.now();

  if (process.env.GEMINI_API_KEY) {
    try {
      const generator = new GeminiStudyPackProvider();
      questions = await generator.generate(generationInput);
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

      console.error("[Gemini PDF study-pack generation failed]", {
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
        "Generation failed safely. Your quota was not charged; please retry.",
        502
      );
    }
  } else if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    try {
      questions = await generateStudyPack(generationInput);
      provider = "openai";
    } catch (error) {
      console.error("OpenAI PDF study-pack generation failed", error);
      await releaseAiGenerationServer({
        ownerId: account.userId,
        requestId,
        fencingToken,
        failureClass: "openai_generation_failed",
        fallbackClient: account.supabase,
      });
      return createApiErrorResponse(
        "GENERATION_FAILED",
        "Generation failed safely. Your quota was not charged; please retry.",
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
    questions = fixtureQuestions(doc.extractedText, parsed.data.count);
    provider = "development-fixture";
    warning = "These questions are deterministic development fixtures, not AI-generated production content.";
  }

  const contentHash = createHash("sha256").update(doc.extractedText).digest("hex");
  const fileName = doc.fileName || "Uploaded document";
  const { data: saved, error: persistError } = await persistStudyPackServer({
    ownerId: account.userId,
    title: parsed.data.title,
    sourceType: "pdf",
    sourceLabel:
      provider === "gemini"
        ? `PDF: ${fileName} · Gemini AI`
        : provider === "openai"
        ? `PDF: ${fileName} · OpenAI`
        : `PDF: ${fileName} · development fixture`,
    sourceContent: doc.extractedText,
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

  // Atomically commit generation
  await commitAiGenerationServer({
    ownerId: account.userId,
    requestId,
    fencingToken,
    packId: saved.id,
    fallbackClient: account.supabase,
  });

  // Link document to pack
  const { error: updateDocError } = await account.supabase.rpc("update_source_document", {
    p_doc_id: parsed.data.docId,
    p_extraction_status: "extracted",
    p_linked_pack_id: saved.id,
  });

  if (updateDocError) {
    console.error("[PDF Source Document Link Warning]", {
      docId: parsed.data.docId,
      packId: saved.id,
      error: updateDocError.message,
    });
  }

  return Response.json({
    provider,
    warning,
    packId: saved.id,
    questions: saved.questions,
  });
}
