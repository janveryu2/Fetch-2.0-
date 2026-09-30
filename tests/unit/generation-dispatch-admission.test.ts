import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const configure = vi.fn();
const start = vi.fn();
const dispatch = vi.fn();
const release = vi.fn();

vi.mock("@/lib/supabase/authorization", () => ({
  getAuthenticatedRequestContext: () => auth(),
}));
vi.mock("@/lib/server/privileged-supabase", () => ({
  configureGenerationDispatchServer: (url: string) => configure(url),
  startGenerationJobServer: (args: unknown) => start(args),
  releaseGenerationJobServer: (args: unknown) => release(args),
}));
vi.mock("@/lib/ai/durable-generation", () => ({
  dispatchGenerationWakeup: (id: string) => dispatch(id),
}));

import { POST } from "@/app/api/generate/job/route";

const source = "Cell biology explains how living cells work. The nucleus stores DNA and controls gene expression. Ribosomes synthesize proteins from messenger RNA. Mitochondria generate ATP, while the plasma membrane controls transport between a cell and its surroundings.";
const jobId = "11111111-1111-4111-8111-111111111111";
const request = () => new Request("https://fetch-study.vercel.app/api/generate/job", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Biology", source, count: 15, artifactKind: "flashcards" }),
});

describe("durable generation admission", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.mockResolvedValue({ userId: "user-1", supabase: {} });
    configure.mockResolvedValue({ success: true });
    start.mockResolvedValue({ data: { jobId, status: "in_progress", stage: "queued", reused: false }, error: null });
    dispatch.mockResolvedValue({ success: true, reason: "enqueued" });
    release.mockResolvedValue({ data: { success: true, status: "failed" }, error: null });
  });

  it("does not reserve quota when the database dispatcher is unavailable", async () => {
    configure.mockResolvedValue({ success: false, error: "missing migration" });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(start).not.toHaveBeenCalled();
    expect(configure).toHaveBeenCalledWith("https://fetch-study.vercel.app");
  });

  it("acknowledges only after the wakeup is queued", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(dispatch).toHaveBeenCalledWith(jobId);
    expect(release).not.toHaveBeenCalled();
  });

  it("keeps the durable job for cron recovery if the dispatch response is ambiguous", async () => {
    dispatch.mockResolvedValue({ success: false, reason: "pg_net unavailable" });
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect((await response.json()).dispatchPending).toBe(true);
    expect(release).not.toHaveBeenCalled();
  });
});
