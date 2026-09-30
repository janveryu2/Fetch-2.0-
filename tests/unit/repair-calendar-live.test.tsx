// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import LivePage from "@/app/app/(workspace)/live/page";
import CalendarPage from "@/app/app/(workspace)/calendar/page";
import { localDate } from "@/lib/study-stats";

const fixture = vi.hoisted(() => ({ packs: [] as unknown[], events: [] as unknown[] }));
vi.mock("@/components/app/demo-provider", () => ({ useDemo: () => ({
  mode: "account", ready: true, status: "ready", packs: fixture.packs, events: fixture.events,
  addEvent: vi.fn(), removeEvent: vi.fn(),
}) }));
beforeEach(() => {
  fixture.packs = []; fixture.events = []; localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("creates a room from the first eligible pack when account packs arrive after mount", async () => {
  const fetcher = vi.fn(async () => ({ ok: false, json: async () => ({ error: "stop after request" }) }));
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<LivePage />);
  fixture.packs = [{ id: "22222222-2222-4222-8222-222222222222", title: "Biology", questions: [{ type: "multiple_choice" }] }];
  rerender(<LivePage />);
  fireEvent.click(screen.getByRole("button", { name: "Create Live Room" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/live/rooms", expect.objectContaining({
    body: expect.stringContaining("22222222-2222-4222-8222-222222222222"),
  })));
});

it("opens the event editor when clicking the empty area of a Month date cell", () => {
  render(<CalendarPage />);
  fireEvent.click(screen.getByRole("button", { name: "Month" }));
  const dateButton = screen.getByRole("button", { name: `Add event on ${localDate(new Date())}` });
  fireEvent.click(dateButton.parentElement!);
  expect(screen.getByRole("dialog")).toBeDefined();
});
