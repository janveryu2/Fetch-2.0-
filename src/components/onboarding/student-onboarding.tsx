"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CalendarBlank, Stack, Timer, WarningCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FocusMinutes, StudyGoal, StudentPreferences } from "@/lib/student-preferences";

interface StudentOnboardingProps {
  displayName: string;
  initialPreferences: StudentPreferences;
  authSignal: "setup-username" | "username-taken" | null;
}

const GOAL_OPTIONS: { id: StudyGoal; label: string; desc: string }[] = [
  { id: "exam", label: "Prepare for an exam", desc: "Prioritize high-yield material and test readiness" },
  { id: "understand", label: "Understand difficult material", desc: "Break down complex topics into clear explanations" },
  { id: "habit", label: "Build a study habit", desc: "Keep up consistent, manageable daily review" },
];

const DURATION_OPTIONS: { minutes: FocusMinutes; label: string; desc: string }[] = [
  { minutes: 15, label: "15 minutes", desc: "Short focus sprint" },
  { minutes: 25, label: "25 minutes", desc: "Standard Pomodoro (recommended)" },
  { minutes: 45, label: "45 minutes", desc: "Deep work session" },
];

export function StudentOnboarding({
  displayName,
  initialPreferences,
  authSignal,
}: StudentOnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [subject, setSubject] = useState(initialPreferences.primarySubject ?? "");
  const [goal, setGoal] = useState<StudyGoal | null>(initialPreferences.studyGoal);
  const [focusMinutes, setFocusMinutes] = useState<FocusMinutes>(initialPreferences.focusMinutes || 25);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  async function handleSkip() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/account/study-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primarySubject: null,
          studyGoal: null,
          focusMinutes: 25,
          action: "skip",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to skip setup. Please try again.");
      }

      const target = authSignal ? `/app/home?auth=${authSignal}` : "/app/home";
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to skip setup. Please try again.");
      setSubmitting(false);
    }
  }

  async function handleFinish() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const cleanSubject = subject.trim();
      const response = await fetch("/api/account/study-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primarySubject: cleanSubject.length > 0 ? cleanSubject : null,
          studyGoal: goal,
          focusMinutes,
          action: "complete",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to save your preferences. Please try again.");
      }

      const data = await response.json();
      if (data?.preferences?.onboardingStatus === "completed" || data?.preferences?.onboardingStatus === "skipped") {
        setCompleted(true);
      } else {
        throw new Error("Unable to confirm setup completion.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save your preferences. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <div className="surface-card w-full max-w-[620px] overflow-hidden p-6 sm:p-9 text-center">
        <Image
          src="/assets/mascot/fetch-celebrate.png"
          alt="FETCH celebrating setup completion"
          width={140}
          height={140}
          className="pixel-art mx-auto w-[110px]"
        />
        <h1 className="font-display mt-4 text-3xl font-semibold text-[var(--text-primary)]">
          You&apos;re all set!
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Your study preferences have been saved. Take your first study step:
        </p>

        {authSignal && (
          <div
            role="status"
            className="my-5 rounded-xl border border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-4 text-left text-sm text-[var(--fetch-blue-900)]"
          >
            <strong>
              {authSignal === "username-taken" ? "Username taken:" : "Finish your profile:"}
            </strong>{" "}
            <span>
              {authSignal === "username-taken"
                ? "Your requested username was already claimed. Choose another anytime in "
                : "Choose your unique @username anytime in "}
              <Link href="/app/settings?auth=setup-username" className="font-extrabold underline">
                Settings
              </Link>
              .
            </span>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 text-left">
          <Link
            href="/app/home#add-material"
            className="group flex items-center justify-between rounded-2xl border-2 border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-50)] p-4 transition-colors hover:bg-[var(--fetch-blue-100)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[var(--fetch-blue-600)] text-white">
                <Stack size={24} weight="bold" />
              </div>
              <div>
                <strong className="block text-base font-extrabold text-[var(--fetch-blue-950)]">
                  Add study material
                </strong>
                <span className="text-xs text-[var(--fetch-blue-800)]">
                  Paste lecture notes or upload a PDF to generate your first StudyPack
                </span>
              </div>
            </div>
            <ArrowRight size={20} className="shrink-0 text-[var(--fetch-blue-600)] transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/app/calendar"
            className="group flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--text-primary)]">
                <CalendarBlank size={20} weight="bold" />
              </div>
              <div>
                <strong className="block text-sm font-bold text-[var(--text-primary)]">
                  Plan a study session
                </strong>
                <span className="text-xs text-[var(--text-secondary)]">
                  Schedule an upcoming exam or study block in your calendar
                </span>
              </div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-[var(--text-secondary)] transition-transform group-hover:translate-x-1" />
          </Link>

          <Link
            href="/app/pomodoro"
            className="group flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 transition-colors hover:bg-[var(--surface-subtle)]"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--text-primary)]">
                <Timer size={20} weight="bold" />
              </div>
              <div>
                <strong className="block text-sm font-bold text-[var(--text-primary)]">
                  Start a focus timer
                </strong>
                <span className="text-xs text-[var(--text-secondary)]">
                  Jump right into a {focusMinutes}-minute focused study interval
                </span>
              </div>
            </div>
            <ArrowRight size={18} className="shrink-0 text-[var(--text-secondary)] transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card w-full max-w-[620px] overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <Badge>Step {step} of 2</Badge>
          <span className="text-sm font-bold text-[var(--text-secondary)]">
            First-time setup
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
          <div
            className="h-full rounded-full bg-[var(--fetch-blue-600)] transition-[width]"
            style={{ width: `${(step / 2) * 100}%` }}
          />
        </div>
      </div>

      <div className="p-6 sm:p-9">
        <Image
          src="/assets/mascot/fetch-wave.png"
          alt="FETCH welcoming you"
          width={130}
          height={130}
          className="pixel-art mx-auto w-[100px]"
        />

        {authSignal && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-4 text-sm text-[var(--fetch-blue-900)]"
          >
            <strong>
              {authSignal === "username-taken" ? "Username already taken:" : "Finish your profile:"}
            </strong>{" "}
            <span>
              {authSignal === "username-taken"
                ? "Your requested username was already claimed. You can set another in "
                : "You can set your unique @username anytime in "}
              <Link href="/app/settings?auth=setup-username" className="font-extrabold underline">
                Settings
              </Link>
              .
            </span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
          >
            <WarningCircle size={20} className="shrink-0 text-red-600 mt-0.5" />
            <div>
              <p className="font-bold">Setup Error</p>
              <p className="text-xs text-red-800">{error}</p>
            </div>
          </div>
        )}

        {step === 1 ? (
          <div className="mt-4 space-y-6">
            <div className="text-center">
              <h1 className="font-display text-3xl font-semibold text-[var(--text-primary)]">
                What are you studying?
              </h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Welcome, {displayName}! We&apos;ll use this to suggest a useful first step. You can change it in Settings.
              </p>
            </div>

            <div>
              <label htmlFor="subject-input" className="block text-sm font-bold text-[var(--text-primary)]">
                Subject or course <span className="font-normal text-[var(--text-secondary)]">(optional)</span>
              </label>
              <input
                id="subject-input"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Biology, history, programming…"
                maxLength={100}
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--fetch-blue-600)] focus:ring-2 focus:ring-[var(--fetch-blue-200)]"
              />
            </div>

            <div>
              <span className="block text-sm font-bold text-[var(--text-primary)]">
                Main study goal <span className="font-normal text-[var(--text-secondary)]">(optional)</span>
              </span>
              <div className="mt-2 space-y-2.5" role="radiogroup" aria-label="Main study goal">
                {GOAL_OPTIONS.map((opt) => {
                  const isSelected = goal === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setGoal(isSelected ? null : opt.id)}
                      className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                        isSelected
                          ? "border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-50)] text-[var(--fetch-blue-950)]"
                          : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                      }`}
                    >
                      <div>
                        <strong className="block text-sm font-bold">{opt.label}</strong>
                        <span className="text-xs text-[var(--text-secondary)]">{opt.desc}</span>
                      </div>
                      <div
                        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                          isSelected
                            ? "border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-600)] text-white"
                            : "border-[var(--border-strong)]"
                        }`}
                      >
                        {isSelected && <Check size={12} weight="bold" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            <div className="text-center">
              <h1 className="font-display text-3xl font-semibold text-[var(--text-primary)]">
                How long would you like to focus?
              </h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                This will be your default Pomodoro focus duration. You can adjust it anytime in Pomodoro or Settings.
              </p>
            </div>

            <div className="space-y-3" role="radiogroup" aria-label="Preferred focus duration">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = focusMinutes === opt.minutes;
                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setFocusMinutes(opt.minutes)}
                    className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? "border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-50)] text-[var(--fetch-blue-950)]"
                        : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                    }`}
                  >
                    <div>
                      <strong className="block text-sm font-bold">{opt.label}</strong>
                      <span className="text-xs text-[var(--text-secondary)]">{opt.desc}</span>
                    </div>
                    <div
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                        isSelected
                          ? "border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-600)] text-white"
                          : "border-[var(--border-strong)]"
                      }`}
                    >
                      {isSelected && <Check size={12} weight="bold" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {step === 1 ? (
            <Button
              variant="secondary"
              type="button"
              onClick={() => void handleSkip()}
              disabled={submitting}
            >
              Skip for now
            </Button>
          ) : (
            <Button
              variant="secondary"
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
            >
              <ArrowLeft /> Back
            </Button>
          )}

          <div className="flex items-center gap-2">
            {step === 2 && (
              <Button
                variant="quiet"
                type="button"
                onClick={() => void handleSkip()}
                disabled={submitting}
              >
                Skip for now
              </Button>
            )}

            {step === 1 ? (
              <Button type="button" onClick={() => setStep(2)}>
                Continue <ArrowRight />
              </Button>
            ) : (
              <Button type="button" onClick={() => void handleFinish()} disabled={submitting}>
                {submitting ? "Saving preferences…" : "Finish setup"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
