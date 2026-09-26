"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Trophy,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  initializeFlashcardSession,
  processCardAttempt,
  type FlashcardItem,
  type FlashcardSessionState,
} from "@/lib/study/flashcard-queue";
import type { FlashcardGradeResult } from "@/lib/study/flashcard-grading";

interface FlashcardStudyViewProps {
  packId: string;
  artifactId: string;
  title: string;
}

export function FlashcardStudyView({
  packId,
  artifactId,
  title,
}: FlashcardStudyViewProps) {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sessionState, setSessionState] = useState<FlashcardSessionState | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [lastGrade, setLastGrade] = useState<FlashcardGradeResult | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [threeMissCard, setThreeMissCard] = useState<{
    card: FlashcardItem;
    nextState: FlashcardSessionState;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  async function handleStudyAgain() {
    const newClientSessionId = crypto.randomUUID();
    try {
      const res = await fetch("/api/flashcards/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artifactId, clientSessionId: newClientSessionId }),
      });
      const data = res.ok ? await res.json() : null;
      const sid = data?.sessionId || newClientSessionId;
      setSessionState(initializeFlashcardSession(sid, cards));
    } catch {
      setSessionState(initializeFlashcardSession(newClientSessionId, cards));
    }
    setIsFlipped(false);
    setLastGrade(null);
    setFeedbackMessage(null);
    setThreeMissCard(null);
  }

  // Load cards and initialize session
  useEffect(() => {
    let mounted = true;
    fetch(`/api/artifacts/${artifactId}/cards`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load flashcards");
        return res.json();
      })
      .then((data) => {
        if (mounted && data?.cards) {
          const rawCards: FlashcardItem[] = data.cards.map((c: { id: string; front: string; back: string; aliases?: string[]; position: number }) => ({
            id: c.id,
            front: c.front,
            back: c.back,
            aliases: Array.isArray(c.aliases) ? c.aliases : [],
            position: c.position,
          }));
          setCards(rawCards);

          const clientSessionId = crypto.randomUUID();
          // Start or resume on server
          fetch("/api/flashcards/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ artifactId, clientSessionId }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((serverSession) => {
              if (mounted) {
                const init = initializeFlashcardSession(
                  serverSession?.sessionId || clientSessionId,
                  rawCards
                );
                setSessionState(init);
                setLoading(false);
              }
            })
            .catch(() => {
              if (mounted) {
                const init = initializeFlashcardSession(clientSessionId, rawCards);
                setSessionState(init);
                setLoading(false);
              }
            });
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load deck.");
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [artifactId]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center p-6 text-center">
        <ArrowsClockwise className="animate-spin text-[var(--fetch-blue-600)]" size={32} />
        <p className="mt-4 font-bold text-sm text-[var(--text-secondary)]">
          Preparing your flashcard study deck...
        </p>
      </div>
    );
  }

  if (error || !sessionState || cards.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center p-6 text-center">
        <p className="font-bold text-red-600">{error || "No cards in this deck yet."}</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link href={`/app/study-packs/${packId}`}>
            <ArrowLeft /> Return to Pack
          </Link>
        </Button>
      </div>
    );
  }

  // Active card is head of queue
  const currentCardId = sessionState.queue[0];
  const currentCard = cards.find((c) => c.id === currentCardId);

  // Completion screen when queue is empty or status is reached
  if (!currentCard || sessionState.status === "mastered" || sessionState.status === "incomplete") {
    const accuracy =
      sessionState.totalCards > 0
        ? Math.round((sessionState.firstTryCorrectCount / sessionState.totalCards) * 100)
        : 100;
    const isMastered = sessionState.status === "mastered";

    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
          isMastered ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-700"
        }`}>
          {isMastered ? <Trophy size={40} weight="fill" /> : <ArrowCounterClockwise size={40} />}
        </div>
        <h1 className="font-display mt-6 text-3xl font-bold">
          {isMastered ? "Deck Mastered!" : "Session Summary"}
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          {isMastered
            ? `You answered all ${sessionState.totalCards} cards in "${title}".`
            : `Session ended as incomplete for "${title}". You can study again whenever you're ready.`}
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-6">
          <div>
            <span className="block text-2xl font-black text-[var(--fetch-blue-700)]">
              {accuracy}%
            </span>
            <span className="text-xs font-bold text-[var(--text-secondary)]">
              First-try accuracy
            </span>
          </div>
          <div>
            <span className="block text-2xl font-black text-[var(--text-primary)]">
              {sessionState.totalAttempts}
            </span>
            <span className="text-xs font-bold text-[var(--text-secondary)]">
              Total attempts
            </span>
          </div>
        </div>

        <div className="mt-8 flex justify-center gap-4">
          <Button variant="secondary" onClick={handleStudyAgain}>
            <ArrowCounterClockwise /> Study Again
          </Button>
          <Button asChild>
            <Link href={`/app/study-packs/${packId}`}>
              <ArrowLeft /> Back to Pack
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  async function handleSubmitAnswer(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!typedAnswer.trim() || submitting || !currentCard) return;

    setSubmitting(true);
    const ordinal = sessionState!.totalAttempts;

    // Process locally for responsive UI
    const result = processCardAttempt(sessionState!, currentCard, typedAnswer);
    setLastGrade(result.grade);

    if (result.grade.isCorrect) {
      setFeedbackMessage("Correct! Well done.");
    } else {
      setFeedbackMessage(
        result.threeMissesReached
          ? "3 misses on this card."
          : "Not quite. This card will return later in your session."
      );
    }

    // Submit to server in background
    fetch("/api/flashcards/attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionState!.sessionId,
        cardId: currentCard.id,
        submittedAnswer: typedAnswer,
        ordinal,
      }),
    }).catch(() => {});

    // If 3 misses reached, prompt user with choice modal
    if (result.threeMissesReached) {
      setTimeout(() => {
        setThreeMissCard({ card: currentCard, nextState: result.nextState });
        setSubmitting(false);
      }, 800);
      return;
    }

    // Transition to next card after brief feedback
    setTimeout(() => {
      setSessionState(result.nextState);
      setTypedAnswer("");
      setIsFlipped(false);
      setLastGrade(null);
      setFeedbackMessage(null);
      setSubmitting(false);
      inputRef.current?.focus();
    }, 1200);
  }

  const cardsLeft = sessionState.queue.length;
  const progressPercent = Math.round(
    ((sessionState.totalCards - cardsLeft) / sessionState.totalCards) * 100
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Navigation & Progress Header */}
      <div className="flex items-center justify-between">
        <Link
          href={`/app/study-packs/${packId}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--fetch-blue-700)]"
        >
          <ArrowLeft size={16} /> Exit Study
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-[var(--text-secondary)]">
            {cardsLeft} remaining
          </span>
          <Badge tone="blue">
            {sessionState.firstTryCorrectCount} / {sessionState.totalCards} first-try
          </Badge>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)]">
        <div
          className="h-full bg-[var(--fetch-blue-600)] transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Flashcard Component */}
      <div className="mt-6">
        <div
          className={`relative min-h-[260px] w-full rounded-2xl border p-8 transition-all duration-300 flex flex-col justify-between ${
            isFlipped
              ? "border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] text-[var(--fetch-blue-950)]"
              : "border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm"
          }`}
          onClick={() => setIsFlipped(!isFlipped)}
          role="button"
          tabIndex={0}
          aria-label={isFlipped ? "Card back revealed" : "Card front, click to flip"}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              if (document.activeElement !== inputRef.current) {
                e.preventDefault();
                setIsFlipped(!isFlipped);
              }
            }
          }}
        >
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            <span>{isFlipped ? "Answer (Back)" : "Prompt (Front)"}</span>
            <span className="text-[10px] font-normal lowercase opacity-70">
              click card or press space to flip
            </span>
          </div>

          <div className="my-auto py-6 text-center">
            <h2 className="font-display text-2xl font-bold sm:text-3xl leading-snug">
              {isFlipped ? currentCard.back : currentCard.front}
            </h2>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFlipped(!isFlipped);
              }}
              className="text-xs font-extrabold text-[var(--fetch-blue-700)] hover:underline cursor-pointer"
            >
              {isFlipped ? "Flip to prompt" : "Peek at answer"}
            </button>
          </div>
        </div>

        {/* Typed Recall Input */}
        <form onSubmit={handleSubmitAnswer} className="mt-6">
          <label htmlFor="flashcard-recall-input" className="block text-xs font-bold text-[var(--text-secondary)]">
            Type your recall response:
          </label>
          <div className="mt-2 flex gap-3">
            <input
              id="flashcard-recall-input"
              ref={inputRef}
              type="text"
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Type answer to verify active recall..."
              disabled={submitting}
              className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 py-3 text-sm focus:border-[var(--fetch-blue-600)] focus:outline-none"
              autoFocus
            />
            <Button type="submit" disabled={!typedAnswer.trim() || submitting}>
              Check
            </Button>
          </div>
        </form>

        {/* Immediate Feedback Banner */}
        {lastGrade && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 flex items-start gap-3 rounded-xl p-4 text-sm font-bold ${
              lastGrade.isCorrect
                ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                : "bg-red-50 text-red-900 border border-red-200"
            }`}
          >
            {lastGrade.isCorrect ? (
              <CheckCircle size={22} className="text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <XCircle size={22} className="text-red-600 shrink-0 mt-0.5" />
            )}
            <div>
              <p>{feedbackMessage}</p>
              {!lastGrade.isCorrect && (
                <p className="mt-1 text-xs font-normal text-red-800">
                  Expected: <strong className="font-bold">{currentCard.back}</strong>
                </p>
              )}
            </div>
          </div>
        )}

        {/* 3-Miss Choice Modal */}
        {threeMissCard && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="three-miss-heading"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          >
            <div className="surface-card w-full max-w-md p-6 shadow-xl text-center">
              <h2 id="three-miss-heading" className="font-display text-xl font-bold">
                Tough Card Detected
              </h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                You have missed &ldquo;{threeMissCard.card.front}&rdquo; 3 times in this session.
              </p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                Would you like to keep practicing or end this session as incomplete for now?
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => {
                    setSessionState(threeMissCard.nextState);
                    setThreeMissCard(null);
                    setTypedAnswer("");
                    setIsFlipped(false);
                    setLastGrade(null);
                    setFeedbackMessage(null);
                    setSubmitting(false);
                    inputRef.current?.focus();
                  }}
                >
                  Continue studying
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSessionState((prev) => (prev ? { ...prev, status: "incomplete" } : null));
                    setThreeMissCard(null);
                    setSubmitting(false);
                  }}
                >
                  End session as incomplete
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
