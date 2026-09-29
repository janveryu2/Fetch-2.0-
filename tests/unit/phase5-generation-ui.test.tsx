// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";
import { ElapsedTimer } from "@/components/study/elapsed-timer";
import { FetchLoadingMascot } from "@/components/study/fetch-loading-mascot";
import {
  GenerationProgress,
  getStageDescription,
} from "@/components/study/generation-progress";

describe("Phase 5: Premium Generation UI & Navigation-Safe Tasks", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe("1. ElapsedTimer Truthful Time Calculation", () => {
    it("renders formatted mm:ss from server startedAt timestamp", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      // Started 75 seconds ago
      const startedAt = new Date(now - 75_000).toISOString();
      render(<ElapsedTimer startedAt={startedAt} />);

      expect(screen.getByText("01:15")).toBeDefined();
    });

    it("increments truthful seconds every 1000ms", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      render(<ElapsedTimer startedAt={new Date(now).toISOString()} />);
      expect(screen.getByText("00:00")).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(12_000);
      });

      expect(screen.getByText("00:12")).toBeDefined();
    });
  });

  describe("2. Staged Progress Description and Truthful Counter", () => {
    it("returns truthful descriptions matching backend stages", () => {
      expect(getStageDescription("queued", "flashcards", 0, 15)).toBe(
        "FETCH is finding a worker. You can leave this page anytime."
      );
      expect(getStageDescription("batching", "flashcards", 5, 15)).toBe(
        "Generating items in batches (5 of 15 accepted)..."
      );
      expect(getStageDescription("grounding", "flashcards", 15, 15)).toBe(
        "Verifying factual grounding against source quotes..."
      );
      expect(getStageDescription("finalizing", "flashcards", 15, 15)).toBe(
        "Saving StudyPack to your library..."
      );
      expect(getStageDescription("retrying", "flashcards", 8, 15)).toBe(
        "Provider connection recovered; continuing generation..."
      );
    });

    it("renders GenerationProgress with truthful counts and polite aria status", () => {
      render(
        <GenerationProgress
          jobId="job-xyz"
          artifactKind="flashcards"
          title="AP Biology: Cellular Respiration"
          stage="batching"
          acceptedCount={8}
          requestedCount={15}
          createdAt={new Date().toISOString()}
          onCancel={vi.fn()}
        />
      );

      // Verify title and requested count headline
      expect(screen.getByText(/FETCH is building your 15 flashcards/i)).toBeDefined();
      expect(screen.getByText("AP Biology: Cellular Respiration")).toBeDefined();

      // Verify truthful count display
      expect(screen.getAllByText(/8/).length).toBeGreaterThan(0);
      expect(screen.getByText(/\/ 15 accepted/)).toBeDefined();

      // Verify accessible status role
      const statusRole = screen.getByRole("status");
      expect(statusRole.getAttribute("aria-live")).toBe("polite");
    });
  });

  describe("3. FetchLoadingMascot Accessibility & Pixel Art", () => {
    it("renders pixel art mascot with aria-hidden on image container", () => {
      const { container } = render(<FetchLoadingMascot size={32} variant="active" />);
      const wrapper = container.querySelector("div");
      expect(wrapper?.getAttribute("aria-hidden")).toBe("true");
      const img = container.querySelector("img");
      expect(img?.className).toContain("pixel-art");
      expect(img?.className).toContain("fetch-breathe");
    });
  });
});
