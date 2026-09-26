import { z } from "zod";
import { createHash } from "node:crypto";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { startGenerationJobServer } from "@/lib/server/privileged-supabase";
import { runGenerationJob } from "@/lib/ai/durable-generation";
import { createApiErrorResponse } from "@/lib/api-errors";

export const maxDuration = 60;

export const jobRequestSchema = z.object({
  title: z.string().trim().min(2).max(120),
  source: z.string().trim().max(80_000).optional().default(""),
  documentId: z.string().uuid().optional(),
  count: z.number().int().min(3).max(50).default(10),
  artifactKind: z.enum(["quiz", "flashcards", "summary"]).default("quiz"),
  sourceType: z.enum(["text", "pdf", "url", "manual", "scan"]).default("text"),
  sourceLabel: z.string().trim().min(1).max(120).default("Pasted Notes"),
  requestId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const parsed = jobRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Add a title and between 80 and 80,000 characters of study material.",
      400
    );
  }

  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to start a durable generation job.",
      401
    );
  }

  let resolvedSource = parsed.data.source;
  let resolvedLabel = parsed.data.sourceLabel;

  if (parsed.data.documentId) {
    if (parsed.data.sourceType === "pdf") {
      const { data: docData } = await account.supabase.rpc("get_source_document", {
        p_doc_id: parsed.data.documentId,
      });
      const typedDoc = docData as { extractedText?: string; fileName?: string } | null;
      if (typedDoc?.extractedText) {
        resolvedSource = typedDoc.extractedText;
        resolvedLabel = typedDoc.fileName || resolvedLabel;
      }
    } else if (parsed.data.sourceType === "scan") {
      const { data: docData } = await account.supabase.rpc("get_scan_document", {
        p_document_id: parsed.data.documentId,
      });
      const typedScan = docData as { title?: string; pages?: Array<{ extractedText?: string }> } | null;
      if (typedScan?.pages) {
        const texts = typedScan.pages.map((p) => p.extractedText).filter(Boolean);
        if (texts.length > 0) {
          resolvedSource = texts.join("\n\n");
        }
        resolvedLabel = typedScan.title || resolvedLabel;
      }
    }
  }

  if (resolvedSource.length < 80) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Add a title and at least 80 characters of study material.",
      400
    );
  }

  resolvedSource = resolvedSource.slice(0, 80_000);

  const requestId = parsed.data.requestId || crypto.randomUUID();
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        title: parsed.data.title,
        source: resolvedSource,
        count: parsed.data.count,
        artifactKind: parsed.data.artifactKind,
      })
    )
    .digest("hex");

  // Start generation job atomically with quota check
  const startResult = await startGenerationJobServer({
    ownerId: account.userId,
    requestId,
    payloadHash,
    artifactKind: parsed.data.artifactKind,
    title: parsed.data.title,
    sourceType: parsed.data.sourceType,
    sourceLabel: resolvedLabel,
    sourceContent: resolvedSource,
    requestedCount: parsed.data.count,
    fallbackClient: account.supabase,
  });

  if (startResult.error || !startResult.data) {
    if (
      startResult.code === "42901" ||
      startResult.error?.message.includes("Monthly AI StudyPack allowance reached")
    ) {
      return createApiErrorResponse(
        "QUOTA_EXCEEDED",
        "You have reached your monthly allowance of 15 AI StudyPacks. Allowance resets at the start of next month.",
        429
      );
    }
    if (
      startResult.code === "23505" ||
      startResult.error?.message.includes("Request ID conflict")
    ) {
      return createApiErrorResponse(
        "REQUEST_CONFLICT",
        "A different generation request has already been submitted with this request ID.",
        409
      );
    }
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      startResult.error?.message || "Unable to start generation job. Please retry.",
      500
    );
  }

  const { jobId, status, stage, reused } = startResult.data;

  // If not reused and in_progress, trigger the runner
  if (!reused && status === "in_progress") {
    // Run worker in background
    runGenerationJob(jobId).catch((err) => {
      console.error(`[Generation Job ${jobId} Execution Error]:`, err);
    });
  }

  return Response.json({
    jobId,
    status,
    stage,
    reused,
  });
}
