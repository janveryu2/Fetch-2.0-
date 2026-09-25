"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { MagnifyingGlass, Plus, Stack } from "@phosphor-icons/react";
import { Suspense, useEffect, useState, useTransition } from "react";
import { useDemo } from "@/components/app/demo-provider";
import { Button } from "@/components/ui/button";
import {
  buildStudyPacksQuery,
  parseStudyPacksParams,
  type StudyPacksSort,
} from "@/lib/study-packs-url";

function StudyPacksContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { packs, attempts, status } = useDemo();

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
    setQuery("");
    const newQuery = buildStudyPacksQuery("", sort);
    startTransition(() => {
      router.replace(`${pathname}${newQuery}`, { scroll: false });
    });
  };

  return (
    <div className="workspace">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
        <div className="mt-8 flex flex-col items-center justify-center rounded-2xl bg-[var(--surface-subtle)] p-12 text-center">
          <p className="text-sm font-semibold text-[var(--text-secondary)]" role="status">
            Loading your StudyPacks…
          </p>
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
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
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
                <article key={p.id} className="surface-card p-5">
                  <div className="flex items-center gap-3">
                    <Stack size={26} className="text-[var(--fetch-blue-700)]" />
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
                  <div className="mt-5 flex gap-3 border-t border-[var(--border-subtle)] pt-4">
                    <Button asChild size="sm">
                      <Link href={`/app/study/${p.id}`}>Study</Link>
                    </Button>
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
