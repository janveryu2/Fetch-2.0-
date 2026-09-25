import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";

const paramsSchema = z.uuid();
const bodySchema = z.object({
  clientAttemptId: z.string().uuid().optional(),
  answers: z.array(z.object({ questionId: z.uuid(), answer: z.string().trim().min(1).max(1000) })).min(1).max(20),
});

export async function POST(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse();
  const { packId } = await params;
  if (!paramsSchema.safeParse(packId).success) return Response.json({ error: "StudyPack not found." }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Submit every question before saving your attempt." }, { status: 400 });
  const { data, error } = await context.supabase.rpc("complete_study_attempt", {
    p_pack_id: packId,
    p_answers: parsed.data.answers.map(({ questionId, answer }) => ({ question_id: questionId, answer })),
    ...(parsed.data.clientAttemptId ? { p_client_attempt_id: parsed.data.clientAttemptId } : {}),
  });
  if (error || !data || typeof data !== "object") {
    return Response.json({ error: "FETCH could not save this attempt. Your answers are still on this page; please retry." }, { status: 400 });
  }
  return Response.json({ attempt: data }, { status: 201 });
}
