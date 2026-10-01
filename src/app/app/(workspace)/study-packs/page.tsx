"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { Suspense, useEffect, useState, useTransition } from "react";
import { useDemo } from "@/components/app/demo-provider";
import { Button } from "@/components/ui/button";
import { StudyPackCardSkeleton } from "@/components/ui/domain-skeletons";
import type { ArtifactKind, StudyArtifact, StudyPack } from "@/lib/demo-types";
import {
  buildStudyPacksQuery,
  parseStudyPacksParams,
  type StudyPacksSort,
} from "@/lib/study-packs-url";

function StudyPacksContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { packs, attempts, status, mode, userId } = useDemo();
  const [artifactFilter, setArtifactFilter] = useState<ArtifactKind | "all">("all");
  const [artifacts, setArtifacts] = useState<StudyArtifact[]>([]);
  const [artifactError, setArtifactError] = useState("");
  useEffect(() => {
    if (mode !== "account" || !userId) return;
    const controller = new AbortController();
    void fetch("/api/artifacts", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Material filters are unavailable. You can still open your packs.");
        const data = await response.json();
        setArtifacts(data.artifacts ?? []);
        setArtifactError("");
      }).catch(error => {
        if (!controller.signal.aborted) setArtifactError(error.message);
      });
    return () => controller.abort();
  }, [mode, userId, packs]);
  const materials = (pack: StudyPack) => mode === "account"
    ? artifacts.filter(artifact => artifact.packId === pack.id && artifact.status === "ready")
    : (pack.artifacts ?? []).filter(artifact => artifact.status === "ready");
  const kinds = (pack: StudyPack) => [...new Set([
    ...materials(pack).map(artifact => artifact.kind),
    ...(pack.questions.length ? ["quiz" as const] : []),
  ])];
  const kindLabels = { quiz: "Quiz", flashcards: "Flashcards", summary: "Summary" };

  const urlParams = parseStudyPacksParams(searchParams);
  const [prevUrlQ, setPrevUrlQ] = useState(urlParams.q);
  const [query, setQuery] = useState(urlParams.q);
  const sort = urlParams.sort;
  const [, startTransition] = useTransition();

  // Adjust state during render if URL changes externally (e.g. browser Back / Forward)
  if (urlParams.q !== prevUrlQ) {
    setPrevUrlQ(urlParams.q);
    setQuery(urlParams.q);
  }

  // Debounced sync to URL when user types a search query
  useEffect(() => {
    if (query === urlParams.q) return;

    const timer = setTimeout(() => {
      const newQuery = buildStudyPacksQuery(query, sort);
      startTransition(() => {
        router.replace(`${pathname}${newQuery}`, { scroll: false });
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [query, urlParams.q, sort, pathname, router]);

  const last = (id: string) =>
    attempts
      .filter((a) => a.packId === id)
      .toSorted((a, b) => b.completedAt.localeCompare(a.completedAt))[0];

  const filtered = packs
    .filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase()))
    .filter(p => artifactFilter === "all" || kinds(p).includes(artifactFilter))
    .toSorted((a, b) =>
      sort === "studied"
        ? (last(b.id)?.completedAt ?? "").localeCompare(
            last(a.id)?.completedAt ?? "",
          )
        : b.createdAt.localeCompare(a.createdAt),
    );

  const handleSortChange = (newSort: StudyPacksSort) => {
    const newQuery = buildStudyPacksQuery(query, newSort);
    startTransition(() => {
      router.replace(`${pathname}${newQuery}`, { scroll: false });
    });
  };

  const handleClearSearch = () => {
    setArtifactFilter("all");
    setQuery("");
    const newQuery = buildStudyPacksQuery("", sort);
    startTransition(() => {
      router.replace(`${pathname}${newQuery}`, { scroll: false });
    });
  };

  return (
    <div className="workspace study-packs-page">
      <div className="study-packs-heading flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Your StudyPacks</h1>
          <p className="page-description">
            Keep your learning materials organized and ready whenever you are.
          </p>
        </div>
        <Button asChild>
          <Link href="/app/home#add-material">
            <Plus />
            Add material
          </Link>
        </Button>
      </div>

      {status === "loading" ? (
        <div className="mt-8 grid gap-4 md:grid-cols-2" role="status" aria-label="Loading your StudyPacks">
          <StudyPackCardSkeleton />
          <StudyPackCardSkeleton />
          <StudyPackCardSkeleton />
          <StudyPackCardSkeleton />
        </div>
      ) : packs.length === 0 ? (
        /* Empty state: Hide search and sort controls to keep the single next step prominent */
        <div className="mt-8 flex flex-col items-center gap-5 rounded-2xl bg-[var(--surface-subtle)] p-7 text-center sm:flex-row sm:text-left">
          <Image
            src="/assets/mascot/fetch-seated.png"
            alt="FETCH ready to study"
            width={150}
            height={150}
            className="pixel-art"
          />
          <div>
            <h2 className="font-display text-2xl font-semibold">
              Your StudyPack library is ready.
            </h2>
            <p className="mt-2 text-[var(--text-secondary)]">
              Bring your notes into FETCH and create your first practice session.
            </p>
            <Button asChild className="mt-4">
              <Link href="/app/home#add-material">
                Create your first StudyPack
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Controls revealed only when packs exist */}
          <div className="study-packs-controls mt-7 flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search StudyPacks</span>
              <MagnifyingGlass
                size={20}
                className="absolute left-3 top-5 text-[var(--text-tertiary)]"
              />
              <input
                className="field pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your StudyPacks"
              />
            </label>
            <label>
              <span className="sr-only">Sort StudyPacks</span>
              <select
                className="field"
                value={sort}
                onChange={(e) => handleSortChange(e.target.value as StudyPacksSort)}
              >
                <option value="created">Recently created</option>
                <option value="studied">Recently studied</option>
              </select>
            </label>
          </div>

          <div className="study-packs-filters segment mt-3" aria-label="Filter study materials">
            {(["all", "quiz", "flashcards", "summary"] as const).map(kind => <button key={kind} type="button" aria-pressed={artifactFilter === kind} onClick={() => setArtifactFilter(kind)}>{kind === "all" ? "All" : kind === "quiz" ? "Quizzes" : kind === "summary" ? "Summaries" : "Flashcards"}</button>)}
          </div>
          {artifactError && <p role="status" className="mt-3 text-sm text-[var(--text-secondary)]">{artifactError}</p>}

          <p
            className="mt-3 text-sm text-[var(--text-secondary)]"
            role="status"
            aria-live="polite"
          >
            {filtered.length} {filtered.length === 1 ? "pack" : "packs"}{" "}
            {query.trim() ? "found" : ""}
          </p>

          {filtered.length > 0 ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {filtered.map((p) => (
                <article key={p.id} className="surface-card study-pack-card p-5">
                  <div className="study-pack-title flex items-center gap-3">
                    <Image src="/assets/icons/nav/studypacks.png" width={48} height={48} alt="" />
                    <h2 className="font-display break-words text-xl font-semibold">
                      {p.title}
                    </h2>
                  </div>
                  <p className="mt-4 text-sm text-[var(--text-secondary)]">
                    {p.questions.length} questions · Created{" "}
                    {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    {last(p.id)
                      ? `Last studied ${new Date(last(p.id)!.completedAt).toLocaleDateString()} · ${last(p.id)!.score}% accuracy`
                      : "Ready for your first session"}
                  </p>
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                    {p.sourceLabel}
                  </p>
                  <div className="study-pack-badges mt-3 flex flex-wrap items-center gap-1.5">
                    {kinds(p).map(kind => <span key={kind} className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-[var(--fetch-blue-50)] text-[var(--fetch-blue-700)] border border-[var(--fetch-blue-200)]">{kindLabels[kind]}</span>)}
                  </div>
                  <div className="study-pack-actions mt-5 flex flex-wrap gap-2.5 border-t border-[var(--border-subtle)] pt-4">
                    {!!p.questions.length && <Button asChild size="sm">
                      <Link href={`/app/study/${p.id}`}>Study Quiz</Link>
                    </Button>}
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/app/study-packs/${p.id}`}>Open pack</Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex flex-col items-center gap-5 rounded-2xl bg-[var(--surface-subtle)] p-7 text-center sm:flex-row sm:text-left">
              <Image
                src="/assets/mascot/fetch-seated.png"
                alt="FETCH ready to study"
                width={150}
                height={150}
                className="pixel-art"
              />
              <div>
                <h2 className="font-display text-2xl font-semibold">
                  No matching StudyPacks
                </h2>
                <p className="mt-2 text-[var(--text-secondary)]">
                  Try a different title or clear your search to see all packs.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={handleClearSearch}
                >
                  Clear search
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function StudyPacksPage() {
  return (
    <Suspense
      fallback={
        <div className="workspace">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="page-title">Your StudyPacks</h1>
              <p className="page-description">
                Keep your learning materials organized and ready whenever you are.
              </p>
            </div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-center rounded-2xl bg-[var(--surface-subtle)] p-12 text-center">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              Loading…
            </p>
          </div>
        </div>
      }
    >
      <StudyPacksContent />
    </Suspense>
  );
}
