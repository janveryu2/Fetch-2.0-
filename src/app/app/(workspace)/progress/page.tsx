"use client";
import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CalendarCheck,
  ChartLineUp,
  Fire,
  Target,
} from "@phosphor-icons/react";
import { useDemo } from "@/components/app/demo-provider";
import { useStudentPreferences } from "@/components/app/student-preferences-provider";
import { Button } from "@/components/ui/button";
import { ProgressChartSkeleton } from "@/components/ui/domain-skeletons";
import { getStudyRecommendation } from "@/lib/study-recommendation";
import { getActiveDraftSnapshot } from "@/lib/study-session-draft";
import { addDays, localDate, studyStreak } from "@/lib/study-stats";

function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getServerSnapshot() {
  return null;
}

export default function ProgressPage() {
  const { attempts, packs, mode, userId, status } = useDemo();
  const { preferences } = useStudentPreferences();
  const scopeId = mode === "account" && userId ? userId : "demo";
  const activeDraft = useSyncExternalStore(
    subscribeToStorage,
    () => getActiveDraftSnapshot(scopeId),
    getServerSnapshot,
  );

  const streakCount = studyStreak(attempts);
  const average = attempts.length
    ? Math.round(attempts.reduce((s, a) => s + a.score, 0) / attempts.length)
    : 0;
  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i - 6));
  const counts = days.map(
    (d) =>
      attempts.filter(
        (a) => localDate(new Date(a.completedAt)) === localDate(d),
      ).length,
  );

  const recommendation = getStudyRecommendation({
    scopeId,
    packs,
    attempts,
    activeDraft,
    studyGoal: preferences?.studyGoal,
    primarySubject: preferences?.primarySubject,
  });

  return (
    <div className="workspace">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Your learning journey</h1>
          <p className="page-description">
            See how your practice adds up and discover what to review next.
          </p>
        </div>
        <Button asChild>
          <Link href={recommendation.actionHref}>{recommendation.actionLabel}</Link>
        </Button>
      </div>

      {status === "loading" ? (
        <div className="mt-8 space-y-4" role="status" aria-label="Loading your progress">
          <ProgressChartSkeleton />
        </div>
      ) : attempts.length === 0 ? (
        <section className="mt-7 flex flex-col items-center gap-6 rounded-2xl bg-[var(--surface-subtle)] p-7 text-center sm:flex-row sm:text-left">
          <Image
            src="/assets/mascot/fetch-wave.png"
            alt="FETCH cheering you on"
            width={150}
            height={150}
            className="pixel-art"
          />
          <div>
            <h2 className="font-display text-2xl font-semibold">
              Your learning journey starts here.
            </h2>
            <p className="mt-2 text-[var(--text-secondary)]">
              Complete your first StudyPack to start building your study
              history and tracking your streak.
            </p>
            <Button asChild className="mt-5">
              <Link href={recommendation.actionHref}>{recommendation.actionLabel}</Link>
            </Button>
          </div>
        </section>
      ) : (
        <>
          {/* Suggested Next Action */}
          <section
            aria-labelledby="suggestion-heading"
            className="surface-card mt-6 border-l-4 border-l-[var(--fetch-blue-500)] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-[var(--fetch-blue-100)] px-2.5 py-0.5 text-xs font-semibold text-[var(--fetch-blue-800)] dark:bg-[var(--fetch-blue-950)] dark:text-[var(--fetch-blue-300)]">
                    {recommendation.badge}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">
                    Suggested next step
                  </span>
                </div>
                <h2 id="suggestion-heading" className="font-display mt-2 text-xl font-bold">
                  {recommendation.headline}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
                  {recommendation.reasonText}
                </p>
              </div>
              <Button asChild className="shrink-0 self-start sm:self-center">
                <Link href={recommendation.actionHref}>
                  {recommendation.actionLabel}
                </Link>
              </Button>
            </div>
          </section>

          <div className="mt-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {
                label: "Current streak",
                value: `${streakCount} ${streakCount === 1 ? "day" : "days"}`,
                icon: Fire,
              },
              { label: "Average accuracy", value: `${average}%`, icon: Target },
              {
                label: "Completed sessions",
                value: attempts.length,
                icon: ChartLineUp,
              },
              {
                label: "Questions answered",
                value: attempts.reduce((s, a) => s + a.total, 0),
                icon: CalendarCheck,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="surface-card p-5">
                <Icon size={24} className="text-[var(--fetch-blue-700)]" />
                <p className="font-display mt-4 text-3xl font-semibold">{value}</p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{label}</p>
              </div>
            ))}
          </div>

          <section className="surface-card mt-6 p-6">
            <h2 className="font-display text-2xl font-semibold">
              Practice this week
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Completed sessions over the last seven days ({counts.reduce((a, b) => a + b, 0)} {counts.reduce((a, b) => a + b, 0) === 1 ? "session" : "sessions"} total).
            </p>

            {/* Accessible ordered textual summary for screen readers */}
            <div className="sr-only">
              <h3>Weekly session history</h3>
              <ol>
                {days.map((d, i) => (
                  <li key={localDate(d)}>
                    {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: {counts[i]} {counts[i] === 1 ? "session" : "sessions"} completed
                  </li>
                ))}
              </ol>
            </div>

            {/* Visual bar chart */}
            <div
              className="mt-6 grid h-44 grid-cols-7 items-end gap-3"
              role="region"
              aria-label="Practice activity over the last seven days"
            >
              {days.map((d, i) => (
                <div
                  key={localDate(d)}
                  className="flex h-full flex-col items-center justify-end gap-2"
                >
                  <span className="text-sm font-bold" aria-hidden="true">{counts[i]}</span>
                  <div
                    aria-hidden="true"
                    className="w-full max-w-12 rounded-t-lg bg-[var(--fetch-blue-600)]"
                    style={{
                      height: `${Math.max(2, (counts[i] / Math.max(1, ...counts)) * 100)}px`,
                    }}
                  />
                  <span className="text-xs text-[var(--text-secondary)]" aria-hidden="true">
                    {d.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="sr-only">
                    {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}: {counts[i]} sessions
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="surface-card mt-6 p-6">
            <h2 className="font-display text-2xl font-semibold">
              Study history
            </h2>
            <div className="mt-3 divide-y divide-[var(--border-subtle)]">
              {attempts.map((a) => (
                <Link
                  href={`/app/study-packs/${a.packId}`}
                  key={a.id}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-extrabold">{a.packTitle}</h3>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {new Date(a.completedAt).toLocaleString()} · {a.correct}/
                      {a.total} correct
                    </p>
                  </div>
                  <span className="font-display text-2xl font-semibold text-[var(--fetch-blue-700)]">
                    {a.score}%
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
      <p className="mt-5 text-sm text-[var(--text-secondary)]">
        {mode === "account"
          ? "Based on completed practice synced to your account. Advanced topic insights are planned for Pro Max."
          : "Based on completed practice saved in this browser. Advanced topic insights are planned for Pro Max."}
      </p>
    </div>
  );
}
