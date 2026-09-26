import { z } from "zod";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { createManualDeckServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

const createDeckSchema = z.object({
  title: z.string().trim().min(1).max(120),
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1),
        back: z.string().trim().min(1),
        aliases: z.array(z.string().trim()).default([]),
      })
    )
    .default([]),
});

export async function POST(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to create a flashcard deck.",
      401
    );
  }

  const parsed = createDeckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Title is required and cards must have valid front and back text.",
      400
    );
  }

  const result = await createManualDeckServer({
    title: parsed.data.title,
    cards: parsed.data.cards,
    client: account.supabase,
  });

  if (result.error || !result.data) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      result.error?.message || "Failed to create manual deck.",
      500
    );
  }

  return Response.json(result.data, { status: 201 });
}
