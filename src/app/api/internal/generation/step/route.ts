import { executeGenerationStep } from "@/lib/ai/durable-generation";
import { sweepGenerationJobsServer } from "@/lib/server/privileged-supabase";

export const maxDuration = 60;

export async function POST(request: Request) {
  const authHeader = request.headers.get("x-fetch-worker-secret");
  const bearerHeader = request.headers.get("authorization");
  const expectedSecret =
    process.env.FETCH_INTERNAL_WORKER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isSecretMatch =
    Boolean(expectedSecret) &&
    (authHeader === expectedSecret || bearerHeader === `Bearer ${expectedSecret}`);

  if (!isSecretMatch) {
    return Response.json({ error: "Unauthorized worker invocation" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const jobId = typeof body?.jobId === "string" ? body.jobId : undefined;
  const isSweep = body?.sweep === true;

  if (isSweep) {
    const sweepResult = await sweepGenerationJobsServer();
    return Response.json({ sweep: true, result: sweepResult.data });
  }

  const result = await executeGenerationStep({ jobId });
  return Response.json(result, { status: result.success ? 200 : 400 });
}
