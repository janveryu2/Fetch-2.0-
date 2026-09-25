"use client";

import {
  FilePdf,
  LinkSimple,
  NotePencil,
  Sparkle,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/components/app/demo-provider";
import type { StudyQuestion } from "@/lib/demo-types";
import { cn } from "@/lib/cn";

const tabs = [
  { id: "paste", label: "Paste text", status: "Available", icon: NotePencil },
  { id: "pdf", label: "PDF", status: "Coming soon", icon: FilePdf },
  { id: "url", label: "Link", status: "Coming soon", icon: LinkSimple },
] as const;

export function CreatePackPanel() {
  const router = useRouter();
  const { addPack, mode } = useDemo();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("paste");
  const [title, setTitle] = useState("My study pack");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [count, setCount] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const charactersNeeded = Math.max(0, 80 - source.trim().length);
  const isGenerateDisabled =
    tab !== "paste" ||
    loading ||
    title.trim().length < 2 ||
    source.trim().length < 80;

  async function generate() {
    setError("");
    setWarning("");
    if (tab !== "paste") {
      setError(
        "PDF and URL extraction require production services. Paste text is fully available today.",
      );
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), source: source.trim(), count }),
      });
      const data = (await response.json()) as {
        error?: string;
        questions?: StudyQuestion[];
        packId?: string;
        provider?: string;
        warning?: string;
      };
      if (!response.ok || !data.questions) {
        throw new Error(data.error || "FETCH could not create this StudyPack.");
      }

      if (data.warning) {
        setWarning(data.warning);
      }

      const id = mode === "account" ? data.packId : crypto.randomUUID();
      if (!id) throw new Error("FETCH could not confirm that this StudyPack was saved.");

      addPack({
        id,
        title: title.trim(),
        sourceLabel:
          mode === "account"
            ? data.provider === "openai"
              ? "Pasted text · AI generated"
              : "Pasted text · development fixture"
            : "Pasted text · development fixture",
        createdAt: new Date().toISOString(),
        questions: data.questions,
        progress: 0,
      });

      router.push(`/app/study-packs/${id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "FETCH could not create this StudyPack.",
      );
    } finally {
      setLoading(false);
    }
  }

  const handleTabKeyDown = (e: React.KeyboardEvent, currentId: string) => {
    const currentIndex = tabs.findIndex((t) => t.id === currentId);
    let nextIndex = currentIndex;
    if (e.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    const nextTab = tabs[nextIndex];
    setTab(nextTab.id);
    setError("");
    const nextElement = document.getElementById(`tab-${nextTab.id}`);
    nextElement?.focus();
  };

  return (
    <section id="add-material" className="surface-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <h2 className="font-display text-2xl font-semibold">
            Create a StudyPack
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Add material, choose a size, and generate focused practice.
          </p>
        </div>
        <Badge tone={mode === "account" ? "success" : "neutral"}>
          {mode === "account" ? "Connected account" : "Browser demo"}
        </Badge>
      </div>

      <div className="p-5 sm:p-7">
        <div
          role="tablist"
          aria-label="Material type"
          className="grid grid-cols-3 rounded-xl bg-[var(--surface-subtle)] p-1"
        >
          {tabs.map(({ id, label, status, icon: Icon }) => (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-label={`${label} (${status})`}
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              tabIndex={tab === id ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, id)}
              onClick={() => {
                setTab(id);
                setError("");
              }}
              className={cn(
                "flex min-h-12 cursor-pointer flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 rounded-[10px] px-2 py-1 font-extrabold transition-colors",
                tab === id
                  ? "bg-[var(--surface-card)] text-[var(--fetch-blue-700)] shadow-sm"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon size={18} aria-hidden="true" />
                <span>{label}</span>
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold px-1.5 py-0.2 rounded",
                  id === "paste"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-[var(--surface-subtle)] text-[var(--text-tertiary)]",
                )}
              >
                {status}
              </span>
            </button>
          ))}
        </div>

        <div
          id={`panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab}`}
          tabIndex={0}
          className="focus:outline-none"
        >
          {tab !== "paste" && (
            <p className="notice mt-4" role="status">
              {tab === "pdf" ? "PDF" : "Link"} import is coming soon. Paste your
              material as text to create a pack today.
            </p>
          )}

        <label className="mt-5 block font-extrabold">
          StudyPack name
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4"
          />
        </label>

        {tab === "paste" && (
          <label className="mt-5 block font-extrabold">
            Paste your study material
            <textarea
              value={source}
              onChange={(event) => setSource(event.target.value)}
              maxLength={20_000}
              rows={6}
              aria-describedby="source-requirement"
              placeholder="Paste at least 80 characters from your notes or module..."
              className="mt-2 w-full resize-y rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] p-4 placeholder:text-[var(--text-tertiary)]"
            />
            <div
              id="source-requirement"
              className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span
                role="status"
                aria-live="polite"
                className={
                  charactersNeeded > 0
                    ? "font-medium text-[var(--text-secondary)]"
                    : "font-bold text-[var(--success)]"
                }
              >
                {charactersNeeded > 0
                  ? `${charactersNeeded} more character${charactersNeeded === 1 ? "" : "s"} needed to generate (minimum 80)`
                  : `Ready to generate (${source.trim().length.toLocaleString()} characters)`}
              </span>
              <span className="font-bold text-[var(--text-tertiary)]">
                {source.length.toLocaleString()} / 20,000
              </span>
            </div>
          </label>
        )}

        {tab === "pdf" && (
          <label className="mt-5 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-6 text-center text-[var(--fetch-blue-900)]">
            <UploadSimple size={34} />
            <span className="mt-3 font-extrabold">PDF import preview</span>
            <span className="mt-1 text-sm">
              Extraction is in active development. Please paste text for now.
            </span>
            <input
              disabled
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) =>
                setFileName(event.target.files?.[0]?.name || "")
              }
            />
            {fileName && <Badge className="mt-3">{fileName}</Badge>}
          </label>
        )}

        {tab === "url" && (
          <label className="mt-5 block font-extrabold">
            Article or supported video URL
            <input
              disabled
              type="url"
              placeholder="https://"
              className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 placeholder:text-[var(--text-tertiary)]"
            />
            <span className="mt-1 block text-xs text-[var(--text-secondary)]">
              Web URL extraction is in active development.
            </span>
          </label>
        )}
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="block font-extrabold">
            Questions to generate
            <input
              type="range"
              min="3"
              max="12"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              className="mt-3 w-full accent-[var(--fetch-blue-600)]"
            />
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">
              Up to {count} questions
            </span>
          </label>
          <Button
            onClick={generate}
            disabled={isGenerateDisabled}
            title={
              isGenerateDisabled
                ? "Add a title and at least 80 characters of material to generate"
                : "Generate questions"
            }
            className="sm:min-w-48"
          >
            {loading ? (
              "Writing questions..."
            ) : (
              <>
                <Sparkle size={20} weight="fill" /> Generate
              </>
            )}
          </Button>
        </div>

        {warning && (
          <div role="status" className="notice mt-4 text-sm font-medium">
            {warning}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-5 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900"
          >
            <WarningCircle size={21} className="shrink-0" />
            {error}
          </div>
        )}
      </div>
    </section>
  );
}
