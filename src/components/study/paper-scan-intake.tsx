"use client";

import { useState, useRef } from "react";
import {
  Camera,
  UploadSimple,
  Trash,
  ArrowUp,
  ArrowDown,
  Sparkle,
  WarningCircle,
  CheckCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

export interface ScanPageItem {
  id: string;
  file?: File;
  previewUrl: string;
  position: number;
  extractedText?: string;
  qualityFlag?: "ok" | "blurry" | "low_contrast" | "rotated" | "unreadable";
}

interface PaperScanIntakeProps {
  onExtractionReady: (docId: string, reviewedText: string) => void;
  disabled?: boolean;
}

export function PaperScanIntake({ onExtractionReady, disabled = false }: PaperScanIntakeProps) {
  const [pages, setPages] = useState<ScanPageItem[]>([]);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [reviewedText, setReviewedText] = useState("");
  const [error, setError] = useState("");
  const [qualityWarning, setQualityWarning] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;
    setError("");
    setQualityWarning("");

    const newFiles = Array.from(selectedFiles);
    if (pages.length + newFiles.length > 5) {
      setError("You can upload at most 5 scan pages per document.");
      return;
    }

    // Check mime types and sizes
    for (const f of newFiles) {
      const lowerName = f.name.toLowerCase();
      if (
        f.type === "image/heic" ||
        f.type === "image/heif" ||
        lowerName.endsWith(".heic") ||
        lowerName.endsWith(".heif")
      ) {
        setError(
          "HEIC images are not currently supported. Please take or convert photos in JPEG or PNG format."
        );
        return;
      }
      if (f.type !== "image/jpeg" && f.type !== "image/png") {
        setError("Only JPEG and PNG images are supported.");
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        setError(`File "${f.name}" exceeds the 5 MiB per page limit.`);
        return;
      }
    }

    setUploading(true);

    try {
      let currentDocId = documentId;
      const updatedPages = [...pages];

      for (const file of newFiles) {
        const position = updatedPages.length;
        const formData = new FormData();
        formData.append("file", file);
        if (currentDocId) {
          formData.append("documentId", currentDocId);
        }
        formData.append("position", position.toString());

        const res = await fetch("/api/scan/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Failed to upload scan page.");
        }

        const data = await res.json();
        currentDocId = data.documentId;
        setDocumentId(currentDocId);

        const previewUrl = URL.createObjectURL(file);
        updatedPages.push({
          id: data.pageId || crypto.randomUUID(),
          file,
          previewUrl,
          position,
          qualityFlag: "ok",
        });
      }

      setPages(updatedPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error uploading scan pages.");
    } finally {
      setUploading(false);
    }
  };

  const removePage = async (index: number) => {
    const updated = pages.filter((_, i) => i !== index).map((p, i) => ({ ...p, position: i }));
    setPages(updated);
    if (updated.length === 0) {
      setReviewedText("");
      setDocumentId(null);
    }
  };

  const movePage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= pages.length) return;
    const reordered = [...pages];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const updated = reordered.map((p, i) => ({ ...p, position: i }));
    setPages(updated);

    if (documentId) {
      // Sync reordering with backend
      fetch("/api/scan/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          pageOrder: updated.map((p) => p.id),
        }),
      }).catch((e) => console.error("Error syncing page order:", e));
    }
  };

  const handleExtractText = async () => {
    if (!documentId || pages.length === 0) return;
    setExtracting(true);
    setError("");
    setQualityWarning("");

    try {
      const res = await fetch("/api/scan/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Extraction failed. Please retry.");
      }

      const data = await res.json();
      setReviewedText(data.combinedText || "");

      // Update pages quality flags
      if (Array.isArray(data.pages)) {
        setPages((prev) =>
          prev.map((p) => {
            const match = data.pages.find((dp: { id: string }) => dp.id === p.id);
            return match
              ? {
                  ...p,
                  extractedText: match.extractedText,
                  qualityFlag: match.qualityFlag,
                }
              : p;
          })
        );

        const hasWarning = data.pages.some(
          (p: { qualityFlag: string }) =>
            p.qualityFlag === "blurry" ||
            p.qualityFlag === "low_contrast" ||
            p.qualityFlag === "unreadable"
        );
        if (hasWarning) {
          setQualityWarning(
            "Some pages had blurry or low-contrast text. Please review and edit the transcription below before generating."
          );
        }
      }

      onExtractionReady(documentId, data.combinedText || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error extracting text from scans.");
    } finally {
      setExtracting(false);
    }
  };

  const handleTextChange = async (newText: string) => {
    setReviewedText(newText);
    if (documentId) {
      onExtractionReady(documentId, newText);
      // Persist edited text
      fetch(`/api/scan/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ combinedText: newText }),
      }).catch((e) => console.error("Auto-save scan error:", e));
    }
  };

  const handleDiscard = async () => {
    if (documentId) {
      fetch(`/api/scan/documents/${documentId}`, { method: "DELETE" }).catch(() => {});
    }
    setPages([]);
    setDocumentId(null);
    setReviewedText("");
    setError("");
    setQualityWarning("");
    onExtractionReady("", "");
  };

  return (
    <div className="space-y-6">
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelection(e.target.files)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelection(e.target.files)}
      />

      {/* Upload/Camera buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || uploading || extracting || pages.length >= 5}
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center gap-2"
        >
          <Camera className="h-4 w-4" />
          Take photo
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || uploading || extracting || pages.length >= 5}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2"
        >
          <UploadSimple className="h-4 w-4" />
          Upload scan images
        </Button>
        <span className="text-xs text-[var(--text-secondary)]">
          {pages.length} of 5 pages (JPEG/PNG, max 5 MiB per page)
        </span>
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700"
        >
          <WarningCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {qualityWarning && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800"
        >
          <WarningCircle className="h-5 w-5 shrink-0" />
          <span>{qualityWarning}</span>
        </div>
      )}

      {/* Pages Preview Strip */}
      {pages.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--text-primary)]">
              Scanned Pages ({pages.length})
            </h4>
            <Button
              type="button"
              variant="quiet"
              size="sm"
              onClick={handleDiscard}
              className="text-xs text-red-600 hover:text-red-700"
            >
              Discard all
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {pages.map((p, idx) => (
              <div
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] shadow-xs"
              >
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt={`Page ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute top-2 left-2 rounded-md bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white">
                    Page {idx + 1}
                  </span>
                  {p.qualityFlag && p.qualityFlag !== "ok" && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-amber-600/90 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase">
                      {p.qualityFlag}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-[var(--border-subtle)] p-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => movePage(idx, idx - 1)}
                      className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30"
                      title="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === pages.length - 1}
                      onClick={() => movePage(idx, idx + 1)}
                      className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] disabled:opacity-30"
                      title="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePage(idx)}
                    className="rounded p-1 text-red-500 hover:bg-red-50 hover:text-red-700"
                    title="Remove page"
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Extract button */}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              variant="primary"
              disabled={extracting || uploading}
              onClick={handleExtractText}
              className="flex items-center gap-2"
            >
              <Sparkle className="h-4 w-4" />
              {extracting ? "Extracting notes..." : "Extract text with AI"}
            </Button>
          </div>
        </div>
      )}

      {/* Extracted & Editable Text Area */}
      {reviewedText.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-[var(--fetch-blue-200)] bg-[var(--fetch-blue-50)]/30 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Review & Edit Extracted Notes
              </h4>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              {reviewedText.trim().length} characters
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            You can correct typos, clarify formulas, or add missing notes. Generation will use this exact text.
          </p>
          <textarea
            value={reviewedText}
            onChange={(e) => handleTextChange(e.target.value)}
            rows={8}
            className="w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-canvas)] p-3 text-sm font-mono text-[var(--text-primary)] shadow-xs focus:border-[var(--fetch-blue-600)] focus:ring-1 focus:ring-[var(--fetch-blue-600)] focus:outline-none"
            placeholder="Review and edit the extracted notes here..."
          />
        </div>
      )}
    </div>
  );
}
