import { createHash } from "node:crypto";
import { z } from "zod";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import {
  attemptConflictError,
  invalidRequestError,
  notFoundError,
  storageUnavailableError,
} from "@/lib/api-errors";

const paramsSchema = z.string().uuid();
const bodySchema = z.object({
  clientAttemptId: z.string().uuid(),
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    answer: z.string().trim().min(1).max(1000),
  })).min(1).max(20),
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
    return invalidRequestError("Submit every question with a valid answer before saving your attempt.");
  }

  const sortedAnswers = [...parsed.data.answers].sort((a, b) =>
    a.questionId.localeCompare(b.questionId)
  );
  const requestHash = createHash("sha256")
    .update(JSON.stringify(sortedAnswers.map((a) => ({ id: a.questionId, ans: a.answer.trim().toLowerCase() }))))
    .digest("hex");

  const { data, error } = await context.supabase.rpc("complete_study_attempt", {
    p_pack_id: packId,
    p_answers: parsed.data.answers.map(({ questionId, answer }) => ({
      question_id: questionId,
      answer: answer.trim(),
    })),
    p_client_attempt_id: parsed.data.clientAttemptId,
    p_request_hash: requestHash,
  });

  if (error) {
    const errorMsg = error.message || "";
    const errorCode = (error as { code?: string }).code;

    if (errorCode === "23505" || errorMsg.includes("conflict") || errorMsg.includes("reused with different parameters")) {
      return attemptConflictError("This attempt ID was already used with different answers. Please start a new attempt.");
    }
    if (errorCode === "42501" || errorMsg.includes("not found") || errorMsg.includes("archived")) {
      return notFoundError("StudyPack not found or has been archived.");
    }
    if (errorCode === "22023" || errorMsg.includes("Invalid answers") || errorMsg.includes("Submit one answer")) {
      return invalidRequestError(errorMsg || "Answers do not match this StudyPack.");
    }

    return storageUnavailableError("FETCH could not save this attempt. Your answers are still on this page; please retry.");
  }

  if (!data || typeof data !== "object") {
    return storageUnavailableError("FETCH could not save this attempt. Your answers are still on this page; please retry.");
  }

  return Response.json({ attempt: data }, { status: 201 });
}
