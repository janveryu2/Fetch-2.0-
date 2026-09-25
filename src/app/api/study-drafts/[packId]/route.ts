import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import {
  draftConflictError,
  invalidRequestError,
  notFoundError,
  storageUnavailableError,
} from "@/lib/api-errors";

const paramsSchema = z.string().uuid();

const putBodySchema = z.object({
  clientAttemptId: z.string().uuid(),
  revision: z.number().int().min(1),
  expectedRevision: z.number().int().min(0).optional(),
  currentIndex: z.number().int().min(0),
  currentAnswer: z.string().max(1000).default(""),
  checked: z.boolean().default(false),
  feedback: z
    .object({
      correct: z.boolean(),
      explanation: z.string(),
      answer: z.string().optional(),
    })
    .nullable()
    .optional(),
  submittedAnswers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        answer: z.string().max(1000),
        correct: z.boolean().optional(),
      })
    )
    .max(20),
  packFingerprint: z.string().min(1),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { packId } = await params;
  if (!paramsSchema.safeParse(packId).success) {
    return notFoundError("StudyPack not found.");
  }

  // Verify pack exists and belongs to user
  const { data: pack, error: packError } = await context.supabase
    .from("study_packs")
    .select("id, status, archived_at")
    .eq("id", packId)
    .eq("owner_id", context.userId)
    .maybeSingle();

  if (packError || !pack || pack.status !== "ready" || pack.archived_at !== null) {
    return notFoundError("StudyPack not found or has been archived.");
  }

  const { data: row, error: draftError } = await context.supabase
    .from("study_session_drafts")
    .select(
      "id, pack_id, client_attempt_id, current_position, current_answer, checked, feedback, answers, pack_fingerprint, revision, updated_at, expires_at"
    )
    .eq("user_id", context.userId)
    .eq("pack_id", packId)
    .maybeSingle();

  if (draftError) {
    return storageUnavailableError("Could not retrieve cloud draft.");
  }

  if (!row) {
    return Response.json({ draft: null });
  }

  // Check expiration
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    // Delete expired draft lazily
    await context.supabase
      .from("study_session_drafts")
      .delete()
      .eq("user_id", context.userId)
      .eq("pack_id", packId);

    return Response.json({ draft: null });
  }

  return Response.json({
    draft: {
      id: row.id,
      packId: row.pack_id,
      clientAttemptId: row.client_attempt_id,
      currentIndex: row.current_position,
      currentAnswer: row.current_answer || "",
      checked: Boolean(row.checked),
      feedback: row.feedback,
      submittedAnswers: Array.isArray(row.answers) ? row.answers : [],
      packFingerprint: row.pack_fingerprint,
      revision: row.revision,
      updatedAt: row.updated_at,
    },
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { packId } = await params;
  if (!paramsSchema.safeParse(packId).success) {
    return notFoundError("StudyPack not found.");
  }

  // Verify pack exists and belongs to user
  const { data: pack, error: packError } = await context.supabase
    .from("study_packs")
    .select("id, status, archived_at")
    .eq("id", packId)
    .eq("owner_id", context.userId)
    .maybeSingle();

  if (packError || !pack || pack.status !== "ready" || pack.archived_at !== null) {
    return notFoundError("StudyPack not found or has been archived.");
  }

  const raw = await request.json().catch(() => null);
  const parsed = putBodySchema.safeParse(raw);
  if (!parsed.success) {
    return invalidRequestError("Invalid draft data format.");
  }

  // Fetch current existing draft for compare-and-swap check
  const { data: existing } = await context.supabase
    .from("study_session_drafts")
    .select("revision, expires_at")
    .eq("user_id", context.userId)
    .eq("pack_id", packId)
    .maybeSingle();

  if (existing) {
    const isExpired = existing.expires_at && new Date(existing.expires_at).getTime() < Date.now();
    if (!isExpired && parsed.data.expectedRevision !== undefined && existing.revision !== parsed.data.expectedRevision) {
      return draftConflictError(
        "Cloud draft has been updated on another device.",
        existing.revision
      );
    }
  }

  const nextRevision = existing ? existing.revision + 1 : parsed.data.revision;
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: saved, error: upsertError } = await context.supabase
    .from("study_session_drafts")
    .upsert(
      {
        user_id: context.userId,
        pack_id: packId,
        client_attempt_id: parsed.data.clientAttemptId,
        answers: parsed.data.submittedAnswers,
        current_position: parsed.data.currentIndex,
        current_answer: parsed.data.currentAnswer,
        checked: parsed.data.checked,
        feedback: parsed.data.feedback ?? null,
        pack_fingerprint: parsed.data.packFingerprint,
        revision: nextRevision,
        expires_at: expiresAt,
        updated_at: now,
      },
      { onConflict: "user_id,pack_id" }
    )
    .select(
      "id, pack_id, client_attempt_id, current_position, current_answer, checked, feedback, answers, pack_fingerprint, revision, updated_at"
    )
    .single();

  if (upsertError || !saved) {
    return storageUnavailableError("Could not save cloud draft. Local copy preserved.");
  }

  return Response.json({
    draft: {
      id: saved.id,
      packId: saved.pack_id,
      clientAttemptId: saved.client_attempt_id,
      currentIndex: saved.current_position,
      currentAnswer: saved.current_answer || "",
      checked: Boolean(saved.checked),
      feedback: saved.feedback,
      submittedAnswers: Array.isArray(saved.answers) ? saved.answers : [],
      packFingerprint: saved.pack_fingerprint,
      revision: saved.revision,
      updatedAt: saved.updated_at,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { packId } = await params;
  if (!paramsSchema.safeParse(packId).success) {
    return notFoundError("StudyPack not found.");
  }

  const { error } = await context.supabase
    .from("study_session_drafts")
    .delete()
    .eq("user_id", context.userId)
    .eq("pack_id", packId);

  if (error) {
    return storageUnavailableError("Could not clear cloud draft.");
  }

  return Response.json({ success: true });
}
