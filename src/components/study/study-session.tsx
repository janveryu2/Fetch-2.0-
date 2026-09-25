"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDemo } from "@/components/app/demo-provider";
import {
  clearStudySessionDraft,
  computePackFingerprint,
  loadStudySessionDraft,
  saveStudySessionDraft,
  type StudySessionDraft,
} from "@/lib/study-session-draft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AnswerFeedback = { correct: boolean; answer?: string; explanation: string };

export function StudySession({ packId }: { packId: string }) {
  const { packs, addAttempt, mode, status } = useDemo();
  const pack = packs.find((item) => item.id === packId);

  const scopeId = mode === "account" ? "account" : "demo";
  const [clientAttemptId, setClientAttemptId] = useState(() => crypto.randomUUID());
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [submittedAnswers, setSubmittedAnswers] = useState<
    Array<{ questionId: string; answer: string; correct?: boolean }>
  >([]);
  const [attemptScore, setAttemptScore] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);
  const [startedAt, setStartedAt] = useState(() => new Date().toISOString());

  // Resume / discard modal state
  const [pendingDraft, setPendingDraft] = useState<StudySessionDraft | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // Focus and scroll refs
  const questionHeadingRef = useRef<HTMLHeadingElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const initialCheckDone = useRef(false);

  // Check for existing draft on initial mount or when pack is ready
  useEffect(() => {
    if (!pack) return;
    const frame = requestAnimationFrame(() => {
      const result = loadStudySessionDraft(scopeId, pack);
      if (
        result.success &&
        !result.draft.isCompleted &&
        (result.draft.currentIndex > 0 ||
          result.draft.submittedAnswers.length > 0 ||
          result.draft.checked ||
          result.draft.currentAnswer.trim().length > 0)
      ) {
        setPendingDraft(result.draft);
      }
      initialCheckDone.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [pack, scopeId]);

  const question = pack?.questions[index];
  const localCorrect = useMemo(
    () =>
      question
        ? answer.trim().toLowerCase() === (question.answer ?? "").trim().toLowerCase()
        : false,
    [answer, question],
  );

  // Persist draft after transitions
  useEffect(() => {
    const hasProgress =
      index > 0 ||
      submittedAnswers.length > 0 ||
      checked ||
      answer.trim().length > 0;

    if (!pack || finished || pendingDraft || !initialCheckDone.current || !hasProgress) {
      return;
    }

    saveStudySessionDraft({
      version: 1,
      sessionId: clientAttemptId,
      clientAttemptId,
      scopeId,
      packId,
      packTitle: pack.title,
      packFingerprint: computePackFingerprint(pack),
      currentIndex: index,
      currentAnswer: answer,
      checked,
      feedback,
      submittedAnswers,
      startedAt,
      updatedAt: new Date().toISOString(),
      isCompleted: false,
    });
  }, [
    answer,
    checked,
    clientAttemptId,
    feedback,
    finished,
    index,
    pack,
    packId,
    pendingDraft,
    scopeId,
    startedAt,
    submittedAnswers,
  ]);

  if (status === "loading" && !pack) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--fetch-blue-200)] border-t-[var(--fetch-blue-700)]" />
        <p className="mt-4 text-sm font-semibold text-[var(--text-secondary)]">
          Loading study session...
        </p>
      </div>
    );
  }

  if (!pack || !question) {
    return (
      <div className="mx-auto max-w-lg px-5 py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">
          Study session unavailable
        </h1>
        <Button asChild className="mt-6">
          <Link href="/app/study-packs">Return to StudyPacks</Link>
        </Button>
      </div>
    );
  }

  const activePack = pack;
  const activeQuestion = question;
  const isCorrect = mode === "account" ? feedback?.correct === true : localCorrect;

  function handleResume() {
    if (!pendingDraft) return;
    setIndex(pendingDraft.currentIndex);
    setAnswer(pendingDraft.currentAnswer);
    setChecked(pendingDraft.checked);
    setFeedback(pendingDraft.feedback);
    setSubmittedAnswers(pendingDraft.submittedAnswers);
    setClientAttemptId(pendingDraft.clientAttemptId);
    setStartedAt(pendingDraft.startedAt);
    const correctSoFar = pendingDraft.submittedAnswers.filter((a) => a.correct).length;
    setCorrectCount(correctSoFar);
    setPendingDraft(null);

    // Scroll to active question
    requestAnimationFrame(() => {
      questionHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleStartFresh() {
    clearStudySessionDraft(scopeId, packId);
    setPendingDraft(null);
  }

  async function submit() {
    if (checked || checking || !answer.trim()) return;
    setActionError("");

    if (mode === "account") {
      setChecking(true);
      try {
        const response = await fetch(`/api/study-packs/${packId}/answer`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ questionId: activeQuestion.id, answer: answer.trim() }),
        });
        const data = (await response.json()) as {
          error?: string;
          correct?: boolean;
          answer?: string;
          explanation?: string;
        };
        if (!response.ok || typeof data.correct !== "boolean" || !data.answer) {
          throw new Error(data.error || "This answer could not be checked.");
        }
        setFeedback({
          correct: data.correct,
          answer: data.answer,
          explanation: data.explanation || "",
        });
        setSubmittedAnswers((current) => [
          ...current,
          { questionId: activeQuestion.id, answer: answer.trim(), correct: data.correct },
        ]);
        if (data.correct) setCorrectCount((value) => value + 1);
        setChecked(true);

        requestAnimationFrame(() => {
          feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          feedbackRef.current?.focus();
        });
      } catch (reason) {
        setActionError(
          reason instanceof Error ? reason.message : "This answer could not be checked.",
        );
      } finally {
        setChecking(false);
      }
      return;
    }

    setFeedback({
      correct: localCorrect,
      answer: activeQuestion.answer ?? "",
      explanation: activeQuestion.explanation ?? "",
    });
    setSubmittedAnswers((current) => [
      ...current,
      { questionId: activeQuestion.id, answer: answer.trim(), correct: localCorrect },
    ]);
    setChecked(true);
    if (localCorrect) setCorrectCount((value) => value + 1);

    requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      feedbackRef.current?.focus();
    });
  }

  async function next() {
    if (index === activePack.questions.length - 1) {
      if (mode === "account") {
        if (saving || saved) return;
        setSaving(true);
        setActionError("");
        try {
          const response = await fetch(`/api/study-packs/${packId}/attempts`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              clientAttemptId,
              answers: submittedAnswers.map(({ questionId, answer: ans }) => ({
                questionId,
                answer: ans,
              })),
            }),
          });
          const data = (await response.json()) as {
            error?: string;
            attempt?: {
              id: string;
              score: number;
              correct: number;
              total: number;
              completedAt: string;
            };
          };
          if (!response.ok || !data.attempt) {
            throw new Error(data.error || "FETCH could not save this attempt.");
          }
          setCorrectCount(data.attempt.correct);
          setAttemptScore(data.attempt.score);
          addAttempt({ ...data.attempt, packId, packTitle: activePack.title });
          setSaved(true);
          clearStudySessionDraft(scopeId, packId);
          setFinished(true);

          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: "instant" });
            resultHeadingRef.current?.focus();
          });
        } catch (reason) {
          setActionError(
            reason instanceof Error ? reason.message : "FETCH could not save this attempt.",
          );
        } finally {
          setSaving(false);
        }
        return;
      }

      // Demo mode completion
      const score = Math.round((correctCount / activePack.questions.length) * 100);
      if (!saved) {
        addAttempt({
          id: clientAttemptId,
          packId,
          packTitle: activePack.title,
          score,
          correct: correctCount,
          total: activePack.questions.length,
          completedAt: new Date().toISOString(),
        });
        setSaved(true);
      }
      clearStudySessionDraft(scopeId, packId);
      setFinished(true);

      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: "instant" });
        resultHeadingRef.current?.focus();
      });
      return;
    }

    setIndex((value) => value + 1);
    setAnswer("");
    setChecked(false);
    setFeedback(null);
    setActionError("");

    requestAnimationFrame(() => {
      questionHeadingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      questionHeadingRef.current?.focus();
    });
  }

  // Resume prompt overlay
  if (pendingDraft) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <Image
          src="/assets/mascot/fetch-active.png"
          alt="FETCH ready"
          width={180}
          height={180}
          className="pixel-art mx-auto"
        />
        <h1 className="font-display mt-5 text-3xl font-semibold">
          Resume your study session?
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          You were on question {pendingDraft.currentIndex + 1} of{" "}
          {activePack.questions.length} with {pendingDraft.submittedAnswers.length} answer
          {pendingDraft.submittedAnswers.length === 1 ? "" : "s"} saved.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={handleResume} size="lg">
            Resume session
          </Button>
          <Button variant="secondary" onClick={handleStartFresh} size="lg">
            Start fresh
          </Button>
        </div>
      </div>
    );
  }

  if (finished) {
    const score = attemptScore ?? Math.round((correctCount / pack.questions.length) * 100);
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col items-center justify-center px-5 py-12 text-center">
        <Image
          src="/assets/mascot/fetch-celebrate.png"
          alt="FETCH celebrating the completed quiz"
          width={300}
          height={300}
          className="pixel-art w-[240px]"
        />
        <Badge tone="success">QUIZ COMPLETE</Badge>
        <h1
          ref={resultHeadingRef}
          tabIndex={-1}
          className="font-display mt-5 text-5xl font-semibold focus:outline-none"
        >
          Here&apos;s how you did
        </h1>
        <p className="font-display mt-5 text-6xl font-semibold text-[var(--fetch-blue-600)]">
          {score}%
        </p>
        <p className="mt-3 text-lg text-[var(--text-secondary)]">
          {correctCount} of {pack.questions.length} correct ·{" "}
          {mode === "account" ? "saved to your account" : "saved in this browser"}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/app/progress">View progress</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/app/study-packs/${packId}`}>Return to StudyPack</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-7 lg:py-12">
      <div className="flex items-center justify-between gap-4">
        {index > 0 || submittedAnswers.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowExitConfirm(true)}
            className="inline-flex items-center gap-2 font-extrabold text-[var(--fetch-blue-700)] hover:underline"
          >
            <ArrowLeft /> Exit
          </button>
        ) : (
          <Link
            href={`/app/study-packs/${packId}`}
            className="inline-flex items-center gap-2 font-extrabold text-[var(--fetch-blue-700)] hover:underline"
          >
            <ArrowLeft /> Exit
          </Link>
        )}
        <span className="font-extrabold">
          Question {index + 1} of {pack.questions.length}
        </span>
      </div>

      <div className="mt-5 h-2 overflow-hidden rounded-full bg-[var(--fetch-blue-100)]">
        <div
          className="h-full rounded-full bg-[var(--fetch-blue-600)] transition-[width]"
          style={{ width: `${((index + 1) / pack.questions.length) * 100}%` }}
        />
      </div>

      {showExitConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm exit"
          className="surface-card mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-950"
        >
          <h2 className="font-display text-xl font-semibold">Exit this study session?</h2>
          <p className="mt-1 text-sm text-amber-900">
            Your progress on question {index + 1} is protected in this browser. You can resume anytime.
          </p>
          <div className="mt-4 flex gap-3">
            <Button size="sm" onClick={() => setShowExitConfirm(false)}>
              Keep studying
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/app/study-packs/${packId}`}>Save & exit</Link>
            </Button>
          </div>
        </div>
      )}

      <section className="surface-card mt-8 p-6 sm:p-9">
        <Badge>
          {question.type === "multiple_choice"
            ? "Multiple choice"
            : "Fill in the blank"}
        </Badge>
        <h1
          ref={questionHeadingRef}
          tabIndex={-1}
          className="font-display mt-6 text-balance text-3xl font-semibold leading-tight sm:text-4xl focus:outline-none"
        >
          {question.prompt}
        </h1>

        {question.type === "multiple_choice" && question.choices ? (
          <fieldset className="mt-8 space-y-3" disabled={checked}>
            <legend className="sr-only">Choose an answer</legend>
            {question.choices.map((choice) => (
              <label
                key={choice}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-strong)] px-4 font-bold has-[:checked]:border-[var(--fetch-blue-600)] has-[:checked]:bg-[var(--fetch-blue-50)]"
              >
                <input
                  type="radio"
                  name="answer"
                  value={choice}
                  checked={answer === choice}
                  onChange={(event) => setAnswer(event.target.value)}
                  className="size-4 accent-[var(--fetch-blue-600)]"
                />
                {choice}
              </label>
            ))}
          </fieldset>
        ) : (
          <label className="mt-8 block font-extrabold">
            Your answer
            <input
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={checked}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !checked) void submit();
              }}
              className="mt-2 min-h-14 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-lg"
            />
          </label>
        )}

        {!checked ? (
          <Button
            onClick={() => void submit()}
            disabled={!answer.trim() || checking}
            className="mt-7 w-full sm:w-auto"
          >
            {checking ? "Checking…" : "Check answer"}
          </Button>
        ) : (
          <div
            ref={feedbackRef}
            tabIndex={-1}
            role="region"
            aria-label="Answer feedback"
            className={`mt-7 rounded-2xl border p-5 focus:outline-none ${
              isCorrect
                ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                : "border-red-200 bg-red-50 text-red-950"
            }`}
          >
            <div className="flex items-center gap-3 font-display text-xl font-semibold">
              {isCorrect ? (
                <CheckCircle size={25} weight="fill" className="text-emerald-600" />
              ) : (
                <XCircle size={25} weight="fill" className="text-red-600" />
              )}
              {isCorrect ? "Correct" : "Not quite"}
            </div>
            <p className="mt-3">
              <strong>Expected answer:</strong> {feedback?.answer}
            </p>
            {feedback?.explanation && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {feedback.explanation}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <WarningCircle />
                {mode === "account"
                  ? "Saved to account when you complete this session"
                  : "Saved in this browser when you finish"}
              </span>
              <Button onClick={() => void next()} disabled={saving}>
                {saving
                  ? "Saving attempt…"
                  : index === pack.questions.length - 1
                    ? "See results"
                    : "Next question"}
                <ArrowRight weight="bold" />
              </Button>
            </div>
          </div>
        )}

        {actionError && (
          <p
            role="alert"
            className="mt-4 text-sm font-bold text-[var(--danger)]"
          >
            {actionError}
          </p>
        )}
      </section>
    </div>
  );
}
