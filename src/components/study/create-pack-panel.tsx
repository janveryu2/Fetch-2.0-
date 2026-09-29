"use client";

import Image from "next/image";
import {
  Camera,
  FilePdf,
  LinkSimple,
  NotePencil,
  Sparkle,
  UploadSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/components/app/demo-provider";
import { useStudentPreferences } from "@/components/app/student-preferences-provider";
import type { StudyQuestion } from "@/lib/demo-types";
import { cn } from "@/lib/cn";
import {
  computePayloadFingerprint,
  resolveRequestId,
  rotateRequestState,
  createInitialRequestState,
  type RequestState,
} from "@/lib/study/request-lifecycle";
import { CreateManualDeckModal } from "@/components/study/create-manual-deck-modal";
import { PaperScanIntake } from "@/components/study/paper-scan-intake";
import { GenerationProgress } from "@/components/study/generation-progress";

export function CreatePackPanel() {
  const router = useRouter();
  const { addPack, mode } = useDemo();
  const { preferences } = useStudentPreferences();
  const tabs = [
    { id: "paste", label: "Paste text", status: "Available", icon: NotePencil },
    {
      id: "pdf",
      label: "PDF",
      status: mode === "account" ? "Available" : "Sign in",
      icon: FilePdf,
    },
    {
      id: "scan",
      label: "Scan notes",
      status: mode === "account" ? "Available" : "Sign in",
      icon: Camera,
    },
    { id: "url", label: "Link", status: "Coming soon", icon: LinkSimple },
  ] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("paste");
  const [title, setTitle] = useState("My study pack");
  const [source, setSource] = useState("");
  const [count, setCount] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [outputKind, setOutputKind] = useState<"quiz" | "flashcards" | "summary">("quiz");
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>(createInitialRequestState);
  const [aiUsage, setAiUsage] = useState<{ remaining: number; allowance: number } | null>(null);
  const [jobProgress, setJobProgress] = useState<{
    jobId: string;
    stage: string;
    acceptedCount: number;
    requestedCount: number;
    cancelRequested: boolean;
    createdAt?: string | null;
  } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Poll active generation job
  useEffect(() => {
    if (!jobProgress?.jobId) return;
    if (
      jobProgress.stage === "completed" ||
      jobProgress.stage === "failed" ||
      jobProgress.stage === "cancelled"
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/generate/job/${jobProgress.jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJobProgress((prev) => ({
          jobId: data.jobId,
          stage: data.stage,
          acceptedCount: data.acceptedCount || 0,
          requestedCount: data.requestedCount,
          cancelRequested: data.cancelRequested,
          createdAt: data.createdAt || prev?.createdAt || null,
        }));

        if (data.status === "completed") {
          clearInterval(interval);
          setLoading(false);
          const redirectId = data.packId;
          if (redirectId) {
            router.push(`/app/study-packs/${redirectId}`);
          }
        } else if (data.status === "failed") {
          clearInterval(interval);
          setLoading(false);
          setError(data.failureMessage || "Generation failed. Please retry.");
        } else if (data.status === "cancelled") {
          clearInterval(interval);
          setLoading(false);
          setWarning("Generation was cancelled. Quota was not charged.");
        }
      } catch {
        // Polling tick retry
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [jobProgress?.jobId, jobProgress?.stage, router]);

  async function cancelJob() {
    if (!jobProgress?.jobId) return;
    setCancelling(true);
    try {
      await fetch(`/api/generate/job/${jobProgress.jobId}/cancel`, { method: "POST" });
      setJobProgress((prev) => (prev ? { ...prev, cancelRequested: true } : null));
    } catch {
      // Ignored
    } finally {
      setCancelling(false);
    }
  }

  const [pdfDoc, setPdfDoc] = useState<{
    docId: string;
    fileName: string;
    pageCount: number;
    characterCount: number;
    textPreview: string;
  } | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [scanDocId, setScanDocId] = useState<string | null>(null);
  const [scanText, setScanText] = useState("");

  // Fetch quota balance for authenticated account users
  useEffect(() => {
    if (mode === "account") {
      fetch("/api/ai-usage")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && typeof data.remaining === "number") {
            setAiUsage({ remaining: data.remaining, allowance: data.allowance });
          }
        })
        .catch(() => {});
    }
  }, [mode]);

  const charactersNeeded = Math.max(0, 80 - source.trim().length);
  const isGenerateDisabled =
    loading ||
    uploadingPdf ||
    title.trim().length < 2 ||
    (tab === "paste" && source.trim().length < 80) ||
    (tab === "pdf" && (!pdfDoc || mode !== "account")) ||
    (tab === "scan" && (!scanDocId || scanText.trim().length < 80 || mode !== "account")) ||
    tab === "url";

  async function handlePdfUpload(file: File) {
    if (!file) return;
    setError("");
    setWarning("");
    if (mode !== "account") {
      setError("Sign in with an account to upload PDFs and generate StudyPacks.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("PDF file exceeds the 10 MiB limit.");
      return;
    }
    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/pdf/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload and parse PDF.");
      }
      setPdfDoc({
        docId: data.docId,
        fileName: data.fileName,
        pageCount: data.pageCount,
        characterCount: data.characterCount,
        textPreview: data.textPreview,
      });
      if (title === "My study pack" || !title.trim()) {
        const cleanName = data.fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
        setTitle(cleanName.charAt(0).toUpperCase() + cleanName.slice(1));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF upload failed.");
      setPdfDoc(null);
    } finally {
      setUploadingPdf(false);
    }
  }

  async function generate() {
    setError("");
    setWarning("");

    if (mode === "account") {
      if (tab === "pdf" && !pdfDoc) {
        setError("Please upload a PDF document first.");
        return;
      }
      if (tab === "scan" && (!scanDocId || scanText.trim().length < 80)) {
        setError("Please extract and review at least 80 characters of notes from your scans.");
        return;
      }
      setLoading(true);
      setError("");
      setWarning("");

      try {
        const rawSource =
          tab === "pdf"
            ? pdfDoc!.textPreview
            : tab === "scan"
            ? scanText.trim()
            : source.trim();
        const sourceLabel =
          tab === "pdf"
            ? `PDF: ${pdfDoc!.fileName}`
            : tab === "scan"
            ? "Scanned Notes"
            : "Pasted Notes";
        const sourceType =
          tab === "pdf" ? "pdf" : tab === "scan" ? "scan" : "text";

        const response = await fetch("/api/generate/job", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            source: rawSource,
            count,
            artifactKind: outputKind,
            sourceType,
            sourceLabel,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || data.error || "Failed to start generation job");
        }

        setJobProgress({
          jobId: data.jobId,
          stage: data.stage || "queued",
          acceptedCount: 0,
          requestedCount: count,
          cancelRequested: false,
          createdAt: data.createdAt || new Date().toISOString(),
        });
      } catch (err) {
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to start generation");
      }
      return;
    }

    // Browser demo fallback
    if (tab === "pdf") {
      if (!pdfDoc) {
        setError("Please upload a PDF document first.");
        return;
      }
      setLoading(true);
      try {
        const fingerprint = computePayloadFingerprint({
          mode: "pdf",
          docId: pdfDoc.docId,
          title,
          count,
        });
        const { requestId: reqId, nextState } = resolveRequestId(requestState, fingerprint);
        setRequestState(nextState);

        const response = await fetch("/api/pdf/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            docId: pdfDoc.docId,
            title: title.trim(),
            count,
            requestId: reqId,
          }),
        });
        const data = (await response.json()) as {
          error?: string;
          message?: string;
          questions?: StudyQuestion[];
          packId?: string;
          provider?: string;
          warning?: string;
        };
        if (!response.ok || !data.questions) {
          throw new Error(data.message || data.error || "FETCH could not create this StudyPack from PDF.");
        }

        if (data.warning) {
          setWarning(data.warning);
        }

        const id = data.packId || crypto.randomUUID();
        setRequestState(rotateRequestState());

        addPack({
          id,
          title: title.trim(),
          sourceLabel: `PDF: ${pdfDoc.fileName}`,
          createdAt: new Date().toISOString(),
          questions: data.questions,
          progress: 0,
        });

        router.push(`/app/study-packs/${id}`);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "FETCH could not create this StudyPack from PDF."
        );
      } finally {
        setLoading(false);
      }
      return;
    }

    if (tab !== "paste") {
      setError("URL extraction is in development. Paste text or upload a PDF to generate.");
      return;
    }

    setLoading(true);
    try {
      const fingerprint = computePayloadFingerprint({
        mode: "paste",
        title,
        source,
        count,
      });
      const { requestId: reqId, nextState } = resolveRequestId(requestState, fingerprint);
      setRequestState(nextState);

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          source: source.trim(),
          count,
          requestId: reqId,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
        questions?: StudyQuestion[];
        packId?: string;
        provider?: string;
        warning?: string;
      };
      if (!response.ok || !data.questions) {
        throw new Error(data.message || data.error || "FETCH could not create this StudyPack.");
      }

      if (data.warning) {
        setWarning(data.warning);
      }

      const id = data.packId || crypto.randomUUID();
      if (!id) throw new Error("FETCH could not confirm that this StudyPack was saved.");

      // Success: generate fresh requestId for the next session
      setRequestState(rotateRequestState());

      addPack({
        id,
        title: title.trim(),
        sourceLabel: "Pasted text · development fixture",
        createdAt: new Date().toISOString(),
        questions: data.questions,
        progress: 0,
      });

      router.push(`/app/study-packs/${id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "FETCH could not create this StudyPack."
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
    <section id="add-material" className="surface-card overflow-hidden rounded-3xl border border-[var(--border-subtle)] shadow-xs">
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/icons/nav/studypacks.png"
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0"
          />
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-black text-[var(--text-primary)]">
              Create a StudyPack
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-[var(--text-secondary)]">
              Add your material, choose a format, and let FETCH turn it into focused practice.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "account" && aiUsage && (
            <span className="text-xs font-bold text-[var(--fetch-blue-700)] bg-[var(--fetch-blue-50)] px-3 py-1 rounded-full border border-[var(--fetch-blue-200)]">
              {aiUsage.remaining} of {aiUsage.allowance} AI packs left this month
            </span>
          )}
          <Badge tone={mode === "account" ? "success" : "neutral"} className="rounded-full px-3 py-1 font-bold">
            {mode === "account" ? "✓ Connected account" : "Browser demo"}
          </Badge>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div
          role="tablist"
          aria-label="Material type"
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
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
                "flex min-h-[50px] cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-extrabold transition-all",
                tab === id
                  ? "border-[#1068E9] bg-[var(--surface-card)] text-[#1068E9] shadow-xs ring-2 ring-[#1068E9]/15"
                  : "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface-card)]",
              )}
            >
              <Icon size={19} weight={tab === id ? "bold" : "regular"} aria-hidden="true" />
              <span>{label}</span>
              {status !== "Available" && (
                <span className="text-[10px] font-bold text-[var(--text-tertiary)] bg-[var(--border-subtle)] px-1.5 py-0.5 rounded-sm">
                  {status}
                </span>
              )}
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
          {tab === "url" && (
            <p className="notice mt-4" role="status">
              Link import is coming soon. Paste your material as text or upload a PDF to create a pack today.
            </p>
          )}

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <label htmlFor="pack-title-input" className="block font-extrabold">
              StudyPack name
            </label>
            {preferences?.primarySubject && (
              <span className="text-xs font-semibold text-[var(--fetch-blue-700)]">
                Focus: {preferences.primarySubject}
              </span>
            )}
          </div>
          <input
            id="pack-title-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4"
          />
          {preferences?.primarySubject && title === "My study pack" && (
            <button
              type="button"
              onClick={() => setTitle(`${preferences.primarySubject} Notes`)}
              className="mt-1.5 block text-xs font-bold text-[var(--fetch-blue-700)] underline cursor-pointer"
            >
              Use suggestion: {preferences.primarySubject} Notes
            </button>
          )}
        </div>

        {tab === "paste" && (
          <>
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
                {source.length.toLocaleString()} / 20,000 characters
              </span>
            </div>
          </label>

          {/* Quick Example Starter Pills from visual reference */}
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Or try a quick example:</span>
            {[
              {
                label: "🧬 Biology: Cell structure",
                title: "Biology: Cell Structure",
                text: "Cells are the basic structural and functional units of all living organisms. The cell membrane is a phospholipid bilayer that regulates transport into and out of the cell. Mitochondria generate ATP through cellular respiration. Ribosomes assemble proteins from mRNA sequences. Plant cells contain chloroplasts for photosynthesis and a rigid cellulose cell wall.",
              },
              {
                label: "📐 Math: Quadratic functions",
                title: "Math: Quadratic Functions",
                text: "A quadratic function is a second-degree polynomial of the form f(x) = ax² + bx + c. The graph of a quadratic function is a parabola with a vertex at (-b/2a, f(-b/2a)). The discriminant Δ = b² - 4ac determines the nature of the roots: two real roots if Δ > 0, one repeated root if Δ = 0, and complex conjugate roots if Δ < 0.",
              },
              {
                label: "🏛️ History: World War II",
                title: "History: World War II",
                text: "World War II was a global conflict lasting from 1939 to 1945 between the Allies and Axis powers. Key turning points included the Battle of Stalingrad in 1943, the Allied invasion of Normandy on D-Day in June 1944, and the Pacific naval engagements at Midway. The war ended following unconditional surrenders in 1945.",
              },
              {
                label: "🧠 Psychology: Memory",
                title: "Psychology: Memory",
                text: "Human memory is categorized into sensory memory, working or short-term memory, and long-term memory. Working memory holds information temporarily with a limited capacity of roughly 7 plus or minus 2 items. Long-term memory divides into explicit declarative memory (semantic and episodic) and implicit procedural memory.",
              },
            ].map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setTitle(example.title);
                  setSource(example.text);
                  setError("");
                }}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--fetch-blue-400)] hover:bg-[var(--surface-card)] hover:text-[var(--fetch-blue-700)] transition-all cursor-pointer"
              >
                {example.label}
              </button>
            ))}
          </div>
        </>
      )}

        {tab === "pdf" && (
          <div className="mt-5">
            {mode !== "account" ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-6 text-center">
                <FilePdf size={38} className="text-[var(--text-tertiary)]" />
                <span className="mt-3 font-extrabold text-[var(--text-primary)]">
                  Account required for PDF import
                </span>
                <span className="mt-1 max-w-md text-sm text-[var(--text-secondary)]">
                  Sign in with an account to securely upload PDFs to your private library and generate custom StudyPacks.
                </span>
              </div>
            ) : pdfDoc ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-800">
                      <FilePdf size={28} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-emerald-950">{pdfDoc.fileName}</h4>
                      <p className="text-xs text-emerald-800">
                        {pdfDoc.pageCount} pages · {pdfDoc.characterCount.toLocaleString()} characters extracted
                      </p>
                    </div>
                  </div>
                  <label className="cursor-pointer inline-flex items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                    Replace PDF
                    <input
                      type="file"
                      accept="application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePdfUpload(f);
                      }}
                    />
                  </label>
                </div>
                {pdfDoc.textPreview && (
                  <div className="mt-4 rounded-xl bg-white/80 p-3 text-xs text-[var(--text-secondary)] italic border border-emerald-100">
                    &ldquo;{pdfDoc.textPreview}&rdquo;
                  </div>
                )}
              </div>
            ) : (
              <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-6 text-center text-[var(--fetch-blue-900)] hover:bg-[var(--fetch-blue-100)]/50 transition-colors">
                <UploadSimple size={34} />
                <span className="mt-3 font-extrabold">
                  {uploadingPdf ? "Extracting PDF text..." : "Choose or drag a PDF document"}
                </span>
                <span className="mt-1 text-sm text-[var(--fetch-blue-800)]">
                  Up to 10 MiB, maximum 25 pages. Extracted privately into your account.
                </span>
                <input
                  disabled={uploadingPdf}
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
                  onChange={(event) => {
                    const f = event.target.files?.[0];
                    if (f) handlePdfUpload(f);
                  }}
                />
              </label>
            )}
          </div>
        )}

        {tab === "scan" && (
          <div className="mt-5">
            {mode !== "account" ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-6 text-center">
                <Camera size={38} className="text-[var(--text-tertiary)]" />
                <span className="mt-3 font-extrabold text-[var(--text-primary)]">
                  Account required for scanned notes
                </span>
                <span className="mt-1 max-w-md text-sm text-[var(--text-secondary)]">
                  Sign in with an account to upload or photograph your study notes and transcribe them with AI.
                </span>
              </div>
            ) : (
              <PaperScanIntake
                onExtractionReady={(docId, text) => {
                  setScanDocId(docId || null);
                  setScanText(text);
                }}
              />
            )}
          </div>
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

        {/* Output Artifact Selection */}
        <div className="mt-6 border-t border-[var(--border-subtle)] pt-5">
          <label className="block font-extrabold text-sm sm:text-base text-[var(--text-primary)]">
            Choose Output Artifact
          </label>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            Select the primary study output to generate from your source material.
          </p>

          <div
            role="radiogroup"
            aria-label="Output Artifact"
            className="mt-3 grid gap-3 sm:grid-cols-3"
          >
            {[
              {
                id: "quiz" as const,
                label: "Practice Quiz",
                badge: "Active",
                desc: "Multiple choice & fill-in-the-blank practice with immediate feedback.",
                icon: Sparkle,
                active: true,
              },
              {
                id: "flashcards" as const,
                label: "Flashcards",
                badge: "Active",
                desc: "Flip cards with typed recall, delayed retry & mastery tracking.",
                icon: NotePencil,
                active: true,
              },
              {
                id: "summary" as const,
                label: "Study Summary",
                badge: "Active",
                desc: "Structured summary with key concepts, definitions & relationships.",
                icon: FilePdf,
                active: true,
              },
            ].map(({ id, label, badge, desc, icon: Icon, active }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={outputKind === id}
                onClick={() => {
                  setOutputKind(id);
                  setWarning("");
                }}
                className={cn(
                  "flex flex-col text-left p-3.5 rounded-xl border transition-all cursor-pointer",
                  outputKind === id
                    ? "border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-50)] shadow-sm"
                    : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <Icon size={16} className={outputKind === id ? "text-[var(--fetch-blue-700)]" : "text-[var(--text-tertiary)]"} />
                    <span>{label}</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      active
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-[var(--surface-subtle)] text-[var(--text-tertiary)]"
                    )}
                  >
                    {badge}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--text-secondary)] leading-relaxed">
                  {desc}
                </p>
              </button>
            ))}
          </div>
        </div>

        {outputKind === "quiz" && (
          <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block font-extrabold">
              Questions to generate
              <input
                type="range"
                min="3"
                max="50"
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                className="mt-3 w-full accent-[var(--fetch-blue-600)]"
              />
              <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                Up to {count} questions (based on material coverage)
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
                "Processing..."
              ) : (
                <>
                  <Sparkle size={20} weight="fill" /> Generate Quiz
                </>
              )}
            </Button>
          </div>
        )}

        {outputKind === "flashcards" && (
          <div className="mt-5 space-y-4">
            <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block font-extrabold">
                Flashcards to generate
                <input
                  type="range"
                  min="3"
                  max="50"
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  className="mt-3 w-full accent-[var(--fetch-blue-600)]"
                />
                <span className="mt-1 block text-sm text-[var(--text-secondary)]">
                  Up to {count} flashcards (based on material coverage)
                </span>
              </label>
              <Button
                onClick={generate}
                disabled={isGenerateDisabled}
                className="sm:min-w-48"
              >
                {loading ? (
                  "Generating cards..."
                ) : (
                  <>
                    <Sparkle size={20} weight="fill" /> Generate Flashcards
                  </>
                )}
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3">
              <span className="text-xs text-[var(--text-secondary)]">
                Want to build your own deck without an uploaded source?
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsManualModalOpen(true)}
              >
                <NotePencil size={15} className="mr-1" /> Create Manual Deck
              </Button>
            </div>
          </div>
        )}

        {outputKind === "summary" && (
          <div className="mt-5 flex justify-end">
            <Button
              onClick={generate}
              disabled={isGenerateDisabled}
              className="sm:min-w-48"
            >
              {loading ? (
                "Analyzing and summarizing..."
              ) : (
                <>
                  <Sparkle size={20} weight="fill" /> Generate Summary
                </>
              )}
            </Button>
          </div>
        )}

        {/* Live Staged Generation Progress */}
        {loading && jobProgress && (
          <GenerationProgress
            jobId={jobProgress.jobId}
            artifactKind={outputKind}
            title={title.trim()}
            stage={jobProgress.stage}
            acceptedCount={jobProgress.acceptedCount}
            requestedCount={jobProgress.requestedCount}
            createdAt={jobProgress.createdAt}
            cancelRequested={jobProgress.cancelRequested}
            cancelling={cancelling}
            onCancel={cancelJob}
          />
        )}

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

      <CreateManualDeckModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
      />
    </section>
  );
}
