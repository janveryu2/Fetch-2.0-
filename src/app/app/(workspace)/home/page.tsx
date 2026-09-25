"use client";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarBlank,
  MusicNotes,
  Sparkle,
  Timer,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { CreatePackPanel } from "@/components/study/create-pack-panel";
import { useDemo } from "@/components/app/demo-provider";
import { findActiveDraft } from "@/lib/study-session-draft";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { packs, attempts, mode } = useDemo();
  const [activeDraft, setActiveDraft] = useState<{
    packId: string;
    packTitle: string;
    progress: number;
  } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const found = findActiveDraft(mode === "account" ? "account" : "demo");
        if (found) setActiveDraft(found);
      } catch {
        // Ignore draft read errors
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [mode]);

  const recent = packs.find((p) => p.id === attempts[0]?.packId) ?? packs[0];

  return (
    <div className="workspace">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Ready to learn something new?</h1>
          <p className="page-description">
            Pick up where you left off or turn your notes into a new StudyPack.
          </p>
        </div>
        <Image
          src="/assets/mascot/fetch-wave.png"
          alt="FETCH welcomes you back"
          width={110}
          height={110}
          className="pixel-art hidden sm:block"
        />
      </div>

      <section className="my-6 flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-[var(--fetch-blue-100)] p-5">
        <div>
          <h2 className="font-display text-xl font-semibold">
            {activeDraft
              ? `Resume: ${activeDraft.packTitle}`
              : recent
                ? recent.title
                : "Your study space is ready"}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {activeDraft
              ? `You have an unfinished session at question ${activeDraft.progress + 1}.`
              : recent
                ? `${recent.questions.length} questions · Ready when you are`
                : "Paste your lecture notes or study guide below to generate your first StudyPack."}
          </p>
        </div>
        <Button asChild>
          <Link
            href={
              activeDraft
                ? `/app/study/${activeDraft.packId}`
                : recent
                  ? `/app/study/${recent.id}`
                  : "#add-material"
            }
          >
            {activeDraft
              ? "Resume quiz"
              : recent
                ? "Continue studying"
                : "Get started"}
            <ArrowRight />
          </Link>
        </Button>
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <CreatePackPanel />
        <aside className="space-y-6">
          <section className="surface-card p-5">
            <h2 className="font-display text-xl font-semibold">
              Your study rhythm
            </h2>
            {attempts.length ? (
              <dl className="mt-4 space-y-3">
                <div className="flex justify-between">
                  <dt>Sessions</dt>
                  <dd className="font-extrabold">{attempts.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Questions answered</dt>
                  <dd className="font-extrabold">
                    {attempts.reduce((n, a) => n + a.total, 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>Average accuracy</dt>
                  <dd className="font-extrabold">
                    {Math.round(
                      attempts.reduce((n, a) => n + a.score, 0) /
                        attempts.length,
                    )}
                    %
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Small sessions add up. Complete your first pack to see your
                learning history here.
              </p>
            )}
            <Link
              href="/app/progress"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--fetch-blue-700)]"
            >
              View progress <ArrowRight />
            </Link>
          </section>
          <p className="notice">
            {mode === "account"
              ? "Account mode · Your StudyPacks and quiz attempts are saved to your account."
              : "Browser demo · Packs and quiz attempts stay in this browser on this device."}
          </p>
        </aside>
      </div>
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">
            Recent StudyPacks
          </h2>
          <Link
            href="/app/study-packs"
            className="text-sm font-bold text-[var(--fetch-blue-700)]"
          >
            View all
          </Link>
        </div>
        {packs.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {packs.slice(0, 4).map((p) => (
              <Link
                href={`/app/study-packs/${p.id}`}
                key={p.id}
                className="surface-card flex items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-extrabold">{p.title}</h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {p.questions.length} questions ·{" "}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ArrowRight className="shrink-0" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[var(--text-secondary)]">
            Your saved packs will appear here after you add your first material.
          </p>
        )}
      </section>
      <section className="mt-8">
        <h2 className="font-display text-2xl font-semibold">
          Make room for focus
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "AI Tutor",
              text: "Prepare a question · Preview",
              href: "tutor",
              icon: Sparkle,
            },
            {
              label: "Pomodoro Timer",
              text: "One focused session at a time",
              href: "pomodoro",
              icon: Timer,
            },
            {
              label: "Music Studio",
              text: "Your own study soundtrack",
              href: "music",
              icon: MusicNotes,
            },
            {
              label: "Study Calendar",
              text: "Plan what comes next",
              href: "calendar",
              icon: CalendarBlank,
            },
          ].map(({ label, text, href, icon: Icon }) => (
            <Link
              key={href}
              href={`/app/${href}`}
              className="rounded-xl border border-[var(--border-subtle)] p-4 transition-colors hover:bg-[var(--surface-subtle)]"
            >
              <Icon size={24} className="text-[var(--fetch-blue-700)]" />
              <h3 className="mt-3 font-extrabold">{label}</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {text}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
