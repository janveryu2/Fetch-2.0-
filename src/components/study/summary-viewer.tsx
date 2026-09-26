"use client";

import { useEffect, useState } from "react";
import { BookOpen, Lightbulb, BookmarkSimple, ArrowsClockwise, CheckCircle } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";

interface SummaryData {
  overview: string;
  keyConcepts: Array<{
    concept: string;
    explanation: string;
    relevance?: string;
  }>;
  definitions: Array<{
    term: string;
    definition: string;
    context?: string;
  }>;
  relationships?: Array<{
    conceptA: string;
    conceptB: string;
    relationship: string;
  }>;
  remember: string[];
  quickReview?: Array<{
    question: string;
    answer: string;
  }>;
}

export function SummaryViewer({ artifactId }: { artifactId: string }) {
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch(`/api/artifacts/${artifactId}/summary`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load summary content");
        return res.json();
      })
      .then((data) => {
        if (mounted) {
          const content = (data?.content || data) as SummaryData;
          setSummary(content);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load summary");
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [artifactId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-[var(--text-secondary)]">
        <ArrowsClockwise className="mr-2 animate-spin text-[var(--fetch-blue-600)]" size={20} />
        Loading structured summary...
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="p-6 text-center text-sm text-[var(--text-secondary)]">
        {error || "Summary details are not available."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview */}
      {summary.overview && (
        <section className="rounded-2xl border border-[var(--fetch-blue-200)] bg-[var(--fetch-blue-50)] p-5">
          <div className="flex items-center gap-2 font-display text-lg font-bold text-[var(--fetch-blue-900)]">
            <BookOpen size={22} className="text-[var(--fetch-blue-700)]" />
            <span>Executive Overview</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--fetch-blue-950)]">
            {summary.overview}
          </p>
        </section>
      )}

      {/* Key Concepts */}
      {summary.keyConcepts && summary.keyConcepts.length > 0 && (
        <section className="surface-card p-5">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-[var(--text-primary)]">
              <Lightbulb size={20} className="text-amber-500" />
              <span>Key Concepts</span>
            </div>
            <Badge tone="neutral">{summary.keyConcepts.length}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {summary.keyConcepts.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4"
              >
                <h4 className="font-bold text-sm text-[var(--fetch-blue-700)]">{item.concept}</h4>
                <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                  {item.explanation}
                </p>
                {item.relevance && (
                  <p className="mt-2 text-[11px] font-medium text-[var(--text-tertiary)] italic">
                    Relevance: {item.relevance}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Definitions */}
      {summary.definitions && summary.definitions.length > 0 && (
        <section className="surface-card p-5">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <div className="flex items-center gap-2 font-display text-lg font-bold text-[var(--text-primary)]">
              <BookmarkSimple size={20} className="text-[var(--fetch-blue-600)]" />
              <span>Core Terminology</span>
            </div>
            <Badge tone="neutral">{summary.definitions.length}</Badge>
          </div>
          <dl className="mt-4 divide-y divide-[var(--border-subtle)]">
            {summary.definitions.map((def, idx) => (
              <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                <dt className="font-bold text-sm text-[var(--text-primary)]">{def.term}</dt>
                <dd className="mt-0.5 text-xs text-[var(--text-secondary)] leading-relaxed">
                  {def.definition}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Key Takeaways */}
      {summary.remember && summary.remember.length > 0 && (
        <section className="surface-card p-5">
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-3 font-display text-lg font-bold text-[var(--text-primary)]">
            <CheckCircle size={20} className="text-emerald-600" />
            <span>Things to Remember</span>
          </div>
          <ul className="mt-4 space-y-2">
            {summary.remember.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)]">
                <span className="mt-1 block h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
