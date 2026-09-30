import { executeGenerationStep } from "@/lib/ai/durable-generation";
import { authorizeGenerationDispatchServer, sweepGenerationJobsServer } from "@/lib/server/privileged-supabase";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const authHeader = request.headers.get("x-fetch-worker-secret");
  const bearerHeader = request.headers.get("authorization");
  const dispatchToken = request.headers.get("x-fetch-worker-token");
  const expectedSecret =
    process.env.FETCH_INTERNAL_WORKER_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isSecretMatch =
    Boolean(expectedSecret) &&
    (authHeader === expectedSecret || bearerHeader === `Bearer ${expectedSecret}`);

  const isDatabaseDispatch = !isSecretMatch && dispatchToken
    ? await authorizeGenerationDispatchServer(dispatchToken)
    : false;

  if (!isSecretMatch && !isDatabaseDispatch) {
    return Response.json({ error: "Unauthorized worker invocation" }, { status: 401 });
  }

  const jobId = typeof body?.jobId === "string" ? body.jobId : undefined;
  const isSweep = body?.sweep === true;

  if (isSweep) {
    if (!isSecretMatch) return Response.json({ error: "Unauthorized sweep" }, { status: 401 });
    const sweepResult = await sweepGenerationJobsServer();
    return Response.json({ sweep: true, result: sweepResult.data });
  }

  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return Response.json({ error: "Valid jobId required" }, { status: 400 });
  }
  const result = await executeGenerationStep({ jobId });
  if (!result.success) console.error(`[Generation ${jobId}] Worker step failed: ${result.reason || result.error}`);
  return Response.json(result, { status: result.success ? 200 : 409 });
}
