import { z } from "zod";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { startFlashcardSessionServer } from "@/lib/server/privileged-supabase";
import { createApiErrorResponse } from "@/lib/api-errors";

const sessionSchema = z.object({
  artifactId: z.string().uuid(),
  clientSessionId: z.string().uuid().default(() => crypto.randomUUID()),
});

export async function POST(request: Request) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return createApiErrorResponse(
      "AUTH_REQUIRED",
      "Authentication required to start a flashcard session.",
      401
    );
  }

  const parsed = sessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_REQUEST",
      "Valid artifactId is required.",
      400
    );
  }

  const result = await startFlashcardSessionServer({
    artifactId: parsed.data.artifactId,
    clientSessionId: parsed.data.clientSessionId,
    client: account.supabase,
  });

  if (result.error || !result.data) {
    return createApiErrorResponse(
      "STORAGE_UNAVAILABLE",
      result.error?.message || "Failed to start flashcard session.",
      500
    );
  }

  return Response.json(result.data);
}
