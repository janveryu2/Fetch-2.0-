// @vitest-environment jsdom
import React, { useState } from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DemoProvider, useDemo } from "@/components/app/demo-provider";
import { CreatePackPanel } from "@/components/study/create-pack-panel";
import { StudyPackDetail } from "@/components/study/study-pack-detail";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/app/student-preferences-provider", () => ({
  useStudentPreferences: () => ({ preferences: { focusSubject: "Programming" } }),
}));

const pack = {
  id: "11111111-1111-4111-8111-111111111111", title: "Fresh Biology",
  sourceLabel: "Notes", createdAt: new Date().toISOString(), progress: 0,
  questions: [{ id: "q1", type: "multiple_choice", prompt: "Which organelle?", choices: ["Nucleus", "Mitochondria"] }],
};

beforeEach(() => { router.push.mockReset(); localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each([0, 1])("hydrates the saved StudyPack before navigating, retrying %i unavailable read without a browser refresh", async (unavailableReads) => {
  let workspaceReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    let payload: unknown = {};
    if (url.startsWith("/api/workspace")) {
      workspaceReads++;
      payload = { packs: workspaceReads <= 1 + unavailableReads ? [] : [pack], events: [], attempts: [] };
    } else if (url === "/api/generate/job") payload = { jobId: "job-1", stage: "queued" };
    else if (url === "/api/generate/job/job-1") payload = { jobId: "job-1", status: "completed", stage: "completed", packId: pack.id, acceptedCount: 6, requestedCount: 6 };
    else if (url === "/api/ai-usage") payload = { remaining: 15, allowance: 15 };
    else if (url.startsWith("/api/artifacts")) payload = { artifacts: [] };
    return { ok: true, json: async () => payload };
  }));
  function Flow() {
    const [opened, setOpened] = useState(false);
    router.push.mockImplementation(() => setOpened(true));
    return opened ? <StudyPackDetail packId={pack.id} /> : <CreatePackPanel />;
  }
  render(<DemoProvider mode="account" userId="host"><Flow /></DemoProvider>);
  await waitFor(() => expect(workspaceReads).toBe(1));
  fireEvent.change(screen.getByLabelText(/Paste your study material/), { target: { value: "Mitochondria provide energy for cells. The nucleus holds genetic instructions. These organelles have different functions." } });
  fireEvent.click(screen.getByRole("button", { name: "Generate Quiz" }));
  if (unavailableReads) {
    await waitFor(() => expect(workspaceReads).toBe(2), { timeout: 2500 });
    expect(router.push).not.toHaveBeenCalled();
  }
  await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/app/study-packs/${pack.id}`), { timeout: 5000 });
  expect(await screen.findByRole("heading", { name: pack.title })).toBeDefined();
  expect(workspaceReads).toBeGreaterThan(1);
  expect(screen.queryByText("Looking for your StudyPack")).toBeNull();
});

it("keeps a newly synchronized pack when an older workspace read finishes, while explicit reloads remain authoritative", async () => {
  let finishInitial: (value: { ok: boolean; json: () => Promise<unknown> }) => void = () => {};
  let initial = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("packId=")) return { ok: true, json: async () => ({ packs: [pack] }) };
    if (initial) {
      initial = false;
      return new Promise(resolve => { finishInitial = resolve; });
    }
    return { ok: true, json: async () => ({ packs: [], events: [], attempts: [] }) };
  }));
  function Workspace() {
    const state = useDemo();
    return <><button onClick={() => void state.syncPack(pack.id)}>Load new pack</button><button onClick={state.retryLoad}>Reload workspace</button><span>{state.status}</span>{state.packs.map(item => <h1 key={item.id}>{item.title}</h1>)}</>;
  }
  render(<DemoProvider mode="account"><Workspace /></DemoProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Load new pack" }));
  expect(await screen.findByRole("heading", { name: pack.title })).toBeDefined();
  finishInitial({ ok: true, json: async () => ({ packs: [], events: [], attempts: [] }) });
  await screen.findByText("ready");
  expect(screen.getByRole("heading", { name: pack.title })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Reload workspace" }));
  await waitFor(() => expect(screen.queryByRole("heading", { name: pack.title })).toBeNull());
});
