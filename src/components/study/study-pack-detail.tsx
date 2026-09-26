"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Eye,
  EyeSlash,
  GameController,
  Sparkle,
  Stack,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useDemo } from "@/components/app/demo-provider";
import { loadStudySessionDraft } from "@/lib/study-session-draft";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SummaryViewer } from "@/components/study/summary-viewer";

export function StudyPackDetail({ packId }: { packId: string }) {
  const { packs, attempts, mode, userId } = useDemo();
  const [revealedAnswers, setRevealedAnswers] = useState<Record<string, boolean>>({});
  const [hasActiveDraft, setHasActiveDraft] = useState(false);
  const [artifacts, setArtifacts] = useState<Array<{ id: string; kind: string; title: string }>>([]);
  const [activeTab, setActiveTab] = useState<"quiz" | "summary">("quiz");

  const lastAttempt = attempts.find((item) => item.packId === packId);
  const pack = packs.find((item) => item.id === packId);

  useEffect(() => {
    if (mode === "account") {
      fetch(`/api/artifacts?packId=${packId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.artifacts) {
            setArtifacts(data.artifacts);
            const hasSummary = data.artifacts.some((a: { kind: string }) => a.kind === "summary");
            const hasQuiz = data.artifacts.some((a: { kind: string }) => a.kind === "quiz");
            if (hasSummary && (!hasQuiz || (pack && pack.questions.length === 0))) {
              setActiveTab("summary");
            }
          }
        })
        .catch(() => {});
    }
  }, [packId, mode, pack]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (pack) {
        const scopeId = mode === "account" ? (userId || "account") : "demo";
        const result = loadStudySessionDraft(scopeId, pack);
        if (result.success && !result.draft.isCompleted) {
          setHasActiveDraft(true);
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, userId, pack]);

  if (!pack) {
    return (
      <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center px-5 text-center">
        <Image
          src="/assets/mascot/fetch-seated.png"
          alt="FETCH waiting"
          width={220}
          height={220}
          className="pixel-art w-[170px]"
        />
        <h1 className="font-display mt-5 text-3xl font-semibold">
          Looking for your StudyPack
        </h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          If you refreshed, the local fixture may still be loading. Return to
          the list and try again.
        </p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/app/study-packs">
            <ArrowLeft /> StudyPacks
          </Link>
        </Button>
      </div>
    );
  }

  function toggleReveal(questionId: string) {
    setRevealedAnswers((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-7 lg:py-12">
      <Link
        href="/app/study-packs"
        className="inline-flex items-center gap-2 font-extrabold text-[var(--fetch-blue-700)]"
      >
        <ArrowLeft /> StudyPacks
      </Link>

      <div className="mt-6 flex flex-col gap-6 rounded-2xl bg-[var(--fetch-blue-100)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <Badge tone="success">READY</Badge>
          <h1 className="font-display mt-4 text-4xl font-semibold tracking-[-.025em]">
            {pack.title}
          </h1>
          <p className="mt-2 text-[var(--text-secondary)]">
            {pack.questions.length} questions · {pack.sourceLabel}
          </p>
          {hasActiveDraft && (
            <p className="mt-1 text-xs font-bold text-[var(--fetch-blue-800)]">
              You have an unfinished session saved for this pack.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href={`/app/study/${pack.id}`}>
              <GameController size={22} weight="fill" /> {hasActiveDraft ? "Study" : "Study"}
            </Link>
          </Button>
        </div>
      </div>

      {artifacts.some((a) => a.kind === "summary") && (
        <div className="mt-6 flex gap-2 border-b border-[var(--border-subtle)] pb-2">
          {pack.questions.length > 0 && (
            <button
              onClick={() => setActiveTab("quiz")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
                activeTab === "quiz"
                  ? "bg-[var(--fetch-blue-600)] text-white"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
              }`}
            >
              Practice Quiz ({pack.questions.length})
            </button>
          )}
          <button
            onClick={() => setActiveTab("summary")}
            className={`px-4 py-2 text-sm font-bold rounded-lg transition-colors cursor-pointer ${
              activeTab === "summary"
                ? "bg-[var(--fetch-blue-600)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            }`}
          >
            Study Summary
          </button>
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-[1fr_300px]">
        {activeTab === "summary" && artifacts.find((a) => a.kind === "summary") ? (
          <section className="space-y-4">
            <SummaryViewer artifactId={artifacts.find((a) => a.kind === "summary")!.id} />
          </section>
        ) : (
          <section className="surface-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">Cards</h2>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Answers are concealed to protect active recall before practice.
                </p>
              </div>
              <Badge tone="neutral">{pack.questions.length}</Badge>
            </div>

            <div className="mt-5 divide-y divide-[var(--border-subtle)]">
            {pack.questions.map((question, index) => {
              const isRevealed = Boolean(revealedAnswers[question.id]);
              const answerRegionId = `ans-${question.id}`;

              return (
                <article
                  key={question.id}
                  className="grid gap-3 py-5 sm:grid-cols-[40px_1fr]"
                >
                  <span className="font-display text-xl font-semibold text-[var(--fetch-blue-600)]">
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="font-bold">{question.prompt}</h3>
                    <div className="mt-2">
                      {mode === "account" ? (
                        <p className="text-xs font-medium text-[var(--text-tertiary)]">
                          Answer verified on server after you submit your response.
                        </p>
                      ) : question.answer ? (
                        <div>
                          {isRevealed ? (
                            <div
                              id={answerRegionId}
                              role="region"
                              aria-label={`Answer for question ${index + 1}`}
                              className="mt-1 rounded-lg bg-[var(--surface-subtle)] p-3 text-sm text-[var(--text-primary)]"
                            >
                              <strong className="text-[var(--fetch-blue-700)]">
                                Answer:{" "}
                              </strong>
                              <span>{question.answer}</span>
                              {question.explanation && (
                                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                                  {question.explanation}
                                </p>
                              )}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            aria-expanded={isRevealed}
                            aria-controls={isRevealed ? answerRegionId : undefined}
                            onClick={() => toggleReveal(question.id)}
                            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--fetch-blue-700)] hover:underline"
                          >
                            {isRevealed ? (
                              <>
                                <EyeSlash size={15} /> Conceal answer
                              </>
                            ) : (
                              <>
                                <Eye size={15} /> Reveal answer for preview
                              </>
                            )}
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--text-secondary)]">
                          Answer shown after practice.
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
        )}

        <aside className="space-y-4">
          <div className="surface-card p-5">
            <Stack size={26} className="text-[var(--fetch-blue-600)]" />
            <h2 className="font-display mt-4 text-xl font-semibold">
              Pack details
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">Created</dt>
                <dd className="font-bold">
                  {new Date(pack.createdAt).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-secondary)]">Last accuracy</dt>
                <dd className="font-bold">
                  {lastAttempt ? `${lastAttempt.score}%` : "Not studied yet"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl bg-[var(--action-bg)] p-5 text-white">
            <Sparkle size={25} />
            <h2 className="font-display mt-4 text-xl font-semibold">
              {mode === "account" ? "Private answer key" : "Study preview"}
            </h2>
            <p className="mt-2 text-sm text-blue-100">
              {mode === "account"
                ? "Correct answers stay secure on the server and are verified after you submit each response."
                : "Questions were generated from your notes. Practice with active recall for the best learning retention."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
