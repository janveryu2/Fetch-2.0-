"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ElapsedTimer } from "@/components/study/elapsed-timer";
import { FetchLoadingMascot } from "@/components/study/fetch-loading-mascot";
import { cn } from "@/lib/cn";

export interface GenerationProgressProps {
  jobId: string;
  artifactKind: "quiz" | "flashcards" | "summary";
  title: string;
  stage: string;
  acceptedCount: number;
  requestedCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  cancelRequested?: boolean;
  cancelling?: boolean;
  onCancel?: () => void;
  className?: string;
}

export function getStageDescription(stage: string, artifactKind: string, acceptedCount: number, requestedCount: number) {
  switch (stage) {
    case "queued":
      return "FETCH is finding a worker. You can leave this page anytime.";
    case "claimed":
      return "A worker has started your generation...";
    case "extracting":
      return "Analyzing source material coverage...";
    case "batching":
      return artifactKind === "summary"
        ? "Generating high-yield summary sections..."
        : `Generating items in batches (${acceptedCount} of ${requestedCount} accepted)...`;
    case "grounding":
      return "Verifying factual grounding against source quotes...";
    case "finalizing":
      return "Saving StudyPack to your library...";
    case "retrying":
      return "A provider request needs another attempt. FETCH will retry automatically...";
    case "completed":
      return "Generation complete!";
    case "cancelled":
      return "Generation stopped. Quota was not charged.";
    default:
      return "Working on your study pack...";
  }
}

export function GenerationProgress({
  artifactKind,
  title,
  stage,
  acceptedCount,
  requestedCount,
  createdAt,
  updatedAt,
  cancelRequested,
  cancelling,
  onCancel,
  className,
}: GenerationProgressProps) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  const isFinalizing = stage === "finalizing" || stage === "completed";
  const kindLabel =
    artifactKind === "flashcards"
      ? "flashcards"
      : artifactKind === "quiz"
      ? "quiz questions"
      : "structured summary";

  const lastProgress = updatedAt || createdAt;
  const elapsedWithoutProgress = lastProgress ? now - new Date(lastProgress).getTime() : 0;
  const isSlow = ["queued", "claimed", "retrying"].includes(stage) && elapsedWithoutProgress > 20_000;
  const stageText = isSlow
    ? "This is taking longer than expected. FETCH will retry or stop the job automatically."
    : getStageDescription(stage, artifactKind, acceptedCount, requestedCount);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-5 rounded-2xl border border-[var(--fetch-blue-200)] bg-[var(--fetch-blue-50)] p-5 text-sm shadow-sm transition-all",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <FetchLoadingMascot size={44} variant={isFinalizing ? "celebrate" : "active"} />
          <div>
            <h4 className="font-extrabold text-[var(--fetch-blue-900)] text-base">
              FETCH is building your {artifactKind === "summary" ? "summary" : `${requestedCount} ${kindLabel}`}
            </h4>
            <p className="mt-0.5 text-xs text-[var(--fetch-blue-700)] font-medium">
              {title}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2.5 text-xs">
              <span className="inline-flex items-center gap-1.5 font-bold text-[var(--fetch-blue-900)] bg-[var(--fetch-blue-100)] px-2.5 py-1 rounded-full">
                <span className="size-2 rounded-full bg-[var(--fetch-blue-600)] animate-pulse" />
                {stageText}
              </span>

              {artifactKind !== "summary" && (
                <span className="font-semibold text-[var(--fetch-blue-800)]">
                  <strong>{acceptedCount}</strong> / {requestedCount} accepted
                </span>
              )}

              <span className="text-[var(--text-tertiary)]">·</span>
              <div className="flex items-center gap-1 text-[var(--text-secondary)]">
                <span>Elapsed:</span>
                <ElapsedTimer startedAt={createdAt} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:self-center shrink-0">
          {!isFinalizing && onCancel && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onCancel}
              disabled={cancelling || cancelRequested}
              className="text-xs"
            >
              {cancelRequested ? "Stopping..." : "Stop generation"}
            </Button>
          )}

          <Link
            href="/app/tutor"
            className="inline-flex items-center gap-1 text-xs font-bold text-[var(--fetch-blue-700)] hover:text-[var(--fetch-blue-900)] hover:underline px-2 py-1"
          >
            Study elsewhere <ArrowRight size={13} weight="bold" />
          </Link>
        </div>
      </div>
    </div>
  );
}
