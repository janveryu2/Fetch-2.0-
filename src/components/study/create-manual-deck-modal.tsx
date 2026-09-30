"use client";

import { useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash,
  X,
  NotePencil,
  Stack,
  Lightbulb,
  FloppyDisk,
} from "@phosphor-icons/react";
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
  const openerRef = useRef<HTMLElement | null>(null);
  const [title, setTitle] = useState("Custom Vocabulary");
  const [cards, setCards] = useState<CardEntry[]>([
    { front: "", back: "", aliases: "" },
    { front: "", back: "", aliases: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAddCard() {
    setCards([...cards, { front: "", back: "", aliases: "" }]);
  }

  function handleRemoveCard(index: number) {
    if (cards.length <= 1) return;
    setCards(cards.filter((_, idx) => idx !== index));
  }

  function handleCardChange(
    index: number,
    field: keyof CardEntry,
    value: string,
  ) {
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
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="manual-deck-overlay" />
        <Dialog.Content
          className="manual-deck-dialog"
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            openerRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            document.getElementById("deck-title-input")?.focus();
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            openerRef.current?.focus();
          }}
        >
          <header className="manual-deck-header">
            <span className="manual-deck-header-icon">
              <NotePencil size={28} weight="bold" />
            </span>
            <div>
              <Dialog.Title className="font-display">
                Create Manual Flashcard Deck
              </Dialog.Title>
              <Dialog.Description>
                Add your own flashcards to create a custom study deck. Perfect
                for vocabulary, concepts, or anything you want to remember.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close dialog"
              disabled={loading}
              className="manual-deck-close"
            >
              <X size={20} />
            </Dialog.Close>
          </header>
          <form onSubmit={handleCreateDeck} aria-busy={loading}>
            <fieldset disabled={loading} className="manual-deck-fields">
              <div className="manual-deck-title-field">
                <label htmlFor="deck-title-input">
                  Deck title <span>*</span>
                </label>
                <input
                  id="deck-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={100}
                  placeholder="e.g. Spanish Vocabulary"
                  required
                  aria-describedby="deck-title-helper"
                />
                <div id="deck-title-helper" className="manual-deck-helper">
                  <span>
                    Give your deck a clear, descriptive name to keep your study
                    materials organized.
                  </span>
                  <span>{title.length}/100</span>
                </div>
              </div>
              <div className="manual-deck-cards-heading">
                <h3>
                  <Stack size={23} /> Cards ({cards.length})
                </h3>
                <p>
                  <Lightbulb size={17} /> Tip: Keep your prompts clear and
                  answers concise for better recall.
                </p>
              </div>
              <div className="manual-deck-card-list">
                {cards.map((card, idx) => (
                  <section
                    key={idx}
                    className="manual-deck-card"
                    aria-label={`Card ${idx + 1}`}
                  >
                    <div className="manual-deck-card-heading">
                      <h4>
                        <span>{idx + 1}</span> Card {idx + 1}
                      </h4>
                      <button
                        type="button"
                        disabled={cards.length <= 1}
                        onClick={() => handleRemoveCard(idx)}
                        aria-label={`Remove card ${idx + 1}`}
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                    <div className="manual-deck-card-sides">
                      <div>
                        <label htmlFor={`card-front-${idx}`}>
                          Front (Prompt / Term) <span>*</span>
                        </label>
                        <input
                          id={`card-front-${idx}`}
                          type="text"
                          value={card.front}
                          onChange={(e) =>
                            handleCardChange(idx, "front", e.target.value)
                          }
                          placeholder={
                            idx % 2
                              ? "e.g. Mitochondria"
                              : "e.g. Photosynthesis"
                          }
                        />
                      </div>
                      <div>
                        <label htmlFor={`card-back-${idx}`}>
                          Back (Answer / Definition) <span>*</span>
                        </label>
                        <input
                          id={`card-back-${idx}`}
                          type="text"
                          value={card.back}
                          onChange={(e) =>
                            handleCardChange(idx, "back", e.target.value)
                          }
                          placeholder={
                            idx % 2
                              ? "e.g. Organelle responsible for cellular energy…"
                              : "e.g. Process by which plants convert light…"
                          }
                        />
                      </div>
                    </div>
                    <div className="manual-deck-aliases">
                      <label htmlFor={`card-aliases-${idx}`}>
                        Accepted aliases (optional, comma-separated)
                      </label>
                      <input
                        id={`card-aliases-${idx}`}
                        type="text"
                        value={card.aliases}
                        onChange={(e) =>
                          handleCardChange(idx, "aliases", e.target.value)
                        }
                        placeholder={
                          idx % 2
                            ? "e.g. powerhouse of the cell, mitochondrion"
                            : "e.g. photosynthesis, photo-synthesis, plant energy process"
                        }
                      />
                    </div>
                  </section>
                ))}
              </div>
              <button
                className="manual-deck-add"
                type="button"
                onClick={handleAddCard}
              >
                <strong>
                  <Plus size={20} weight="bold" /> Add Card
                </strong>
                <span>Add another flashcard to this deck</span>
              </button>
            </fieldset>
            {error && (
              <p className="manual-deck-error" role="alert">
                {error}
              </p>
            )}
            <footer className="manual-deck-footer">
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                <FloppyDisk size={19} weight="bold" />
                {loading ? "Creating…" : "Save Deck"}
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
