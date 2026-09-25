"use client";
import Image from "next/image";
import Link from "next/link";
import {
  MusicNotes,
  Pause,
  Play,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTimer } from "@/components/tools/timer-provider";
import { useDemo } from "@/components/app/demo-provider";
import { tickTimer, timerText, type TimerMode } from "@/lib/focus-timer";
export default function PomodoroPage() {
  const { timer, setTimer, ready } = useTimer();
  const { packs } = useDemo();
  function mode(mode: TimerMode) {
    setTimer((t) => ({
      ...t,
      mode,
      remaining: t.durations[mode] * 60,
      endAt: null,
      completed: false,
    }));
  }
  return (
    <div className="workspace">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">A little time. A little focus.</h1>
          <p className="page-description">
            Give one thing your attention. The rest can wait.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/app/music">
            <MusicNotes />
            Music Studio
          </Link>
        </Button>
      </div>
      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="surface-card p-6 text-center sm:p-10">
          <div className="segment mx-auto w-fit">
            {(["Focus", "Short break", "Long break"] as TimerMode[]).map(
              (m) => (
                <button
                  key={m}
                  disabled={!ready}
                  aria-pressed={timer.mode === m}
                  onClick={() => mode(m)}
                >
                  {m}
                </button>
              ),
            )}
          </div>
          <div className="py-10">
            <p className="text-sm font-bold text-[var(--text-secondary)]">
              {timer.completed
                ? "Well done. Take a moment for yourself."
                : timer.endAt
                  ? "You’re making time for learning."
                  : "Settle in. Start when you’re ready."}
            </p>
            <p
              role="timer"
              aria-label={`${timer.mode}: ${timerText(timer.remaining)} remaining`}
              className="tabular mt-4 font-display text-[clamp(4rem,10vw,7rem)] font-medium leading-none"
            >
              {timerText(timer.remaining)}
            </p>
            <progress
              aria-label="Session progress"
              className="mt-8 h-2 w-full max-w-72 accent-[var(--action-bg)]"
              max={timer.durations[timer.mode] * 60}
              value={timer.durations[timer.mode] * 60 - timer.remaining}
            />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {timer.completed ? (
              <Button
                onClick={() =>
                  mode(timer.mode === "Focus" ? "Short break" : "Focus")
                }
              >
                Prepare {timer.mode === "Focus" ? "a break" : "to focus"}
              </Button>
            ) : (
              <Button
                disabled={!ready}
                onClick={() =>
                  setTimer((t) =>
                    t.endAt
                      ? { ...tickTimer(t, Date.now()), endAt: null }
                      : {
                          ...t,
                          endAt: Date.now() + t.remaining * 1000,
                          completed: false,
                        },
                  )
                }
              >
                {timer.endAt ? (
                  <>
                    <Pause />
                    Pause
                  </>
                ) : (
                  <>
                    <Play />
                    {timer.remaining === timer.durations[timer.mode] * 60
                      ? "Start"
                      : "Resume"}
                  </>
                )}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={!ready}
              onClick={() => mode(timer.mode)}
            >
              <ArrowCounterClockwise />
              Reset
            </Button>
          </div>
          <p className="mt-6 text-xs text-[var(--text-secondary)]">
            Your timer continues across workspace pages and refreshes.
          </p>
        </section>
        <aside className="space-y-5">
          <section className="surface-card p-5">
            <h2 className="font-display text-xl font-semibold">
              Make it your rhythm
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Changing the active duration resets that session.
            </p>
            <div className="mt-4 space-y-3">
              {(["Focus", "Short break", "Long break"] as TimerMode[]).map(
                (m) => (
                  <label key={m} className="field-label">
                    {m} (minutes)
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className="field"
                      value={timer.durations[m]}
                      disabled={!!timer.endAt || !ready}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 120)
                          setTimer((t) => ({
                            ...t,
                            durations: { ...t.durations, [m]: n },
                            ...(t.mode === m
                              ? { remaining: n * 60, completed: false }
                              : {}),
                          }));
                      }}
                    />
                  </label>
                ),
              )}
            </div>
            <label className="field-label mt-5">
              StudyPack context
              <select
                className="field"
                value={timer.packId}
                onChange={(e) =>
                  setTimer((t) => ({ ...t, packId: e.target.value }))
                }
              >
                <option value="">Independent focus session</option>
                {packs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            {packs.some((p) => p.id === timer.packId) && (
              <Link
                href={`/app/study/${timer.packId}`}
                className="mt-4 inline-flex min-h-11 items-center font-bold text-[var(--fetch-blue-700)]"
              >
                Open selected StudyPack
              </Link>
            )}
          </section>
          <div className="flex items-center gap-3">
            <Image
              src="/assets/mascot/fetch-seated.png"
              alt=""
              width={72}
              height={72}
              className="pixel-art"
            />
            <p className="text-sm text-[var(--text-secondary)]">
              Timer sessions don’t count as completed quizzes. Your study
              history stays accurate.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
