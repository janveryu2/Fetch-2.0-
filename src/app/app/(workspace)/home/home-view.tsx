"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Bell,
  Books,
  CalendarBlank,
  Fire,
  MusicNotes,
  MagnifyingGlass,
  Sparkle,
  Timer,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { CreatePackPanel } from "@/components/study/create-pack-panel";
import { useDemo } from "@/components/app/demo-provider";
import { useStudentPreferences } from "@/components/app/student-preferences-provider";
import { findActiveDraft } from "@/lib/study-session-draft";
import { Button } from "@/components/ui/button";

interface HomeViewProps {
  displayName: string | null;
  initialAuthSignal: "setup-username" | "username-taken" | null;
}

export function HomeView({ displayName, initialAuthSignal }: HomeViewProps) {
  const { packs, attempts, mode, userId, status } = useDemo();
  const { preferences } = useStudentPreferences();
  const [activeDraft, setActiveDraft] = useState<{
    packId: string;
    packTitle: string;
    progress: number;
  } | null>(null);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(
    initialAuthSignal === "setup-username" || initialAuthSignal === "username-taken"
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const scopeId = mode === "account" && userId ? userId : "demo";
        const found = findActiveDraft(scopeId);
        if (found) setActiveDraft(found);

        const params = new URLSearchParams(window.location.search);
        if (params.get("auth") === "setup-username" || params.get("auth") === "username-taken") {
          setShowUsernamePrompt(true);
        }
      } catch {
        // Ignore draft read errors
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, userId]);

  const recent = packs.find((p) => p.id === attempts[0]?.packId) ?? packs[0];
  const primarySubject = preferences?.primarySubject?.trim();
  const visiblePacks = packs.filter((pack) => pack.title.toLowerCase().includes(search.trim().toLowerCase()));
  const today = new Date();
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  const studyDayIndexes = new Set(attempts.filter((attempt) => new Date(attempt.completedAt) >= weekStart).map((attempt) => (new Date(attempt.completedAt).getDay() + 6) % 7));
  const studyDays = studyDayIndexes.size;

  // Hero section messaging
  let heroHeadline = "Your study space is ready";
  let heroDescription = "Paste your lecture notes or study guide below to generate your first StudyPack.";

  if (activeDraft) {
    heroHeadline = `Resume: ${activeDraft.packTitle}`;
    heroDescription = `You have an unfinished session at question ${activeDraft.progress + 1}.`;
  } else if (recent) {
    heroHeadline = recent.title;
    heroDescription = `${recent.questions.length} questions · Ready when you are`;
  } else if (primarySubject) {
    heroHeadline = `Your ${primarySubject} study space is ready`;
    heroDescription = `Add your ${primarySubject} notes below to make your first StudyPack.`;
  }

  const pageGreeting = displayName ? "Good morning, " + displayName + "! 👋" : "Good morning, study buddy! 👋";

  return (
    <div className="workspace workspace--wide home-refresh">
      <div className="home-topbar flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">{pageGreeting}</h1>
          <p className="page-description">
            Let’s turn your notes into progress. You’ve got this!
          </p>
        </div>
        <div className="home-top-actions flex items-center gap-3">
          <label className="home-search flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3">
            <MagnifyingGlass size={18} className="text-[var(--text-secondary)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search your StudyPacks" placeholder="Search your StudyPacks…" className="min-h-11 min-w-0 bg-transparent text-sm outline-none" />
          </label>
          <Link href="/app/calendar" aria-label="Open calendar" className="home-top-icon"><Bell size={21} /></Link>
          <Link href="/app/settings" aria-label="Open your account settings" className="home-top-avatar"><Image src="/assets/mascot/fetch-logo.png" alt="" width={38} height={38} /></Link>
        </div>
      </div>

      {showUsernamePrompt && (
        <div
          role="status"
          className="my-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-4 text-sm"
        >
          <div>
            <strong className="text-[var(--fetch-blue-900)]">Complete your profile:</strong>{" "}
            <span className="text-[var(--fetch-blue-800)]">
              Choose your unique @username to finish setting up your account.
            </span>
          </div>
          <Link
            href="/app/settings?auth=setup-username"
            className="shrink-0 font-extrabold text-[var(--fetch-blue-700)] underline"
          >
            Set username &rarr;
          </Link>
        </div>
      )}

      {mode === "account" && status === "loading" ? (
        <section className="my-6 flex items-center justify-center rounded-2xl bg-[var(--fetch-blue-50)] p-8 text-sm text-[var(--text-secondary)]">
          Loading your study workspace…
        </section>
      ) : (
        <section className="home-hero my-6 flex items-center justify-between gap-5 overflow-hidden rounded-2xl bg-[var(--fetch-blue-100)] p-6 sm:p-8">
          <div className="relative z-10 max-w-[580px]">
            <p className="home-hero-kicker">YOUR LEARNING JOURNEY STARTS HERE</p>
            <h2 className="home-hero-title font-display">Turn your notes into <span>powerful</span> StudyPacks</h2>
            <p className="mt-3 max-w-[52ch] text-sm text-[var(--text-secondary)]">Upload your notes and let FETCH create flashcards, quizzes, summary notes, and more so you can study smarter.</p>
            {(activeDraft || recent) && <p className="mt-2 text-xs font-bold text-[var(--fetch-blue-800)]">{heroHeadline} · {heroDescription}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <Button asChild>
                <Link href={activeDraft ? "/app/study/" + activeDraft.packId : recent ? "/app/study/" + recent.id : "#add-material"}>
                  {activeDraft ? "Resume quiz" : recent ? "Continue studying" : "Get started"}
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
          <Image src="/assets/illustrations/fetch-study-companion.png" alt="FETCH studying with a stack of books" width={480} height={320} className="home-hero-mascot" priority />
        </section>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="home-create-panel">
          <CreatePackPanel />
        </div>
        <aside className="space-y-4">
          <section className="surface-card home-rhythm p-5">
            <h2 className="font-display text-xl font-semibold">Your study rhythm</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">This week</p>
            <div className="home-rhythm-summary mt-4 flex items-center gap-4">
              <div className="home-rhythm-ring" style={{ background: "conic-gradient(var(--fetch-blue-600) " + (studyDays / 7 * 100) + "%, var(--fetch-blue-100) 0)" }}><span><strong>{studyDays}/7</strong><small>study days</small></span></div>
              <p className="text-sm text-[var(--text-secondary)]"><strong className="block text-[var(--success)]">{studyDays ? "Keep it up!" : "Start your rhythm"}</strong>{studyDays ? "Every session builds momentum." : "Your first study day starts here."}</p>
            </div>
            <div className="home-week-dots mt-5 flex justify-between text-[10px] font-bold text-[var(--text-secondary)]">{["M","T","W","T","F","S","S"].map((day, index) => <span key={index}><i className={studyDayIndexes.has(index) ? "is-done" : ""} />{day}</span>)}</div>
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
                      attempts.reduce((n, a) => n + a.score, 0) / attempts.length
                    )}
                    %
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Small sessions add up. Complete your first pack to see your learning history here.
              </p>
            )}
            <Link
              href="/app/progress"
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--fetch-blue-700)]"
            >
              View progress <ArrowRight />
            </Link>
          </section>
          <section className="surface-card home-streak flex items-center gap-3 p-5"><span className="home-streak-icon"><Fire size={24} weight="fill" /></span><div><p className="text-xs text-[var(--text-secondary)]">Study sessions</p><strong className="font-display text-2xl">{attempts.length}</strong><p className="text-xs text-[var(--text-secondary)]">Keep building your routine</p></div></section>
          <div className="grid grid-cols-2 gap-3"><div className="surface-card p-4"><Books size={22} className="text-[var(--fetch-blue-700)]" /><p className="mt-2 text-xs text-[var(--text-secondary)]">Total StudyPacks</p><strong className="font-display text-xl">{packs.length}</strong></div><div className="surface-card p-4"><Sparkle size={22} className="text-[var(--fetch-blue-700)]" /><p className="mt-2 text-xs text-[var(--text-secondary)]">Questions answered</p><strong className="font-display text-xl">{attempts.reduce((n, a) => n + a.total, 0)}</strong></div></div>
          <p className="notice">
            {mode === "account"
              ? "Account mode · Your StudyPacks and quiz attempts are saved to your account."
              : "Browser demo · Packs and quiz attempts stay in this browser on this device."}
          </p>
        </aside>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">Recent StudyPacks</h2>
          <Link href="/app/study-packs" className="text-sm font-bold text-[var(--fetch-blue-700)]">
            View all
          </Link>
        </div>
        {visiblePacks.length ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {visiblePacks.slice(0, 4).map((p) => (
              <Link
                href={`/app/study-packs/${p.id}`}
                key={p.id}
                className="surface-card flex items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0">
                  <h3 className="truncate font-extrabold">{p.title}</h3>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">
                    {p.questions.length} questions · {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ArrowRight className="shrink-0" />
              </Link>
            ))}
          </div>
        ) : search.trim() ? (
          <p className="mt-3 text-[var(--text-secondary)]">No StudyPacks match “{search}”.</p>
        ) : (
          <p className="mt-3 text-[var(--text-secondary)]">
            Your saved packs will appear here after you add your first material.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl font-semibold">Make room for focus</h2>
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
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{text}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
