import { z } from "zod";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { listFlashcardsServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

const addCardSchema = z.object({
  front: z.string().trim().min(1, "Front is required").max(500),
  back: z.string().trim().min(1, "Back is required").max(500),
  aliases: z.array(z.string().trim().min(1)).optional().default([]),
});

const editCardSchema = z.object({
  cardId: z.string().uuid(),
  front: z.string().trim().min(1).max(500).optional(),
  back: z.string().trim().min(1).max(500).optional(),
  aliases: z.array(z.string().trim().min(1)).optional(),
});

const deleteCardSchema = z.object({
  cardId: z.string().uuid(),
});

export async function GET(
  _request: Request,
  props: { params: Promise<{ artifactId: string }> }
) {
  const { artifactId } = await props.params;
  const account = await getAuthenticatedRequestContext();

  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to view flashcards.",
      401
    );
  }

  const result = await listFlashcardsServer({
    artifactId,
    client: account.supabase,
  });

  if (result.error || !result.data) {
    return createApiErrorResponse(
      "NOT_FOUND",
      result.error?.message || "Flashcards not found.",
      404
    );
  }

  return Response.json(result.data);
}

export async function POST(
  request: Request,
  props: { params: Promise<{ artifactId: string }> }
) {
  const { artifactId } = await props.params;
  const account = await getAuthenticatedRequestContext();

  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to add flashcards.",
      401
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = addCardSchema.safeParse(raw);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message || "Invalid card data", 400);
  }

  // 1. Verify artifact ownership
  const { data: artifact, error: artErr } = await account.supabase
    .from("study_artifacts")
    .select("id, owner_id, version")
    .eq("id", artifactId)
    .single();

  if (artErr || !artifact) {
    return createApiErrorResponse("NOT_FOUND", "Deck artifact not found.", 404);
  }

  if (artifact.owner_id !== account.userId) {
    return createApiErrorResponse("FORBIDDEN", "You do not own this deck.", 403);
  }

  // 2. Count existing cards for next position
  const { count } = await account.supabase
    .from("flashcards")
    .select("*", { count: "exact", head: true })
    .eq("artifact_id", artifactId);

  const position = count ?? 0;
  const cardId = crypto.randomUUID();

  // 3. Insert card
  const { error: insErr } = await account.supabase
    .from("flashcards")
    .insert({
      id: cardId,
      artifact_id: artifactId,
      owner_id: account.userId,
      position,
      front: parsed.data.front,
      back: parsed.data.back,
      aliases: parsed.data.aliases,
      origin: "manual",
      version: 1,
    });

  if (insErr) {
    return createApiErrorResponse("STORAGE_UNAVAILABLE", insErr.message, 500);
  }

  // 4. Bump artifact version
  const newVersion = (artifact.version || 1) + 1;
  await account.supabase
    .from("study_artifacts")
    .update({ version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", artifactId);

  return Response.json({
    card: {
      id: cardId,
      position,
      front: parsed.data.front,
      back: parsed.data.back,
      aliases: parsed.data.aliases,
      version: 1,
    },
    artifactVersion: newVersion,
  }, { status: 201 });
}

export async function PATCH(
  request: Request,
  props: { params: Promise<{ artifactId: string }> }
) {
  const { artifactId } = await props.params;
  const account = await getAuthenticatedRequestContext();

  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to edit flashcard.",
      401
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = editCardSchema.safeParse(raw);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message || "Invalid edit data", 400);
  }

  const { cardId, front, back, aliases } = parsed.data;

  // 1. Verify artifact ownership
  const { data: artifact, error: artErr } = await account.supabase
    .from("study_artifacts")
    .select("id, owner_id, version")
    .eq("id", artifactId)
    .single();

  if (artErr || !artifact) {
    return createApiErrorResponse("NOT_FOUND", "Deck artifact not found.", 404);
  }

  if (artifact.owner_id !== account.userId) {
    return createApiErrorResponse("FORBIDDEN", "You do not own this deck.", 403);
  }

  // 2. Update card
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (front !== undefined) updateData.front = front;
  if (back !== undefined) updateData.back = back;
  if (aliases !== undefined) updateData.aliases = aliases;

  const { error: updErr } = await account.supabase
    .from("flashcards")
    .update(updateData)
    .eq("id", cardId)
    .eq("artifact_id", artifactId)
    .eq("owner_id", account.userId);

  if (updErr) {
    return createApiErrorResponse("STORAGE_UNAVAILABLE", updErr.message, 500);
  }

  // 3. Bump artifact version
  const newVersion = (artifact.version || 1) + 1;
  await account.supabase
    .from("study_artifacts")
    .update({ version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", artifactId);

  return Response.json({ success: true, artifactVersion: newVersion });
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ artifactId: string }> }
) {
  const { artifactId } = await props.params;
  const account = await getAuthenticatedRequestContext();

  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to delete flashcard.",
      401
    );
  }

  const raw = await request.json().catch(() => null);
  const parsed = deleteCardSchema.safeParse(raw);
  if (!parsed.success) {
    return createApiErrorResponse("INVALID_REQUEST", parsed.error.issues[0]?.message || "Invalid card ID", 400);
  }

  // 1. Verify artifact ownership
  const { data: artifact, error: artErr } = await account.supabase
    .from("study_artifacts")
    .select("id, owner_id, version")
    .eq("id", artifactId)
    .single();

  if (artErr || !artifact) {
    return createApiErrorResponse("NOT_FOUND", "Deck artifact not found.", 404);
  }

  if (artifact.owner_id !== account.userId) {
    return createApiErrorResponse("FORBIDDEN", "You do not own this deck.", 403);
  }

  // 2. Delete card
  const { error: delErr } = await account.supabase
    .from("flashcards")
    .delete()
    .eq("id", parsed.data.cardId)
    .eq("artifact_id", artifactId)
    .eq("owner_id", account.userId);

  if (delErr) {
    return createApiErrorResponse("STORAGE_UNAVAILABLE", delErr.message, 500);
  }

  // 3. Bump artifact version
  const newVersion = (artifact.version || 1) + 1;
  await account.supabase
    .from("study_artifacts")
    .update({ version: newVersion, updated_at: new Date().toISOString() })
    .eq("id", artifactId);

  return Response.json({ success: true, artifactVersion: newVersion });
}
