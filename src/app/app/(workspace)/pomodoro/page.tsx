"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useSyncExternalStore, useMemo } from "react";
import {
  MusicNotes,
  Pause,
  Play,
  ArrowCounterClockwise,
  SkipForward,
  Target,
  Gear,
  Stack,
  CheckCircle,
  Coffee,
  Sun,
  Flame,
  Lightbulb,
  ArrowsClockwise,
  CaretRight,
  Timer,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTimer } from "@/components/tools/timer-provider";
import { useDemo } from "@/components/app/demo-provider";
import { timerText } from "@/lib/focus-timer";
import { getNotificationPermission } from "@/lib/notifications/study-notifications";
import { playStudySound } from "@/lib/audio/sound-controller";
import { cn } from "@/lib/cn";

const STUDY_TIPS = [
  "A 5-minute break can boost your focus and creativity.",
  "Switching topics between sessions helps build stronger neural pathways.",
  "Hydrating and standing up during breaks prevents screen fatigue.",
  "Active recall with flashcards is 50% more effective than passive re-reading.",
  "Consistent 25-minute sprints reduce procrastination and study burnout.",
];

export default function PomodoroPage() {
  const {
    timer,
    setTimer,
    ready,
    soundEnabled,
    setSoundEnabled,
    notificationsEnabled,
    setNotificationsEnabled,
    requestNotifications,
    startTimer,
    pauseTimer,
    resetTimer,
  } = useTimer();
  const { packs, attempts } = useDemo();
  const [overridePermission, setOverridePermission] = useState<string | null>(null);
  const [tipIndex, setTipIndex] = useState(0);

  const clientPermission = useSyncExternalStore(
    () => () => {},
    getNotificationPermission,
    () => "default",
  );
  const notifPermission = overridePermission ?? clientPermission;
  const totalSeconds = timer.durations[timer.mode] * 60;
  const progressPercent = Math.min(100, Math.max(0, ((totalSeconds - timer.remaining) / totalSeconds) * 100));

  // Compute completed sessions & streaks from real attempts and session state
  const { completedTodayCount, streakDays, completedMinutesText } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayAttempts = attempts.filter(
      (a) => new Date(a.completedAt).getTime() >= startOfToday,
    );
    const count = todayAttempts.length + (timer.completed ? 1 : 0);

    const dayTimestamps = Array.from(
      new Set(
        attempts.map((a) => {
          const d = new Date(a.completedAt);
          return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        }),
      ),
    ).sort((a, b) => b - a);

    let streak = 0;
    let checkDate = startOfToday;
    const oneDay = 86400000;

    if (!dayTimestamps.includes(checkDate)) {
      checkDate -= oneDay;
    }

    while (dayTimestamps.includes(checkDate)) {
      streak++;
      checkDate -= oneDay;
    }

    const minutes = count * timer.durations.Focus;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const minutesText =
      hours > 0 ? `That's ${hours}h ${mins}m` : `That's ${minutes}m`;

    return {
      completedTodayCount: count,
      streakDays: Math.max(1, streak),
      completedMinutesText: minutesText,
    };
  }, [attempts, timer.completed, timer.durations.Focus]);

  const goalSessions = 6;

  return (
    <div className="workspace workspace--wide pomodoro-refresh">
      {/* Hero Banner with Mascot Artwork */}
      <div className="pomodoro-hero relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-gradient-to-r from-[#F0F7FF] via-[#E4EFFF] to-[#CDE2FD] p-6 sm:p-8 shadow-xs">
        <div className="relative z-10 max-w-[580px]">
          <h1 className="page-title font-display text-3xl sm:text-4xl font-black tracking-tight text-[#0F264A] dark:text-white">
            Focus today. <span className="text-[#1068E9] dark:text-[#4da3ff]">Brighter tomorrow.</span>
          </h1>
          <p className="page-description mt-2 text-sm sm:text-base text-[#38557D] dark:text-blue-100">
            Small steps, big progress. Stay focused, take breaks, and keep going!
          </p>
        </div>

        <Image
          src="/assets/illustrations/fetch-study-companion.png"
          alt="FETCH resting on books"
          width={320}
          height={210}
          className="pomodoro-hero-mascot select-none pointer-events-none"
          priority
        />

        <Button asChild variant="secondary" className="relative z-10 rounded-xl font-bold shadow-xs">
          <Link href="/app/music">
            <MusicNotes weight="bold" />
            Music Studio &rarr;
          </Link>
        </Button>
      </div>

      {/* Main Grid: Stage (left) + Settings (right) */}
      <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left: Pomodoro Stage */}
        <section className="surface-card pomodoro-stage relative flex flex-col items-center justify-between overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-white/80 dark:bg-[var(--surface-card)] p-6 sm:p-8 text-center shadow-xs backdrop-blur-xs min-h-[500px]">
          {/* Subtle Background Desk Artwork */}
          <div className="pointer-events-none absolute inset-0 select-none">
            <div className="absolute -bottom-2 -left-2 w-48 sm:w-56 opacity-20 sm:opacity-35">
              <Image
                src="/assets/illustrations/fetch-pomodoro-books.png"
                alt=""
                width={260}
                height={290}
                className="object-contain"
              />
            </div>
            <div className="absolute -bottom-2 -right-2 w-48 sm:w-56 opacity-20 sm:opacity-35">
              <Image
                src="/assets/illustrations/fetch-pomodoro-desk.png"
                alt=""
                width={270}
                height={215}
                className="object-contain"
              />
            </div>
          </div>

          {/* Mode Pill Selector */}
          <div className="relative z-10 inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-white/95 dark:bg-[var(--surface-card)] p-1.5 shadow-sm">
            {(
              [
                { mode: "Focus", label: "Focus", icon: Target },
                { mode: "Short break", label: "Short Break", icon: Coffee },
                { mode: "Long break", label: "Long Break", icon: Sun },
              ] as const
            ).map(({ mode, label, icon: Icon }) => {
              const isActive = timer.mode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={!ready}
                  aria-pressed={isActive}
                  onClick={() => resetTimer(mode)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-5 py-2 text-xs font-black transition-all cursor-pointer",
                    isActive
                      ? "bg-[#1068E9] text-white shadow-xs"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-slate-50 dark:hover:bg-slate-800",
                  )}
                >
                  <Icon size={16} weight={isActive ? "fill" : "bold"} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Circular SVG Timer Dial */}
          <div className="relative z-10 my-6 flex items-center justify-center">
            <svg className="size-64 sm:size-72 -rotate-90 transform" viewBox="0 0 260 260">
              <circle
                cx="130"
                cy="130"
                r="110"
                className="stroke-[#E2EEFE] dark:stroke-slate-700"
                strokeWidth="12"
                fill="transparent"
              />
              <circle
                cx="130"
                cy="130"
                r="110"
                className="stroke-[#1068E9] transition-all duration-500 ease-out"
                strokeWidth="12"
                strokeDasharray={2 * Math.PI * 110}
                strokeDashoffset={2 * Math.PI * 110 * (1 - progressPercent / 100)}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Dial Inner Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
                {timer.completed
                  ? "Well done!"
                  : timer.endAt
                    ? `${timer.mode} Session`
                    : `${timer.mode} Session`}
              </span>
              <p
                role="timer"
                aria-label={`${timer.mode}: ${timerText(timer.remaining)} remaining`}
                className="tabular font-display my-1 text-5xl sm:text-6xl font-black text-[#0F264A] dark:text-white tracking-tight"
              >
                {timerText(timer.remaining)}
              </p>
              <progress
                aria-label="Session progress"
                className="sr-only"
                max={totalSeconds}
                value={totalSeconds - timer.remaining}
              />
              <span className="text-xs font-bold text-[#1068E9]">
                {timer.completed
                  ? "Session complete! 🎉"
                  : timer.endAt
                    ? "Stay focused! 💙"
                    : "Ready when you are"}
              </span>
              <div role="status" aria-live="polite" className="sr-only">
                {timer.completed ? `${timer.mode} session completed.` : ""}
              </div>
            </div>
          </div>

          {/* Action Buttons Row */}
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-3">
            {timer.completed ? (
              <button
                type="button"
                onClick={() =>
                  resetTimer(timer.mode === "Focus" ? "Short break" : "Focus")
                }
                className="flex min-w-[140px] items-center justify-center gap-2 rounded-full bg-[#1068E9] px-7 py-3 text-sm font-black text-white shadow-md hover:bg-[#0D57C5] transition-all active:scale-95 cursor-pointer"
              >
                <span>Prepare {timer.mode === "Focus" ? "a break" : "to focus"}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!ready}
                onClick={timer.endAt ? pauseTimer : startTimer}
                className="flex min-w-[140px] items-center justify-center gap-2 rounded-full bg-[#1068E9] px-7 py-3 text-sm font-black text-white shadow-md hover:bg-[#0D57C5] transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {timer.endAt ? (
                  <>
                    <Pause size={18} weight="fill" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play size={18} weight="fill" className="ml-0.5" />
                    <span>{timer.remaining === totalSeconds ? "Start" : "Resume"}</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              disabled={!ready}
              onClick={() => resetTimer(timer.mode)}
              className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-white dark:bg-[var(--surface-subtle)] px-5 py-3 text-xs font-bold text-[var(--text-primary)] shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <ArrowCounterClockwise size={16} weight="bold" />
              <span>Reset</span>
            </button>

            <button
              type="button"
              disabled={!ready}
              onClick={() => resetTimer(timer.mode === "Focus" ? "Short break" : "Focus")}
              className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-white dark:bg-[var(--surface-subtle)] px-5 py-3 text-xs font-bold text-[var(--text-primary)] shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
            >
              <SkipForward size={16} weight="bold" />
              <span>Skip</span>
            </button>
          </div>

          <p className="relative z-10 mt-4 text-[11px] text-[var(--text-tertiary)]">
            Your timer continues across workspace pages and refreshes.
          </p>
        </section>

        {/* Right: Timer Settings */}
        <aside className="space-y-4">
          <section className="surface-card rounded-3xl border border-[var(--border-subtle)] p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-display flex items-center gap-2 text-base font-extrabold text-[var(--text-primary)]">
                  <Gear size={20} weight="bold" className="text-[#1068E9]" />
                  <span>Timer Settings</span>
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setTimer((t) => ({
                      ...t,
                      durations: { Focus: 25, "Short break": 5, "Long break": 15 },
                      remaining: t.mode === "Focus" ? 25 * 60 : t.mode === "Short break" ? 5 * 60 : 15 * 60,
                    }));
                  }}
                  className="text-xs font-bold text-[#1068E9] hover:underline cursor-pointer"
                >
                  Save as default
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {/* Focus duration */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                    Focus duration (minutes)
                  </label>
                  <div className="relative flex items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 focus-within:border-[#1068E9] focus-within:ring-2 focus-within:ring-[#1068E9]/15">
                    <Timer size={18} className="mr-2 text-[var(--text-tertiary)] shrink-0" weight="bold" />
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className="w-full bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none"
                      value={timer.durations.Focus}
                      disabled={!!timer.endAt || !ready}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 120) {
                          setTimer((t) => ({
                            ...t,
                            durations: { ...t.durations, Focus: n },
                            ...(t.mode === "Focus" ? { remaining: n * 60, completed: false } : {}),
                          }));
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Short break duration */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                    Short break (minutes)
                  </label>
                  <div className="relative flex items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 focus-within:border-[#1068E9] focus-within:ring-2 focus-within:ring-[#1068E9]/15">
                    <Coffee size={18} className="mr-2 text-[var(--text-tertiary)] shrink-0" weight="bold" />
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className="w-full bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none"
                      value={timer.durations["Short break"]}
                      disabled={!!timer.endAt || !ready}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 120) {
                          setTimer((t) => ({
                            ...t,
                            durations: { ...t.durations, "Short break": n },
                            ...(t.mode === "Short break" ? { remaining: n * 60, completed: false } : {}),
                          }));
                        }
                      }}
                    />
                  </div>
                </div>

                {/* Long break duration */}
                <div>
                  <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                    Long break (minutes)
                  </label>
                  <div className="relative flex items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 focus-within:border-[#1068E9] focus-within:ring-2 focus-within:ring-[#1068E9]/15">
                    <Sun size={18} className="mr-2 text-[var(--text-tertiary)] shrink-0" weight="bold" />
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className="w-full bg-transparent text-sm font-bold text-[var(--text-primary)] outline-none"
                      value={timer.durations["Long break"]}
                      disabled={!!timer.endAt || !ready}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n >= 1 && n <= 120) {
                          setTimer((t) => ({
                            ...t,
                            durations: { ...t.durations, "Long break": n },
                            ...(t.mode === "Long break" ? { remaining: n * 60, completed: false } : {}),
                          }));
                        }
                      }}
                    />
                  </div>
                </div>

                {/* StudyPack Context */}
                <div className="pt-1">
                  <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">
                    StudyPack context
                  </label>
                  <div className="relative flex items-center rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-3 py-2 focus-within:border-[#1068E9] focus-within:ring-2 focus-within:ring-[#1068E9]/15">
                    <Stack size={18} className="mr-2 text-[var(--text-tertiary)] shrink-0" weight="bold" />
                    <select
                      className="w-full bg-transparent text-xs font-bold text-[var(--text-primary)] outline-none cursor-pointer"
                      value={timer.packId}
                      onChange={(e) => setTimer((t) => ({ ...t, packId: e.target.value }))}
                    >
                      <option value="">Independent focus session</option>
                      {packs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="mt-5 space-y-4 border-t border-[var(--border-subtle)] pt-4">
                {/* Browser notifications toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="block text-xs font-bold text-[var(--text-primary)]">
                      Browser notifications
                    </span>
                    <span className="block text-[11px] text-[var(--text-secondary)]">
                      Get notified when a session ends
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notificationsEnabled}
                    disabled={notifPermission === "unsupported" || notifPermission === "denied"}
                    onClick={async () => {
                      if (!notificationsEnabled) {
                        const granted = await requestNotifications();
                        setOverridePermission(getNotificationPermission());
                        if (!granted) {
                          setNotificationsEnabled(false);
                        }
                      } else {
                        setNotificationsEnabled(false);
                      }
                    }}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1068E9] disabled:cursor-not-allowed disabled:opacity-50",
                      notificationsEnabled ? "bg-[#1068E9]" : "bg-slate-200",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                        notificationsEnabled ? "translate-x-5" : "translate-x-0",
                      )}
                    />
                  </button>
                </div>

                {/* Sound effects toggle */}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--text-primary)]">
                        Sound effects
                      </span>
                      {soundEnabled && (
                        <button
                          type="button"
                          onClick={() => playStudySound("start-bark")}
                          className="text-[10px] font-bold text-[#1068E9] hover:underline cursor-pointer"
                        >
                          (Test chime)
                        </button>
                      )}
                    </div>
                    <span className="block text-[11px] text-[var(--text-secondary)]">
                      Play sounds for start, breaks and end
                    </span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={soundEnabled}
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={cn(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#1068E9]",
                      soundEnabled ? "bg-[#1068E9]" : "bg-slate-200",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                        soundEnabled ? "translate-x-5" : "translate-x-0",
                      )}
                    />
                  </button>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Bottom 4 Status Cards */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Today's Focus Goal */}
        <div className="surface-card relative flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-blue-50 text-[#1068E9]">
              <Target size={22} weight="bold" />
            </span>
            <CaretRight size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="mt-3">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Today&apos;s Focus Goal</span>
            <h3 className="font-display text-xl font-extrabold text-[var(--text-primary)]">
              {completedTodayCount} / {goalSessions} sessions
            </h3>
            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
              <div
                className="h-full rounded-full bg-[#1068E9] transition-all duration-300"
                style={{ width: `${Math.min(100, (completedTodayCount / goalSessions) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Current Streak */}
        <div className="surface-card relative flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
              <Flame size={22} weight="fill" />
            </span>
            <span className="text-xs font-bold text-amber-500">✨</span>
          </div>
          <div className="mt-3">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Current Streak</span>
            <h3 className="font-display text-xl font-extrabold text-[var(--text-primary)]">
              {streakDays} {streakDays === 1 ? "day" : "days"}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Keep it up!</p>
          </div>
        </div>

        {/* Card 3: Completed Today */}
        <div className="surface-card relative flex flex-col justify-between rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
              <CheckCircle size={22} weight="fill" />
            </span>
            <CaretRight size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="mt-3">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Completed Today</span>
            <h3 className="font-display text-xl font-extrabold text-[var(--text-primary)]">
              {completedTodayCount} {completedTodayCount === 1 ? "session" : "sessions"}
            </h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {completedTodayCount > 0 ? `${completedMinutesText} of focused work!` : "Start your first session today!"}
            </p>
          </div>
        </div>

        {/* Card 4: Study Tip */}
        <div className="surface-card relative flex flex-col justify-between overflow-hidden rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-black text-amber-600">
              <Lightbulb size={18} weight="fill" />
              <span>Study Tip</span>
            </div>
            <button
              type="button"
              onClick={() => setTipIndex((i) => (i + 1) % STUDY_TIPS.length)}
              aria-label="Next tip"
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <ArrowsClockwise size={16} weight="bold" />
            </button>
          </div>
          <div className="mt-3 pr-12">
            <p className="text-xs font-semibold leading-relaxed text-[var(--text-primary)]">
              {STUDY_TIPS[tipIndex]}
            </p>
          </div>
          <Image
            src="/assets/illustrations/fetch-tip-peek.png"
            alt=""
            width={70}
            height={50}
            className="pointer-events-none absolute -bottom-1 -right-1 select-none"
          />
        </div>
      </div>
    </div>
  );
}
