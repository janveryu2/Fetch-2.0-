// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  computePayloadFingerprint,
  resolveRequestId,
  rotateRequestState,
  createInitialRequestState,
} from "@/lib/study/request-lifecycle";
import { CreatePackPanel } from "@/components/study/create-pack-panel";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock demo provider
let mockMode = "account";
const mockAddPack = vi.fn();
vi.mock("@/components/app/demo-provider", () => ({
  useDemo: () => ({
    mode: mockMode,
    addPack: mockAddPack,
  }),
}));

describe("Client Request ID Lifecycle (Tests 1 - 6)", () => {
  it("1. failed Paste request -> retry same payload must not conflict (reuses requestId)", () => {
    const initialState = createInitialRequestState();
    const payload = {
      mode: "paste" as const,
      title: "Cell Biology",
      source: "Mitochondria are membrane-bound cell organelles that generate most of the chemical energy...",
      count: 5,
    };

    const fingerprint = computePayloadFingerprint(payload);
    const firstAttempt = resolveRequestId(initialState, fingerprint);

    expect(firstAttempt.isNew).toBe(true);
    expect(firstAttempt.requestId).toBeTruthy();

    // After failure, retry same payload without changing anything
    const secondAttempt = resolveRequestId(firstAttempt.nextState, fingerprint);
    expect(secondAttempt.isNew).toBe(false);
    expect(secondAttempt.requestId).toBe(firstAttempt.requestId);
  });

  it("2. failed Paste request -> change source -> Generate must use new request ID", () => {
    const initialState = createInitialRequestState();
    const payload1 = {
      mode: "paste" as const,
      title: "Cell Biology",
      source: "Original source text with more than eighty characters for valid generation...",
      count: 5,
    };

    const fp1 = computePayloadFingerprint(payload1);
    const attempt1 = resolveRequestId(initialState, fp1);

    // Change source text
    const payload2 = {
      ...payload1,
      source: "Completely modified source text with more than eighty characters for valid generation...",
    };
    const fp2 = computePayloadFingerprint(payload2);
    const attempt2 = resolveRequestId(attempt1.nextState, fp2);

    expect(attempt2.isNew).toBe(true);
    expect(attempt2.requestId).not.toBe(attempt1.requestId);
  });

  it("3. failed Paste request -> switch to PDF must use new request ID", () => {
    const initialState = createInitialRequestState();
    const pastePayload = {
      mode: "paste" as const,
      title: "Cell Biology",
      source: "Original source text with more than eighty characters for valid generation...",
      count: 5,
    };

    const pasteFp = computePayloadFingerprint(pastePayload);
    const pasteAttempt = resolveRequestId(initialState, pasteFp);

    // Switch to PDF
    const pdfPayload = {
      mode: "pdf" as const,
      docId: "11111111-1111-4111-8111-111111111111",
      title: "Cell Biology",
      count: 5,
    };
    const pdfFp = computePayloadFingerprint(pdfPayload);
    const pdfAttempt = resolveRequestId(pasteAttempt.nextState, pdfFp);

    expect(pdfAttempt.isNew).toBe(true);
    expect(pdfAttempt.requestId).not.toBe(pasteAttempt.requestId);
  });

  it("4. PDF A -> replace with PDF B must use new request ID", () => {
    const initialState = createInitialRequestState();
    const pdfA = {
      mode: "pdf" as const,
      docId: "11111111-1111-4111-8111-111111111111",
      title: "Photosynthesis",
      count: 4,
    };
    const fpA = computePayloadFingerprint(pdfA);
    const attemptA = resolveRequestId(initialState, fpA);

    // Replace with PDF B (new docId)
    const pdfB = {
      mode: "pdf" as const,
      docId: "22222222-2222-4222-8222-222222222222",
      title: "Photosynthesis",
      count: 4,
    };
    const fpB = computePayloadFingerprint(pdfB);
    const attemptB = resolveRequestId(attemptA.nextState, fpB);

    expect(attemptB.isNew).toBe(true);
    expect(attemptB.requestId).not.toBe(attemptA.requestId);
  });

  it("5. change question count must use new logical request ID", () => {
    const initialState = createInitialRequestState();
    const payloadCount4 = {
      mode: "paste" as const,
      title: "Genetics Notes",
      source: "Mendelian inheritance refers to an analysis of, and the results from, cross-breeding experiments...",
      count: 4,
    };
    const fp4 = computePayloadFingerprint(payloadCount4);
    const attempt4 = resolveRequestId(initialState, fp4);

    // Change count to 8
    const payloadCount8 = {
      ...payloadCount4,
      count: 8,
    };
    const fp8 = computePayloadFingerprint(payloadCount8);
    const attempt8 = resolveRequestId(attempt4.nextState, fp8);

    expect(attempt8.isNew).toBe(true);
    expect(attempt8.requestId).not.toBe(attempt4.requestId);
  });

  it("6. successful generation -> next generation gets a fresh request ID", () => {
    const initialState = createInitialRequestState();
    const payload = {
      mode: "paste" as const,
      title: "Cell Biology",
      source: "Mitochondria are membrane-bound cell organelles that generate most of the chemical energy...",
      count: 5,
    };
    const fp = computePayloadFingerprint(payload);
    const attempt1 = resolveRequestId(initialState, fp);

    // Generation succeeds -> rotateRequestState
    const rotated = rotateRequestState();
    expect(rotated.fingerprint).toBe("");

    // Next generation with same content must get a NEW request ID because it was committed
    const nextSessionAttempt = resolveRequestId(rotated, fp);
    expect(nextSessionAttempt.isNew).toBe(true);
    expect(nextSessionAttempt.requestId).not.toBe(attempt1.requestId);
  });
});

describe("CreatePackPanel UI Coming Soon Notices (Tests 7 - 8)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockPush.mockReset();
    mockAddPack.mockReset();
    mockMode = "account";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ remaining: 15, allowance: 15 }),
      })
    );
  });

  it("7. PDF tab does NOT display Coming Soon", () => {
    render(React.createElement(CreatePackPanel));

    // Click on PDF tab
    const pdfTabButton = document.getElementById("tab-pdf")!;
    fireEvent.click(pdfTabButton);

    // Should NOT have "PDF import is coming soon" notice
    const comingSoonNotice = screen.queryByText(/PDF import is coming soon/i);
    expect(comingSoonNotice).toBeNull();

    // Verify PDF upload prompt is present
    expect(screen.getByText(/Choose or drag a PDF document/i)).toBeTruthy();
  });

  it("8. Link tab DOES display Coming Soon", () => {
    render(React.createElement(CreatePackPanel));

    // Click on Link tab
    const linkTabButton = document.getElementById("tab-url")!;
    fireEvent.click(linkTabButton);

    // Should display the Link coming soon notice
    const linkNotice = screen.getByText(/Link import is coming soon/i);
    expect(linkNotice).toBeTruthy();
  });
});
