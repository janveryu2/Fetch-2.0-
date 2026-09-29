"use client";
import Image from "next/image";
import Link from "next/link";
import {
  MusicNotes,
  Pause,
  Play,
  ArrowCounterClockwise,
  Bell,
  BellSlash,
  SpeakerSimpleHigh,
  SpeakerSimpleSlash,
  SkipForward,
  Target,
  Gear,
  Stack,
  CheckCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTimer } from "@/components/tools/timer-provider";
import { useDemo } from "@/components/app/demo-provider";
import { timerText, type TimerMode } from "@/lib/focus-timer";
import {
  getNotificationPermission,
} from "@/lib/notifications/study-notifications";
import { playStudySound } from "@/lib/audio/sound-controller";
import { useState, useSyncExternalStore } from "react";

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
  const { packs } = useDemo();
  const [overridePermission, setOverridePermission] = useState<string | null>(null);
  const clientPermission = useSyncExternalStore(
    () => () => {},
    getNotificationPermission,
    () => "default"
  );
  const notifPermission = overridePermission ?? clientPermission;
  const totalSeconds = timer.durations[timer.mode] * 60;
  const progressPercent = Math.min(100, Math.max(0, (totalSeconds - timer.remaining) / totalSeconds * 100));
  const selectedPack = packs.find((pack) => pack.id === timer.packId);
  return (
    <div className="workspace workspace--wide pomodoro-refresh">
      <div className="pomodoro-hero flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Focus today. <span>Brighter tomorrow.</span></h1>
          <p className="page-description">
            Small steps, big progress. Stay focused, take breaks, and keep going!
          </p>
        </div>
        <Image src="/assets/illustrations/fetch-study-companion.png" alt="" width={300} height={200} className="pomodoro-hero-mascot" />
        <Button variant="secondary" asChild className="relative z-10">
          <Link href="/app/music">
            <MusicNotes />
            Music Studio
          </Link>
        </Button>
      </div>
      <div className="mt-5 grid items-stretch gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="surface-card pomodoro-stage p-6 text-center sm:p-8">
          <div className="segment pomodoro-modes mx-auto w-fit">
            {(["Focus", "Short break", "Long break"] as TimerMode[]).map(
              (m) => (
                <button
                  key={m}
                  disabled={!ready}
                  aria-pressed={timer.mode === m}
                  onClick={() => resetTimer(m)}
                >
                  {m}
                </button>
              ),
            )}
          </div>
          <div className="pomodoro-dial my-8 mx-auto" style={{ background: "conic-gradient(var(--fetch-blue-600) " + progressPercent + "%, var(--fetch-blue-100) 0)" }}>
            <div className="pomodoro-dial-inner">
            <p className="text-sm font-bold text-[var(--text-secondary)]">
              {timer.completed
                ? "Well done. Take a moment for yourself."
                : timer.endAt
                  ? "Focus session"
                  : timer.mode + " session"}
            </p>
            <p
              role="timer"
              aria-label={`${timer.mode}: ${timerText(timer.remaining)} remaining`}
              className="tabular mt-4 font-display text-[clamp(3.5rem,9vw,6.5rem)] font-semibold leading-none"
            >
              {timerText(timer.remaining)}
            </p>
            <progress
              aria-label="Session progress"
              className="sr-only"
              max={totalSeconds}
              value={totalSeconds - timer.remaining}
            />
            <p className="mt-4 text-sm text-[var(--text-secondary)]">{timer.completed ? "Nicely done!" : timer.endAt ? "Stay focused! 💙" : "Ready when you are"}</p>
            <div role="status" aria-live="polite" className="sr-only">
              {timer.completed ? `${timer.mode} session completed.` : ""}
            </div>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {timer.completed ? (
              <Button
                onClick={() =>
                  resetTimer(timer.mode === "Focus" ? "Short break" : "Focus")
                }
              >
                Prepare {timer.mode === "Focus" ? "a break" : "to focus"}
              </Button>
            ) : (
              <Button
                disabled={!ready}
                onClick={timer.endAt ? pauseTimer : startTimer}
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
              onClick={() => resetTimer(timer.mode)}
            >
              <ArrowCounterClockwise />
              Reset
            </Button>
            <Button variant="secondary" disabled={!ready} onClick={() => resetTimer(timer.mode === "Focus" ? "Short break" : "Focus")}>
              <SkipForward /> Skip
            </Button>
          </div>
          <p className="mt-6 text-xs text-[var(--text-secondary)]">
            Your timer continues across workspace pages and refreshes.
          </p>
        </section>
        <aside className="space-y-5">
          <section className="surface-card pomodoro-settings p-5">
            <h2 className="font-display flex items-center gap-2 text-xl font-semibold"><Gear size={21} /> Timer Settings</h2>
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
              <span className="flex items-center gap-2"><Stack size={18} /> StudyPack context</span>
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
          <section className="surface-card pomodoro-settings p-5">
            <h2 className="font-display text-xl font-semibold">
              Alerts & notifications
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Stay in rhythm with audio cues and optional browser alerts.
            </p>
            <div className="mt-4 space-y-4">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                  {soundEnabled ? <SpeakerSimpleHigh size={18} /> : <SpeakerSimpleSlash size={18} />}
                  Sound effects
                </span>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="size-5 rounded border-[var(--border-strong)] accent-[var(--action-bg)]"
                />
              </label>

              {soundEnabled && (
                <div className="pl-6">
                  <Button
                    variant="quiet"
                    className="min-h-8 text-xs font-bold"
                    onClick={() => playStudySound("start-bark")}
                  >
                    Test chime
                  </Button>
                </div>
              )}

              <div className="border-t border-[var(--border-subtle)] pt-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                    {notificationsEnabled ? <Bell size={18} /> : <BellSlash size={18} />}
                    Browser alerts
                  </span>
                  <input
                    type="checkbox"
                    checked={notificationsEnabled}
                    disabled={notifPermission === "unsupported" || notifPermission === "denied"}
                    onChange={async (e) => {
                      if (e.target.checked) {
                        const granted = await requestNotifications();
                        setOverridePermission(getNotificationPermission());
                        if (!granted) {
                          setNotificationsEnabled(false);
                        }
                      } else {
                        setNotificationsEnabled(false);
                      }
                    }}
                    className="size-5 rounded border-[var(--border-strong)] accent-[var(--action-bg)] disabled:opacity-50"
                  />
                </label>
                <p className="mt-1.5 text-xs text-[var(--text-secondary)]">
                  {notifPermission === "unsupported"
                    ? "Notifications are not supported in this browser."
                    : notifPermission === "denied"
                      ? "Notifications are blocked in your browser settings. In-app status is still active."
                      : notificationsEnabled
                        ? "Browser alerts will sound when sessions finish, even from another tab."
                        : "Notify when sessions finish while working in other tabs."}
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>
      <div className="pomodoro-stats mt-5 grid gap-4 sm:grid-cols-3">
        <div className="surface-card flex items-center gap-4 p-5"><span className="pomodoro-stat-icon"><Target size={24} /></span><div><h3 className="font-bold">Session length</h3><p className="font-display text-xl">{timer.durations[timer.mode]} minutes</p></div></div>
        <div className="surface-card flex items-center gap-4 p-5"><span className="pomodoro-stat-icon is-warm"><CheckCircle size={24} /></span><div><h3 className="font-bold">Current session</h3><p className="text-sm text-[var(--text-secondary)]">{timer.completed ? "Completed" : timer.endAt ? "In progress" : "Ready to start"}</p></div></div>
        <div className="surface-card flex items-center gap-4 p-5"><span className="pomodoro-stat-icon is-green"><Stack size={24} /></span><div><h3 className="font-bold">StudyPack context</h3><p className="truncate text-sm text-[var(--text-secondary)]">{selectedPack?.title ?? "Independent focus"}</p></div></div>
      </div>
    </div>
  );
}
