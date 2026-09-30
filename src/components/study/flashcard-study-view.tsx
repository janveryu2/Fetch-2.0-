"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Trophy,
  ArrowCounterClockwise,
  ArrowRight,
  BookOpen,
  Eye,
  Fire,
  PawPrint,
  Target,
  Smiley,
  SmileyMeh,
  SmileySad,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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

  const [sessionState, setSessionState] =
    useState<FlashcardSessionState | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const flippedRef = useRef(false);
  const flipperRef = useRef<HTMLDivElement>(null);
  const flipAnimationRef = useRef<Animation | null>(null);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [lastGrade, setLastGrade] = useState<FlashcardGradeResult | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingState, setPendingState] =
    useState<FlashcardSessionState | null>(null);
  const [confidence, setConfidence] = useState<"Hard" | "Good" | "Easy" | null>(
    null,
  );
  const [recallStreak, setRecallStreak] = useState(0);

  const [threeMissCard, setThreeMissCard] = useState<{
    card: FlashcardItem;
    nextState: FlashcardSessionState;
  } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const setCardFace = useCallback((flipped: boolean) => {
    if (flipped === flippedRef.current) return;

    const element = flipperRef.current;
    let startAngle = flippedRef.current ? 180 : 0;
    if (element) {
      try {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
        startAngle = (Math.atan2(-matrix.m13, matrix.m11) * 180) / Math.PI;
      } catch {
        // Keep the settled angle when the browser cannot parse the current transform.
      }
    }

    flipAnimationRef.current?.cancel();
    flipAnimationRef.current = null;
    flippedRef.current = flipped;
    setIsFlipped(flipped);

    if (
      !element ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const targetAngle = flipped ? 180 : 0;
    const direction = targetAngle >= startAngle ? 1 : -1;
    const animation = element.animate(
      [
        { transform: `rotateY(${startAngle}deg) scale(1)`, offset: 0 },
        {
          transform: `rotateY(${startAngle + direction * 3}deg) scale(0.992)`,
          offset: 0.14,
        },
        {
          transform: `rotateY(${targetAngle - direction * 2}deg) scale(1.004)`,
          offset: 0.86,
        },
        { transform: `rotateY(${targetAngle}deg) scale(1)`, offset: 1 },
      ],
      {
        duration: 480,
        easing: "cubic-bezier(0.22, 0.68, 0.27, 1)",
        fill: "none",
      },
    );
    flipAnimationRef.current = animation;
    animation.onfinish = () => {
      if (flipAnimationRef.current === animation) {
        flipAnimationRef.current = null;
      }
    };
  }, []);

  const flipCard = useCallback(() => {
    setCardFace(!flippedRef.current);
  }, [setCardFace]);

  const resetCardFace = useCallback(() => {
    flipAnimationRef.current?.cancel();
    flipAnimationRef.current = null;
    flippedRef.current = false;
    setIsFlipped(false);
  }, []);

  async function handleStudyAgain() {
    const newClientSessionId = crypto.randomUUID();
    try {
      const res = await fetch("/api/flashcards/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artifactId,
          clientSessionId: newClientSessionId,
        }),
      });
      const data = res.ok ? await res.json() : null;
      const sid = data?.sessionId || newClientSessionId;
      setSessionState(initializeFlashcardSession(sid, cards));
    } catch {
      setSessionState(initializeFlashcardSession(newClientSessionId, cards));
    }
    resetCardFace();
    setLastGrade(null);
    setFeedbackMessage(null);
    setThreeMissCard(null);
    setPendingState(null);
    setConfidence(null);
    setRecallStreak(0);
    setTypedAnswer("");
    setSubmitting(false);
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
          const rawCards: FlashcardItem[] = data.cards.map(
            (c: {
              id: string;
              front: string;
              back: string;
              aliases?: string[];
              position: number;
            }) => ({
              id: c.id,
              front: c.front,
              back: c.back,
              aliases: Array.isArray(c.aliases) ? c.aliases : [],
              position: c.position,
            }),
          );
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
                  rawCards,
                );
                setSessionState(init);
                setLoading(false);
              }
            })
            .catch(() => {
              if (mounted) {
                const init = initializeFlashcardSession(
                  clientSessionId,
                  rawCards,
                );
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

  useEffect(() => {
    const onSpace = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.code !== "Space" ||
        !sessionState ||
        sessionState.status !== "active" ||
        threeMissCard
      )
        return;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, select, button, a, [role="button"], [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      flipCard();
    };
    window.addEventListener("keydown", onSpace);
    return () => window.removeEventListener("keydown", onSpace);
  }, [flipCard, sessionState, threeMissCard]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center p-6 text-center">
        <ArrowsClockwise
          className="animate-spin text-[var(--fetch-blue-600)]"
          size={32}
        />
        <p className="mt-4 font-bold text-sm text-[var(--text-secondary)]">
          Preparing your flashcard study deck...
        </p>
      </div>
    );
  }

  if (error || !sessionState || cards.length === 0) {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center p-6 text-center">
        <p className="font-bold text-red-600">
          {error || "No cards in this deck yet."}
        </p>
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
  if (
    !currentCard ||
    sessionState.status === "mastered" ||
    sessionState.status === "incomplete"
  ) {
    const accuracy =
      sessionState.totalCards > 0
        ? Math.round(
            (sessionState.firstTryCorrectCount / sessionState.totalCards) * 100,
          )
        : 100;
    const isMastered = sessionState.status === "mastered";

    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <div
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${
            isMastered
              ? "bg-emerald-100 text-emerald-600"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {isMastered ? (
            <Trophy size={40} weight="fill" />
          ) : (
            <ArrowCounterClockwise size={40} />
          )}
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
    setPendingState(result.nextState);
    setRecallStreak((streak) => (result.grade.isCorrect ? streak + 1 : 0));

    if (result.grade.isCorrect) {
      setFeedbackMessage("Correct! Well done.");
    } else {
      setFeedbackMessage(
        result.threeMissesReached
          ? "3 misses on this card."
          : "Not quite. This card will return later in your session.",
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

    // Keep feedback on screen until the learner explicitly advances.
    if (result.threeMissesReached) {
      setThreeMissCard({ card: currentCard, nextState: result.nextState });
    }
  }

  function handleNextCard() {
    if (!pendingState) return;
    setSessionState(pendingState);
    setPendingState(null);
    setConfidence(null);
    setTypedAnswer("");
    resetCardFace();
    setLastGrade(null);
    setFeedbackMessage(null);
    setSubmitting(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const viewedState = pendingState ?? sessionState;
  const cardsLeft = viewedState.queue.length;
  const progressPercent = Math.round(
    (viewedState.masteredCount / sessionState.totalCards) * 100,
  );

  const attemptedCards = Object.values(viewedState.cardStats).filter(
    (stat) => stat.attempts > 0,
  ).length;
  const accuracy = attemptedCards
    ? Math.round((viewedState.firstTryCorrectCount / attemptedCards) * 100)
    : null;

  return (
    <section
      className="workspace flashcard-approved"
      aria-label={`Study ${title}`}
    >
      <h1 className="sr-only">{title} flashcards</h1>
      <header className="flashcard-progress-header">
        <Link href={`/app/study-packs/${packId}`}>
          <ArrowLeft size={23} weight="bold" /> Exit Study
        </Link>
        <div className="flashcard-session-stats">
          <span>
            <Fire size={22} weight="fill" /> {recallStreak} recall streak
          </span>
          <span>
            <Target size={22} weight="bold" />{" "}
            {accuracy === null ? "Ready to practice" : `${accuracy}% accuracy`}
          </span>
        </div>
        <div className="flashcard-count">
          <span>{cardsLeft} remaining</span>
          <strong>
            {Math.min(sessionState.totalCards, sessionState.masteredCount + 1)}{" "}
            / {sessionState.totalCards} cards
          </strong>
        </div>
      </header>
      <div
        className="flashcard-progress-track"
        role="progressbar"
        aria-label="Cards mastered"
        aria-valuemin={0}
        aria-valuemax={sessionState.totalCards}
        aria-valuenow={viewedState.masteredCount}
      >
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="flashcard-deck">
        <div
          className="flashcard-deck-paper flashcard-deck-paper-one"
          aria-hidden="true"
        />
        <div
          className="flashcard-deck-paper flashcard-deck-paper-two"
          aria-hidden="true"
        />
        <div
          className="flashcard-flip-target"
          role="button"
          tabIndex={0}
          aria-pressed={isFlipped}
          aria-describedby={
            isFlipped ? "flashcard-back-text" : "flashcard-front-text"
          }
          aria-label={
            isFlipped
              ? "Card back revealed, flip to prompt"
              : "Card front, click to flip"
          }
          onClick={flipCard}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              flipCard();
            }
          }}
        >
          <div
            ref={flipperRef}
            className={`flashcard-flipper ${isFlipped ? "is-flipped" : ""}`}
          >
            <div
              className="flashcard-face flashcard-face-front"
              aria-hidden={isFlipped}
            >
              <div className="flashcard-face-header">
                <span>
                  <BookOpen size={25} weight="fill" /> Prompt (Front)
                </span>
                <small>
                  Press space or click to flip <kbd>Space</kbd>
                </small>
              </div>
              <h2 id="flashcard-front-text" className="font-display">
                {currentCard.front}
              </h2>
              <span className="flashcard-flip-hint">
                <ArrowsClockwise size={25} weight="bold" /> Click to flip card
              </span>
              <PawPrint className="flashcard-paw" size={44} weight="fill" />
            </div>
            <div
              className="flashcard-face flashcard-face-back"
              aria-hidden={!isFlipped}
            >
              <div className="flashcard-face-header">
                <span>
                  <BookOpen size={25} weight="fill" /> Answer (Back)
                </span>
                <small>
                  Press space or click to flip <kbd>Space</kbd>
                </small>
              </div>
              <h2 id="flashcard-back-text" className="font-display">
                {currentCard.back}
              </h2>
              <span className="flashcard-flip-hint">
                <ArrowsClockwise size={25} weight="bold" /> Flip to prompt
              </span>
              <PawPrint className="flashcard-paw" size={44} weight="fill" />
            </div>
          </div>
        </div>
      </div>
      <div className="flashcard-recall-row">
        <form onSubmit={handleSubmitAnswer} className="flashcard-recall-form">
          <div className="flashcard-recall-heading">
            <label htmlFor="flashcard-recall-input">
            Type your recall response
          </label>
          <span>Recall before checking</span>
          </div>
          <div className="flashcard-recall-controls">
            <input
              id="flashcard-recall-input"
              ref={inputRef}
              value={typedAnswer}
              onChange={(e) => setTypedAnswer(e.target.value)}
              placeholder="Type your answer here…"
              disabled={submitting}
              autoFocus
            />
            <Button type="submit" disabled={!typedAnswer.trim() || submitting}>
              Check answer <ArrowRight size={24} />
            </Button>
          </div>
        </form>
        <aside className="flashcard-companion">
          <Image
            src="/assets/mascot/fetch-active.png"
            alt="FETCH cheering you on"
            width={110}
            height={110}
          />
          <p>
            <strong>Before you flip</strong>
            <span>
              Take your time.
            </span>
          </p>
        </aside>
      </div>
      <div className="flashcard-action-row">
          <Button variant="secondary" onClick={() => setCardFace(true)}>
            <Eye size={24} weight="bold" /> Peek answer
          </Button>
        <Button variant="secondary" onClick={flipCard}>
          <ArrowsClockwise size={24} weight="bold" /> Flip card
        </Button>
        <div
          className="flashcard-confidence"
          role="group"
          aria-label="Recall confidence. Typed answers determine mastery."
        >
          {(
            [
              { label: "Hard", hint: "I was unsure", Icon: SmileySad },
              { label: "Good", hint: "I knew it", Icon: SmileyMeh },
              { label: "Easy", hint: "It was easy", Icon: Smiley },
            ] as const
          ).map(({ label, hint, Icon }) => (
            <button
              key={label}
              type="button"
              className={`flashcard-rating flashcard-rating-${label.toLowerCase()}`}
              aria-pressed={confidence === label}
              onClick={() => setConfidence(label)}
              title="Rate your confidence. Check your typed answer to record mastery."
            >
              <Icon size={37} weight="fill" />
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      {lastGrade && (
        <div
          className={`flashcard-feedback ${lastGrade.isCorrect ? "is-correct" : "is-incorrect"}`}
        >
          <div
            role="status"
            aria-live="polite"
            className="flashcard-feedback-content"
          >
            {lastGrade.isCorrect ? (
              <CheckCircle size={58} weight="fill" />
            ) : (
              <XCircle size={58} weight="fill" />
            )}
            <div>
              <h2 className="font-display">
                {lastGrade.isCorrect ? "Correct!" : "Keep practicing"}
              </h2>
              <p>{lastGrade.isCorrect ? currentCard.back : feedbackMessage}</p>
              {!lastGrade.isCorrect && (
                <p>
                  Expected: <strong>{currentCard.back}</strong>
                </p>
              )}
            </div>
          </div>
          <Button onClick={handleNextCard}>
            Next card <ArrowRight size={24} />
          </Button>
        </div>
      )}
      <Dialog.Root
        open={!!threeMissCard}
        onOpenChange={(open) => {
          if (!open && threeMissCard) {
            handleNextCard();
            setThreeMissCard(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="manual-deck-overlay" />
          <Dialog.Content className="flashcard-retry-dialog">
            <Dialog.Title className="font-display text-xl font-bold">
              Tough Card Detected
            </Dialog.Title>
            <Dialog.Description className="mt-3 text-sm text-[var(--text-secondary)]">
              You have missed &ldquo;{threeMissCard?.card.front}&rdquo; 3 times
              in this session. Keep practicing or end this session as incomplete
              for now.
            </Dialog.Description>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                onClick={() => {
                  handleNextCard();
                  setThreeMissCard(null);
                }}
              >
                Continue studying
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSessionState(
                    threeMissCard
                      ? { ...threeMissCard.nextState, status: "incomplete" }
                      : sessionState,
                  );
                  setThreeMissCard(null);
                  setPendingState(null);
                  setSubmitting(false);
                }}
              >
                End session as incomplete
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
