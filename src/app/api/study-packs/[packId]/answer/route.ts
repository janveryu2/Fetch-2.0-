import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { invalidRequestError, notFoundError } from "@/lib/api-errors";

const paramsSchema = z.string().uuid();
const bodySchema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(1).max(1000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ packId: string }> }
) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();

  const { packId } = await params;
  if (!paramsSchema.safeParse(packId).success) {
    return notFoundError("StudyPack not found.");
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return invalidRequestError("Enter an answer before checking.");
  }

  const { data, error } = await context.supabase.rpc("grade_study_answer", {
    p_pack_id: packId,
    p_question_id: parsed.data.questionId,
    p_answer: parsed.data.answer,
  });

  if (error || !data || typeof data !== "object") {
    return notFoundError("This answer could not be checked. Return to the StudyPack and try again.");
  }

  return Response.json(data);
}
