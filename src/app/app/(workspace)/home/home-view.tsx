"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Books,
  CalendarBlank,
  Fire,
  MagnifyingGlass,
  Target,
  Stack,
  CaretRight,
} from "@phosphor-icons/react";
import { useEffect, useState, useMemo, useSyncExternalStore } from "react";
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
    initialAuthSignal === "setup-username" ||
      initialAuthSignal === "username-taken",
  );
  const [search, setSearch] = useState("");
  const [materialOpen, setMaterialOpen] = useState(false);
  useEffect(() => {
    if (!materialOpen || window.location.hash !== "#add-material") return;
    const frame = requestAnimationFrame(() => document.getElementById("add-material")?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [materialOpen]);
  useEffect(() => {
    const reveal = () => {
      if (window.location.hash === "#add-material") setMaterialOpen(true);
    };
    const frame = requestAnimationFrame(reveal);
    window.addEventListener("hashchange", reveal);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("hashchange", reveal); };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const scopeId = mode === "account" && userId ? userId : "demo";
        const found = findActiveDraft(scopeId);
        if (found) setActiveDraft(found);

        const params = new URLSearchParams(window.location.search);
        if (
          params.get("auth") === "setup-username" ||
          params.get("auth") === "username-taken"
        ) {
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
  const visiblePacks = packs.filter((pack) =>
    pack.title.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const today = new Date();
  const weekStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - ((today.getDay() + 6) % 7),
  );
  const studyDayIndexes = new Set(
    attempts
      .filter((attempt) => new Date(attempt.completedAt) >= weekStart)
      .map((attempt) => (new Date(attempt.completedAt).getDay() + 6) % 7),
  );
  const studyDays = studyDayIndexes.size;

  // Hero section messaging
  let heroHeadline = "Your study space is ready";
  let heroDescription =
    "Paste your lecture notes or study guide below to generate your first StudyPack.";

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

  // Compute consecutive streak days honestly from attempts
  const streakDays = useMemo(() => {
    const attemptDates = Array.from(
      new Set(
        attempts.map((a) => new Date(a.completedAt).toISOString().slice(0, 10)),
      ),
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
    <div className="workspace home-refresh home-approved">
      <section
        className="home-approved-scene"
        aria-label="Welcome to your study space"
      >
        <div className="home-topbar">
          <h1 className="page-title">
            {timeGreeting},<span>{greetingName}!</span>
          </h1>
          <p className="page-description">
            Let’s turn your notes into progress.
          </p>
          <div className="home-top-actions flex items-center gap-2.5">
            <label className="home-search flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3">
              <MagnifyingGlass
                size={17}
                className="shrink-0 text-[var(--text-secondary)]"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search your StudyPacks"
                placeholder="Search your StudyPacks…"
                className="min-h-10 min-w-0 bg-transparent text-xs outline-none"
              />
            </label>
            <Link
              href="/app/calendar"
              aria-label="Open study calendar"
              className="home-top-icon"
            >
              <CalendarBlank size={20} />
            </Link>
            <Link
              href="/app/settings"
              aria-label="Open your account settings"
              className="home-top-avatar"
            >
              <Image
                src="/assets/mascot/fetch-logo.png"
                alt=""
                width={38}
                height={38}
              />
            </Link>
          </div>
        </div>
        <div className="home-approved-intro">
          <h2 className="font-display font-bold">
            Turn your notes into
            <br />
            <span>powerful</span> StudyPacks
          </h2>
          <p>
            Add notes or a file to build flashcards, quizzes, and summaries.
          </p>
          {activeDraft && (
            <p className="mt-2 font-bold">
              {heroHeadline} · {heroDescription}
            </p>
          )}
          <div className="home-intro-actions">
            <Button asChild className="home-mobile-create">
              <Link href="#add-material" onClick={() => setMaterialOpen(true)}>Create a StudyPack <ArrowRight size={18} /></Link>
            </Button>
            <Button asChild>
              <Link
                href={
                  activeDraft
                    ? `/app/study/${activeDraft.packId}`
                    : recent
                      ? `/app/study-packs/${recent.id}`
                      : "#add-material"
                }
              >
                {activeDraft
                  ? "Resume quiz"
                  : recent
                    ? "Continue studying"
                    : "Get started"}
                <ArrowRight weight="bold" size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </section>
      {showUsernamePrompt && (
        <div
          role="status"
          className="notice m-4 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <span>
            <strong>Complete your profile:</strong> Choose your unique @username
            to finish setting up your account.
          </span>
          <Link
            href="/app/settings?auth=setup-username"
            className="font-bold text-[var(--fetch-blue-700)] underline"
          >
            Set username →
          </Link>
        </div>
      )}
      {mode === "account" && status === "loading" && (
        <p role="status" className="notice m-4">
          Loading your study workspace…
        </p>
      )}
      <div className="home-approved-body">
        <div className="home-approved-main">
          <div className="home-stat-row">
            <section className="surface-card home-stat">
              <span className="home-stat-icon">
                <Books size={28} weight="fill" />
              </span>
              <div>
                <strong>{packs.length}</strong>
                <p>Total StudyPacks</p>
                <small>
                  {packs.length
                    ? `${packs.length} in your library`
                    : "No StudyPacks in your library"}
                </small>
              </div>
            </section>
            <section className="surface-card home-stat">
              <span className="home-stat-icon">
                <Target size={28} weight="bold" />
              </span>
              <div>
                <strong>{totalDeckQuestions}</strong>
                <p>Practice Questions</p>
                <small>{totalQuestionsAnswered} answered</small>
              </div>
            </section>
            <section className="surface-card home-stat">
              <span className="home-stat-icon">
                <Fire size={28} weight="fill" />
              </span>
              <div>
                <strong>
                  {streakDays} {streakDays === 1 ? "day" : "days"}
                </strong>
                <p>Current Streak</p>
                <small>
                  {streakDays
                    ? "Nice consistency!"
                    : "Keep building your routine"}
                </small>
              </div>
            </section>
          </div>
          <div className="home-create-panel min-w-0" data-expanded={materialOpen}>
            <button type="button" className="home-material-toggle" aria-expanded={materialOpen} aria-controls="home-material-form" onClick={() => setMaterialOpen(!materialOpen)}>
              <Stack size={22} /> {materialOpen ? "Close material editor" : "Add study material"}<CaretRight size={18} />
            </button>
            <div id="home-material-form"><CreatePackPanel /></div>
          </div>
        </div>
        <aside className="home-approved-aside">
          <section className="surface-card home-rhythm border border-[var(--border-subtle)]">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display">Your study rhythm</h2>
              <span className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2 py-1 text-[10px] text-[var(--text-secondary)]">
                This week
              </span>
            </div>
            <div className="home-rhythm-summary mt-4 flex items-center gap-3">
              <div
                className="home-rhythm-ring"
                style={{
                  background: `conic-gradient(var(--fetch-blue-600) ${Math.min(100, (studyDays / 5) * 100)}%, var(--fetch-blue-100) 0)`,
                }}
              >
                <span>
                  <strong>{studyDays}/5</strong>
                  <small>study days</small>
                </span>
              </div>
              <div className="text-xs">
                <strong className="text-[var(--fetch-blue-700)]">
                  {studyDays >= 5
                    ? "Goal reached!"
                    : studyDays
                      ? "Keep it up!"
                      : "Start your rhythm"}
                </strong>
                <p className="mt-1 text-[var(--text-secondary)]">
                  {studyDays >= 5
                    ? "You achieved your weekly rhythm target."
                    : studyDays
                      ? `${5 - studyDays} more days to reach your weekly goal.`
                      : "Complete a study session to log today."}
                </p>
              </div>
            </div>
            <div className="home-week-dots mt-4 flex justify-between text-[11px] text-[var(--text-secondary)]">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                <span key={index}>
                  <i
                    role="img"
                    className={studyDayIndexes.has(index) ? "is-done" : ""}
                    aria-label={`${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]} ${studyDayIndexes.has(index) ? "studied" : "no session"}`}
                  />
                  {day}
                </span>
              ))}
            </div>
            <Link
              href="/app/progress"
              className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[var(--fetch-blue-700)]"
            >
              View full progress <ArrowRight size={13} />
            </Link>
          </section>
          <section className="surface-card home-recent">
            <div className="home-recent-heading">
              <h2 className="font-display">Recent StudyPacks</h2>
              <Link href="/app/study-packs">View all →</Link>
            </div>
            {visiblePacks.slice(0, 3).map((pack) => (
              <Link
                className="home-recent-pack"
                href={`/app/study-packs/${pack.id}`}
                key={pack.id}
              >
                <span>
                  <Stack size={24} weight="duotone" />
                </span>
                <div>
                  <h3>{pack.title}</h3>
                  <p>
                    {pack.artifacts?.some((a) => a.kind === "flashcards")
                      ? "Flashcard deck"
                      : `${pack.questions.length} questions`}{" "}
                    ·{" "}
                    {new Date(pack.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <CaretRight size={16} />
              </Link>
            ))}
            {!visiblePacks.length && (
              <p className="home-recent-empty">
                {search.trim()
                  ? `No StudyPacks match “${search}”.`
                  : "Your saved StudyPacks will appear here after you create your first pack."}
              </p>
            )}
          </section>
          <p className="notice text-[11px]">
            {mode === "account"
              ? "Your StudyPacks and quiz attempts are saved to your account."
              : "Browser demo · Packs and quiz attempts stay on this device."}
          </p>
        </aside>
      </div>
      <section className="home-focus-tools">
        <h2 className="font-display font-bold">Make room for focus</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "AI Tutor",
              text: "Interactive tutoring & explanations",
              href: "tutor",
            },
            {
              label: "Pomodoro Timer",
              text: "Focused study blocks with sound cues",
              href: "pomodoro",
            },
            {
              label: "Music Studio",
              text: "Curated streams & persistent audio",
              href: "music",
            },
            {
              label: "Study Calendar",
              text: "Schedule exams & reviews",
              href: "calendar",
            },
          ].map(({ label, text, href }) => (
            <Link
              key={href}
              href={`/app/${href}`}
              className="surface-card flex items-center gap-3 border border-[var(--border-subtle)] p-4 hover:border-[var(--fetch-blue-400)]"
            >
              <Image
                src={`/assets/icons/nav/${href}.png`}
                alt=""
                width={36}
                height={36}
              />
              <div className="min-w-0">
                <h3 className="text-sm font-bold">{label}</h3>
                <p className="text-xs text-[var(--text-secondary)]">{text}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
