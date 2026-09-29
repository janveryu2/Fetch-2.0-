"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Books,
  CalendarBlank,
  Clock,
  Fire,
  MagnifyingGlass,
  Play,
  Sparkle,
} from "@phosphor-icons/react";
import { useEffect, useState, useMemo, useSyncExternalStore } from "react";
import { CreatePackPanel } from "@/components/study/create-pack-panel";
import { useDemo } from "@/components/app/demo-provider";
import { useStudentPreferences } from "@/components/app/student-preferences-provider";
import { findActiveDraft } from "@/lib/study-session-draft";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

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

  const timeGreeting = useSyncExternalStore(
    () => () => {},
    () => {
      const hour = new Date().getHours();
      if (hour < 12) return "Good morning";
      if (hour < 18) return "Good afternoon";
      return "Good evening";
    },
    () => "Good morning",
  );

  const greetingName = displayName ? displayName.toUpperCase() : "STUDY BUDDY";
  const pageGreeting = `${timeGreeting}, ${greetingName}! 👋`;

  // Compute consecutive streak days honestly from attempts
  const streakDays = useMemo(() => {
    const attemptDates = Array.from(
      new Set(attempts.map((a) => new Date(a.completedAt).toISOString().slice(0, 10))),
    )
      .sort()
      .reverse();

    if (attemptDates.length === 0) return 0;

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    if (attemptDates[0] !== todayStr && attemptDates[0] !== yesterdayStr) {
      return 0;
    }

    let streak = 1;
    const checkDate = new Date(attemptDates[0]);
    for (let i = 1; i < attemptDates.length; i++) {
      checkDate.setDate(checkDate.getDate() - 1);
      const expected = checkDate.toISOString().slice(0, 10);
      if (attemptDates[i] === expected) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }, [attempts]);

  const totalQuestionsAnswered = attempts.reduce((n, a) => n + a.total, 0);
  const totalDeckQuestions = packs.reduce((n, p) => n + p.questions.length, 0);

  return (
    <div className="workspace workspace--wide home-refresh">
      {/* Top Bar with Time-Aware Greeting & Truthful Action Icons */}
      <div className="home-topbar flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title font-display font-black tracking-tight">{pageGreeting}</h1>
          <p className="page-description text-sm text-[var(--text-secondary)]">
            Let’s turn your notes into progress. You’ve got this!
          </p>
        </div>
        <div className="home-top-actions flex items-center gap-2.5">
          <label className="home-search flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 shadow-xs">
            <MagnifyingGlass size={17} className="text-[var(--text-secondary)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search your StudyPacks"
              placeholder="Search your StudyPacks…"
              className="min-h-10 min-w-0 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
            />
          </label>
          <Link
            href="/app/calendar"
            aria-label="Open study calendar"
            className="home-top-icon hover:bg-[var(--surface-subtle)] transition-colors"
          >
            <CalendarBlank size={20} />
          </Link>
          <Link
            href="/app/settings"
            aria-label="Open your account settings"
            className="home-top-avatar hover:ring-2 hover:ring-[var(--fetch-blue-400)] transition-all"
          >
            <Image src="/assets/mascot/fetch-logo.png" alt="" width={38} height={38} className="rounded-full" />
          </Link>
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
        <section className="home-hero my-5 relative flex items-center justify-between gap-6 overflow-hidden rounded-3xl border border-[var(--fetch-blue-200)]/60 bg-gradient-to-r from-[#EBF5FF] via-[#DCEDFF] to-[#BADBFF] p-6 sm:p-8 shadow-sm">
          <div className="relative z-10 max-w-[600px]">
            <p className="home-hero-kicker inline-block rounded-full bg-white/70 px-3 py-1 text-[10px] font-black tracking-widest text-[#2460B8] shadow-xs">
              YOUR LEARNING JOURNEY STARTS HERE
            </p>
            <h2 className="home-hero-title font-display mt-2 text-3xl sm:text-4xl font-black tracking-tight text-[#0F264A] leading-tight">
              Turn your notes into <span className="text-[#1068E9]">powerful</span> StudyPacks
            </h2>
            <p className="mt-2.5 max-w-[50ch] text-sm text-[#38557D] leading-relaxed">
              Upload your notes, and let FETCH create flashcards, quizzes, summary notes, and more with AI — so you can study smarter.
            </p>
            {(activeDraft || recent) && (
              <p className="mt-2 text-xs font-bold text-[#145CB8]">
                {heroHeadline} · {heroDescription}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild className="rounded-xl px-5 py-2.5 bg-[#1068E9] hover:bg-[#0D57C5] text-white font-extrabold shadow-md">
                <Link href={activeDraft ? "/app/study/" + activeDraft.packId : recent ? "/app/study/" + recent.id : "#add-material"}>
                  {activeDraft ? "Resume quiz" : recent ? "Continue studying" : "Get started"}
                  <ArrowRight weight="bold" />
                </Link>
              </Button>
            </div>
            {/* Feature badges from reference image */}
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-bold text-[#355883]">
              <span className="flex items-center gap-1">
                <Sparkle size={15} weight="fill" className="text-[#1068E9]" /> AI-powered
              </span>
              <span className="flex items-center gap-1">
                <span className="text-emerald-600 font-black">✓</span> Personalized
              </span>
              <span className="flex items-center gap-1">
                <span className="text-rose-500">❤️</span> Better results
              </span>
            </div>
          </div>
          <Image
            src="/assets/illustrations/fetch-study-companion.png"
            alt="FETCH mascot studying with books"
            width={440}
            height={300}
            className="home-hero-mascot select-none pointer-events-none"
            priority
          />
        </section>
      )}

      {/* Main Workspace 2-Column Grid */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="home-create-panel min-w-0">
          <CreatePackPanel />
        </div>

        <aside className="space-y-4">
          {/* Study Rhythm Card */}
          <section className="surface-card home-rhythm rounded-2xl border border-[var(--border-subtle)] p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Your study rhythm</h2>
              <span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                This week ▾
              </span>
            </div>

            <div className="home-rhythm-summary mt-4 flex items-center gap-4">
              <div
                className="home-rhythm-ring shrink-0"
                style={{
                  background: `conic-gradient(var(--fetch-blue-600) ${(studyDays / 7) * 100}%, var(--fetch-blue-100) 0)`,
                }}
              >
                <span>
                  <strong className="text-xl font-black">{studyDays}/5</strong>
                  <small className="text-[10px] text-[var(--text-secondary)]">study days</small>
                </span>
              </div>
              <div className="text-xs">
                <strong className="block text-sm font-extrabold text-[var(--fetch-blue-700)]">
                  {studyDays >= 5 ? "Goal reached!" : studyDays > 0 ? "Keep it up!" : "Start your rhythm"}
                </strong>
                <p className="mt-0.5 text-[var(--text-secondary)]">
                  {studyDays >= 5
                    ? "You achieved your weekly rhythm target."
                    : studyDays > 0
                      ? `You’re ${Math.max(1, 5 - studyDays)} days away from your weekly goal.`
                      : "Complete a study session to log today."}
                </p>
              </div>
            </div>

            {/* Weekday Checkmarks */}
            <div className="home-week-dots mt-4 flex justify-between px-1 text-[11px] font-bold text-[var(--text-secondary)]">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => {
                const isDone = studyDayIndexes.has(index);
                return (
                  <span key={index} className="flex flex-col items-center gap-1.5">
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-[10px] font-black transition-colors",
                        isDone
                          ? "bg-[var(--fetch-blue-600)] text-white shadow-xs"
                          : "border border-[var(--border-strong)] bg-[var(--surface-card)] text-transparent",
                      )}
                    >
                      {isDone ? "✓" : "·"}
                    </span>
                    <span className="text-[10px] font-extrabold">{day}</span>
                  </span>
                );
              })}
            </div>

            {attempts.length ? (
              <dl className="mt-4 space-y-2 border-t border-[var(--border-subtle)] pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-[var(--text-secondary)]">Total sessions</dt>
                  <dd className="font-extrabold text-[var(--text-primary)]">{attempts.length}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-secondary)]">Questions answered</dt>
                  <dd className="font-extrabold text-[var(--text-primary)]">{totalQuestionsAnswered}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-[var(--text-secondary)]">Average accuracy</dt>
                  <dd className="font-extrabold text-[var(--fetch-blue-700)]">
                    {Math.round(attempts.reduce((n, a) => n + a.score, 0) / attempts.length)}%
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Small sessions add up. Complete your first pack to see your learning history here.
              </p>
            )}

            <Link
              href="/app/progress"
              className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--fetch-blue-700)] hover:underline"
            >
              View full progress <ArrowRight size={13} weight="bold" />
            </Link>
          </section>

          {/* Current Streak Card */}
          <section className="surface-card home-streak flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] p-4 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="home-streak-icon flex size-11 items-center justify-center rounded-2xl bg-orange-100 text-orange-600">
                <Fire size={24} weight="fill" />
              </span>
              <div>
                <p className="text-[11px] font-bold text-[var(--text-secondary)]">Current streak</p>
                <strong className="font-display text-xl font-black text-[var(--text-primary)]">
                  {streakDays > 0 ? `${streakDays} days ❤️` : `${attempts.length} sessions`}
                </strong>
                <p className="text-[10px] text-[var(--text-secondary)]">
                  {streakDays > 0 ? "Nice consistency!" : "Keep building your routine"}
                </p>
              </div>
            </div>
            <Link href="/app/progress" aria-label="View streak details" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <ArrowRight size={16} weight="bold" />
            </Link>
          </section>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="surface-card rounded-2xl border border-[var(--border-subtle)] p-3.5 shadow-xs">
              <span className="flex size-8 items-center justify-center rounded-xl bg-blue-50 text-[var(--fetch-blue-600)]">
                <Books size={18} weight="bold" />
              </span>
              <p className="mt-2 text-[10px] font-bold text-[var(--text-secondary)]">Total StudyPacks</p>
              <strong className="font-display text-xl font-black text-[var(--text-primary)]">{packs.length}</strong>
              <span className="mt-1 block text-[9px] font-extrabold text-emerald-600">↑ {packs.length ? `${packs.length} active` : "0 ready"}</span>
            </div>
            <div className="surface-card rounded-2xl border border-[var(--border-subtle)] p-3.5 shadow-xs">
              <span className="flex size-8 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
                <Sparkle size={18} weight="fill" />
              </span>
              <p className="mt-2 text-[10px] font-bold text-[var(--text-secondary)]">Practice Questions</p>
              <strong className="font-display text-xl font-black text-[var(--text-primary)]">{totalDeckQuestions}</strong>
              <span className="mt-1 block text-[9px] font-extrabold text-emerald-600">↑ {totalQuestionsAnswered} solved</span>
            </div>
          </div>

          {/* Mascot Quote Card */}
          <div className="surface-card relative overflow-hidden rounded-2xl border border-[var(--fetch-blue-200)] bg-gradient-to-br from-white via-blue-50/50 to-blue-100/40 p-4 shadow-xs">
            <p className="text-xs font-semibold italic text-[#25456E] leading-snug">
              “A little progress each day adds up to big results. ❤️”
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] font-black text-[var(--fetch-blue-700)]">— FETCH</span>
              <Image
                src="/assets/mascot/fetch-logo.png"
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-lg opacity-90"
              />
            </div>
          </div>

          <p className="notice text-[11px] text-[var(--text-tertiary)]">
            {mode === "account"
              ? "Account mode · Your StudyPacks and quiz attempts are saved to your account."
              : "Browser demo · Packs and quiz attempts stay in this browser on this device."}
          </p>
        </aside>
      </div>

      {/* Recent StudyPacks Section matching reference image */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-700)]">
              <Clock size={18} weight="bold" />
            </span>
            <div>
              <h2 className="font-display text-xl sm:text-2xl font-black text-[var(--text-primary)]">
                Recent StudyPacks
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Pick up where you left off and keep the momentum going.
              </p>
            </div>
          </div>
          <Link
            href="/app/study-packs"
            className="inline-flex items-center gap-1 text-xs font-extrabold text-[var(--fetch-blue-700)] hover:underline"
          >
            View all <ArrowRight size={14} weight="bold" />
          </Link>
        </div>

        {visiblePacks.length ? (
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {visiblePacks.slice(0, 4).map((p, idx) => {
              const themes = [
                { bg: "bg-purple-100 dark:bg-purple-950/40 text-purple-700", symbol: "</>" },
                { bg: "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700", symbol: "🌿" },
                { bg: "bg-rose-100 dark:bg-rose-950/40 text-rose-700", symbol: "🏛️" },
                { bg: "bg-amber-100 dark:bg-amber-950/40 text-amber-700", symbol: "π" },
              ];
              const theme = themes[idx % themes.length];
              return (
                <Link
                  href={`/app/study-packs/${p.id}`}
                  key={p.id}
                  className="surface-card group flex items-center justify-between gap-3 rounded-2xl border border-[var(--border-subtle)] p-4 shadow-xs transition-all hover:border-[var(--fetch-blue-300)] hover:shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-black",
                        theme.bg,
                      )}
                    >
                      {theme.symbol}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-extrabold text-sm text-[var(--text-primary)] group-hover:text-[var(--fetch-blue-700)] transition-colors">
                        {p.title}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
                        {p.artifacts?.some(a => a.kind === "flashcards") ? "Flashcards" : "Quiz"} · {p.questions.length} questions
                      </p>
                    </div>
                  </div>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--fetch-blue-50)] text-[var(--fetch-blue-700)] group-hover:bg-[var(--fetch-blue-600)] group-hover:text-white transition-colors">
                    <Play size={13} weight="fill" />
                  </span>
                </Link>
              );
            })}
          </div>
        ) : search.trim() ? (
          <p className="mt-3 text-sm text-[var(--text-secondary)]">No StudyPacks match “{search}”.</p>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-6 text-center text-sm text-[var(--text-secondary)]">
            Your saved StudyPacks will appear here after you create your first pack above.
          </div>
        )}
      </section>

      {/* Focus Tools Section with 3D Icons */}
      <section className="mt-8">
        <h2 className="font-display text-xl sm:text-2xl font-black text-[var(--text-primary)]">
          Make room for focus
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "AI Tutor",
              text: "Interactive tutoring & explanations",
              href: "tutor",
              iconSrc: "/assets/icons/nav/tutor.png",
            },
            {
              label: "Pomodoro Timer",
              text: "Focused study blocks with sound cues",
              href: "pomodoro",
              iconSrc: "/assets/icons/nav/pomodoro.png",
            },
            {
              label: "Music Studio",
              text: "Curated streams & persistent audio",
              href: "music",
              iconSrc: "/assets/icons/nav/music.png",
            },
            {
              label: "Study Calendar",
              text: "Schedule upcoming exams & reviews",
              href: "calendar",
              iconSrc: "/assets/icons/nav/calendar.png",
            },
          ].map(({ label, text, href, iconSrc }) => (
            <Link
              key={href}
              href={`/app/${href}`}
              className="group surface-card flex items-center gap-3.5 rounded-2xl border border-[var(--border-subtle)] p-4 shadow-xs transition-all hover:border-[var(--fetch-blue-300)] hover:shadow-sm"
            >
              <Image
                src={iconSrc}
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0 transition-transform group-hover:scale-105"
              />
              <div className="min-w-0">
                <h3 className="font-extrabold text-sm text-[var(--text-primary)] group-hover:text-[var(--fetch-blue-700)] transition-colors">
                  {label}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)] truncate">{text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
