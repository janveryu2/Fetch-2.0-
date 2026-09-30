"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { X, ArrowRight } from "@phosphor-icons/react";
import { FetchLoadingMascot } from "@/components/study/fetch-loading-mascot";
import { ElapsedTimer } from "@/components/study/elapsed-timer";
import { useDemo } from "@/components/app/demo-provider";

export interface ActiveJobData {
  jobId: string;
  status: string;
  stage: string;
  artifactKind: "quiz" | "flashcards" | "summary";
  title: string;
  requestedCount: number;
  acceptedCount: number;
  packId?: string | null;
  createdAt: string;
}

export function ActiveGenerationIndicator() {
  const { mode, syncPack } = useDemo();
  const [activeJob, setActiveJob] = useState<ActiveJobData | null>(null);
  const [completedNotice, setCompletedNotice] = useState<{
    jobId: string;
    title: string;
    packId?: string | null;
    count: number;
  } | null>(null);

  const announcedJobIds = useRef<Set<string>>(new Set());
  const activeJobRef = useRef<ActiveJobData | null>(null);
  const activeJobId = activeJob?.jobId;

  useEffect(() => {
    if (mode !== "account") return;
    let mounted = true;
    let timer: NodeJS.Timeout | null = null;
    let polling = false;

    async function checkJobs() {
      if (polling) return;
      polling = true;
      try {
        const res = await fetch("/api/generate/jobs?active=1");
        if (!res.ok) return;
        const data = await res.json();
        if (!mounted) return;

        const jobs = Array.isArray(data?.jobs) ? (data.jobs as ActiveJobData[]) : [];
        const running = jobs.find(
          (j) => j.status === "in_progress" || j.status === "queued" || j.status === "retrying"
        );

        if (running) {
          activeJobRef.current = running;
          setActiveJob(running);
        } else {
          const previous = activeJobRef.current;
          if (previous && !announcedJobIds.current.has(previous.jobId)) {
            const response = await fetch(`/api/generate/job/${previous.jobId}`, { cache: "no-store" });
            if (!response.ok) return;
            const jobDetails = await response.json();
            if (jobDetails.status === "completed" && jobDetails.packId) {
              await syncPack(jobDetails.packId);
              if (!mounted) return;
              announcedJobIds.current.add(previous.jobId);
              setCompletedNotice({ jobId: previous.jobId, title: previous.title, packId: jobDetails.packId, count: jobDetails.acceptedCount || previous.requestedCount });
            }
          }
          if (!mounted) return;
          activeJobRef.current = null;
          setActiveJob(null);
        }
      } catch {
        // Best effort poll
      } finally { polling = false; }
    }

    // Initial check
    checkJobs();

    // Fast poll when an active job is present, slower otherwise
    const intervalMs = activeJobId ? 2500 : 15000;
    timer = setInterval(checkJobs, intervalMs);

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        checkJobs();
      }
    }

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", checkJobs);

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkJobs);
    };
  }, [activeJobId, mode, syncPack]);

  return (
    <>
      {/* Global Completion Toast / Notification */}
      {completedNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 right-4 z-[80] max-w-sm rounded-2xl border-2 border-[var(--fetch-blue-400)] bg-[var(--surface-card)] p-4 shadow-xl animate-in fade-in slide-in-from-top-4"
        >
          <div className="flex items-start gap-3">
            <FetchLoadingMascot size={36} variant="celebrate" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-[var(--fetch-blue-900)] text-sm">
                StudyPack Ready!
              </p>
              <p className="text-xs text-[var(--text-secondary)] truncate">
                {completedNotice.title} ({completedNotice.count} items)
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                {completedNotice.packId && (
                  <Link
                    href={`/app/study-packs/${completedNotice.packId}`}
                    onClick={() => setCompletedNotice(null)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--action-bg)] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[var(--action-hover)]"
                  >
                    Study now <ArrowRight size={13} weight="bold" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setCompletedNotice(null)}
                  className="rounded-lg border border-[var(--border-subtle)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close notification"
              onClick={() => setCompletedNotice(null)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Active Job Desktop Floating Pill */}
      {activeJob && (
        <aside
          role="status"
          aria-label="Background generation in progress"
          className="fixed bottom-6 right-6 z-40 hidden lg:flex items-center gap-3 rounded-full border border-[var(--fetch-blue-200)] bg-[var(--surface-card)] px-4 py-2.5 shadow-lg"
        >
          <FetchLoadingMascot size={28} variant="active" />
          <div className="text-xs">
            <p className="font-extrabold text-[var(--fetch-blue-900)] max-w-44 truncate">
              {activeJob.title}
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <span className="size-1.5 rounded-full bg-[var(--fetch-blue-500)] animate-pulse" />
              <span>{activeJob.stage === "batching" ? `${activeJob.acceptedCount}/${activeJob.requestedCount} accepted` : activeJob.stage}</span>
              <span>·</span>
              <ElapsedTimer startedAt={activeJob.createdAt} />
            </div>
          </div>
        </aside>
      )}

      {/* Active Job Mobile Non-Blocking Banner (positioned above mobile nav) */}
      {activeJob && (
        <aside
          role="status"
          aria-label="Background generation in progress"
          className="fixed inset-x-2 bottom-16 z-40 flex lg:hidden items-center justify-between gap-2 rounded-xl border border-[var(--fetch-blue-200)] bg-[var(--fetch-blue-50)] px-3 py-2 text-xs shadow-md"
        >
          <div className="flex items-center gap-2 min-w-0">
            <FetchLoadingMascot size={22} variant="active" />
            <span className="font-bold text-[var(--fetch-blue-900)] truncate">
              {activeJob.title}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-[11px]">
            <span className="font-semibold text-[var(--fetch-blue-800)]">
              {activeJob.acceptedCount}/{activeJob.requestedCount}
            </span>
            <ElapsedTimer startedAt={activeJob.createdAt} />
          </div>
        </aside>
      )}
    </>
  );
}
