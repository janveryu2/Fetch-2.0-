"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash, X, NotePencil } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface CardEntry {
  front: string;
  back: string;
  aliases: string;
}

export function CreateManualDeckModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState("Custom Vocabulary");
  const [cards, setCards] = useState<CardEntry[]>([
    { front: "", back: "", aliases: "" },
    { front: "", back: "", aliases: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function handleAddCard() {
    setCards([...cards, { front: "", back: "", aliases: "" }]);
  }

  function handleRemoveCard(index: number) {
    if (cards.length <= 1) return;
    setCards(cards.filter((_, idx) => idx !== index));
  }

  function handleCardChange(index: number, field: keyof CardEntry, value: string) {
    const updated = [...cards];
    updated[index][field] = value;
    setCards(updated);
  }

  async function handleCreateDeck(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validCards = cards
      .filter((c) => c.front.trim() && c.back.trim())
      .map((c) => ({
        front: c.front.trim(),
        back: c.back.trim(),
        aliases: c.aliases
          ? c.aliases
              .split(",")
              .map((a) => a.trim())
              .filter(Boolean)
          : [],
      }));

    if (!title.trim()) {
      setError("Please provide a deck title.");
      return;
    }

    if (validCards.length === 0) {
      setError("Add at least one card with front and back text.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/flashcards/deck", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          cards: validCards,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to create deck.");
      }

      onClose();
      router.push(`/app/study-packs/${data.packId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deck.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-deck-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--surface-card)] p-6 shadow-2xl border border-[var(--border-subtle)]"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-4">
          <div className="flex items-center gap-2">
            <NotePencil size={22} className="text-[var(--fetch-blue-600)]" />
            <h2 id="create-deck-title" className="font-display text-xl font-bold">Create Manual Flashcard Deck</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreateDeck} className="mt-5 space-y-4">
          <div>
            <label htmlFor="deck-title-input" className="block text-xs font-bold text-[var(--text-secondary)]">Deck Title</label>
            <input
              id="deck-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Spanish Vocabulary, Med Terminology..."
              className="mt-1 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4 py-2.5 text-sm focus:border-[var(--fetch-blue-600)] focus:outline-none"
              required
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-[var(--text-secondary)]">
              Cards ({cards.length})
            </label>
            {cards.map((card, idx) => (
              <div
                key={idx}
                className="relative rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-xs font-bold text-[var(--fetch-blue-700)]">
                    Card {idx + 1}
                  </span>
                  {cards.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveCard(idx)}
                      className="text-red-500 hover:text-red-700 cursor-pointer"
                      title="Remove card"
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <input
                      type="text"
                      value={card.front}
                      onChange={(e) => handleCardChange(idx, "front", e.target.value)}
                      placeholder="Front (Prompt / Term)"
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs focus:border-[var(--fetch-blue-600)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={card.back}
                      onChange={(e) => handleCardChange(idx, "back", e.target.value)}
                      placeholder="Back (Answer / Definition)"
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs focus:border-[var(--fetch-blue-600)] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <input
                    type="text"
                    value={card.aliases}
                    onChange={(e) => handleCardChange(idx, "aliases", e.target.value)}
                    placeholder="Accepted aliases (optional, comma-separated)"
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-1.5 text-[11px] placeholder:text-[var(--text-tertiary)] focus:border-[var(--fetch-blue-600)] focus:outline-none"
                  />
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddCard}
              className="w-full mt-2"
            >
              <Plus size={16} className="mr-1" /> Add Card
            </Button>
          </div>

          {error && (
            <p className="text-xs font-bold text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Save Deck"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
