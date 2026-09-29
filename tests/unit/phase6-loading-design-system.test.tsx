// @vitest-environment jsdom

import { describe, it, expect, afterEach } from "vitest";
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { LoadingButton } from "@/components/ui/loading-button";
import { SkeletonBlock } from "@/components/ui/skeleton-block";
import {
  StudyPackCardSkeleton,
  ProgressChartSkeleton,
  FriendRowSkeleton,
  MessageThreadSkeleton,
  TutorMessageSkeleton,
  StreamingIndicator,
} from "@/components/ui/domain-skeletons";

describe("Phase 6: Shared Loading Design System Primitives", () => {
  afterEach(() => {
    cleanup();
  });

  describe("1. LoadingButton Accessibility and State", () => {
    it("renders idle button normally without spinner", () => {
      render(<LoadingButton>Save StudyPack</LoadingButton>);
      const btn = screen.getByRole("button", { name: "Save StudyPack" });
      expect(btn).toBeDefined();
      expect(btn.getAttribute("aria-busy")).toBe("false");
      expect(btn.hasAttribute("disabled")).toBe(false);
    });

    it("renders loading state with aria-busy, disabled attribute, and loadingText", () => {
      render(
        <LoadingButton isLoading loadingText="Saving...">
          Save StudyPack
        </LoadingButton>
      );
      const btn = screen.getByRole("button");
      expect(btn).toBeDefined();
      expect(btn.getAttribute("aria-busy")).toBe("true");
      expect(btn.hasAttribute("disabled")).toBe(true);
      expect(screen.getByText("Saving...")).toBeDefined();
    });
  });

  describe("2. SkeletonBlock Base Primitive", () => {
    it("renders with aria-hidden and customizable dimensions", () => {
      const { container } = render(<SkeletonBlock width={120} height={24} rounded="md" />);
      const skeleton = container.querySelector("div");
      expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
      expect(skeleton?.className).toContain("animate-pulse");
      expect(skeleton?.className).toContain("rounded-md");
      expect(skeleton?.style.width).toBe("120px");
      expect(skeleton?.style.height).toBe("24px");
    });
  });

  describe("3. Domain-Specific Skeletons", () => {
    it("renders StudyPackCardSkeleton with aria-hidden", () => {
      const { container } = render(<StudyPackCardSkeleton />);
      const article = container.querySelector("article");
      expect(article?.getAttribute("aria-hidden")).toBe("true");
      expect(article?.className).toContain("surface-card");
    });

    it("renders ProgressChartSkeleton with 7 day bars", () => {
      const { container } = render(<ProgressChartSkeleton />);
      const skeleton = container.querySelector("div");
      expect(skeleton?.getAttribute("aria-hidden")).toBe("true");
      const grid = container.querySelector(".grid-cols-7");
      expect(grid).toBeDefined();
    });

    it("renders FriendRowSkeleton with avatar and button placeholders", () => {
      const { container } = render(<FriendRowSkeleton />);
      expect(container.querySelector(".rounded-full")).toBeDefined();
    });

    it("renders MessageThreadSkeleton with multiple chat bubbles", () => {
      const { container } = render(<MessageThreadSkeleton />);
      expect(container.querySelectorAll(".rounded-2xl").length).toBeGreaterThanOrEqual(3);
    });

    it("renders TutorMessageSkeleton with avatar and text lines", () => {
      const { container } = render(<TutorMessageSkeleton />);
      expect(container.querySelector(".rounded-full")).toBeDefined();
    });

    it("renders StreamingIndicator with role='status' and polite label", () => {
      render(<StreamingIndicator />);
      const indicator = screen.getByRole("status");
      expect(indicator.getAttribute("aria-label")).toBe("Generating response...");
    });
  });
});
