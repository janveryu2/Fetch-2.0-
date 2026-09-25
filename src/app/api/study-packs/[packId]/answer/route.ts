import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";

const paramsSchema = z.uuid();
const bodySchema = z.object({ questionId: z.uuid(), answer: z.string().trim().min(1).max(1000) });

export async function POST(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const { packId } = await params;
  if (!paramsSchema.safeParse(packId).success) return Response.json({ error: "StudyPack not found." }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter an answer before checking." }, { status: 400 });
  const { data, error } = await context.supabase.rpc("grade_study_answer", {
    p_pack_id: packId,
    p_question_id: parsed.data.questionId,
    p_answer: parsed.data.answer,
  });
  if (error || !data || typeof data !== "object") {
    return Response.json({ error: "This answer could not be checked. Return to the StudyPack and try again." }, { status: 404 });
  }
  return Response.json(data);
}
