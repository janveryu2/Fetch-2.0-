import { describe, it, expect } from "vitest";
import {
  normalizeFlashcardAnswer,
  gradeFlashcardAnswer,
} from "@/lib/study/flashcard-grading";
import {
  initializeFlashcardSession,
  processCardAttempt,
  type FlashcardItem,
} from "@/lib/study/flashcard-queue";

describe("Phase 4: Flashcards & Study Mastery", () => {
  describe("1. Flashcard Normalization Algorithm", () => {
    it("normalizes unicode NFKC, case folding, and whitespace", () => {
      const input = "   Café   \t\n  Au   Lait  ";
      expect(normalizeFlashcardAnswer(input)).toBe("café au lait");
    });

    it("strips conservative edge punctuation while preserving internal punctuation", () => {
      expect(normalizeFlashcardAnswer('"Photosynthesis."')).toBe("photosynthesis");
      expect(normalizeFlashcardAnswer("What is ATP???")).toBe("what is atp");
      expect(normalizeFlashcardAnswer("O(n log n)")).toBe("o(n log n)");
      expect(normalizeFlashcardAnswer("9.8 m/s^2")).toBe("9.8 m/s^2");
      expect(normalizeFlashcardAnswer("pH 7.4")).toBe("ph 7.4");
    });

    it("handles smart quotes, em-dashes, and special spaces", () => {
      expect(normalizeFlashcardAnswer("“chlorophyll”")).toBe("chlorophyll");
      expect(normalizeFlashcardAnswer("Alpha—Beta")).toBe("alpha-beta");
    });
  });

  describe("2. Deterministic Flashcard Grading with Aliases", () => {
    const canonical = "Mitochondria";
    const aliases = ["Mitochondrion", "Powerhouse of the cell"];

    it("accepts canonical answer with case and edge punctuation tolerance", () => {
      const res = gradeFlashcardAnswer("  mitochondria! ", canonical, aliases);
      expect(res.isCorrect).toBe(true);
      expect(res.matchedAnswer).toBe(canonical);
    });

    it("accepts authorized aliases", () => {
      const res1 = gradeFlashcardAnswer("mitochondrion", canonical, aliases);
      expect(res1.isCorrect).toBe(true);
      expect(res1.matchedAnswer).toBe("Mitochondrion");

      const res2 = gradeFlashcardAnswer("powerhouse of the cell", canonical, aliases);
      expect(res2.isCorrect).toBe(true);
      expect(res2.matchedAnswer).toBe("Powerhouse of the cell");
    });

    it("rejects wrong answers or unlisted synonyms", () => {
      const res = gradeFlashcardAnswer("Chloroplast", canonical, aliases);
      expect(res.isCorrect).toBe(false);
    });

    it("rejects empty submission", () => {
      const res = gradeFlashcardAnswer("   ", canonical, aliases);
      expect(res.isCorrect).toBe(false);
    });
  });

  describe("3. Flashcard Study Queue & Mastery Lifecycle", () => {
    const mockCards: FlashcardItem[] = [
      { id: "c1", front: "Front 1", back: "Back 1", aliases: [], position: 0 },
      { id: "c2", front: "Front 2", back: "Back 2", aliases: [], position: 1 },
      { id: "c3", front: "Front 3", back: "Back 3", aliases: [], position: 2 },
      { id: "c4", front: "Front 4", back: "Back 4", aliases: [], position: 3 },
    ];

    it("initializes session queue matching cards order", () => {
      const session = initializeFlashcardSession("s1", mockCards);
      expect(session.queue).toEqual(["c1", "c2", "c3", "c4"]);
      expect(session.status).toBe("active");
      expect(session.firstTryCorrectCount).toBe(0);
      expect(session.masteredCount).toBe(0);
    });

    it("removes correctly answered card and records first-try accuracy", () => {
      const session = initializeFlashcardSession("s1", mockCards);
      const res = processCardAttempt(session, mockCards[0], "Back 1");

      expect(res.grade.isCorrect).toBe(true);
      expect(res.isFirstTry).toBe(true);
      expect(res.nextState.firstTryCorrectCount).toBe(1);
      expect(res.nextState.masteredCount).toBe(1);
      // Card 1 removed from queue
      expect(res.nextState.queue).toEqual(["c2", "c3", "c4"]);
      expect(res.nextState.status).toBe("active");
    });

    it("requeues missed card behind min(3, remaining) cards", () => {
      const session = initializeFlashcardSession("s1", mockCards);
      // c1 is head, remaining queue without c1 is [c2, c3, c4] (length 3).
      // min(3, 3) = 3, so c1 gets inserted at index 3: [c2, c3, c4, c1]
      const res = processCardAttempt(session, mockCards[0], "Wrong answer");

      expect(res.grade.isCorrect).toBe(false);
      expect(res.nextState.firstTryCorrectCount).toBe(0);
      expect(res.nextState.masteredCount).toBe(0);
      expect(res.nextState.queue).toEqual(["c2", "c3", "c4", "c1"]);
      expect(res.requeuedAt).toBe(3);
    });

    it("distinguishes first-try accuracy from eventual mastery", () => {
      let state = initializeFlashcardSession("s1", [mockCards[0], mockCards[1]]);

      // Attempt 1 on Card 1: WRONG
      const r1 = processCardAttempt(state, mockCards[0], "wrong");
      state = r1.nextState;
      expect(state.firstTryCorrectCount).toBe(0);
      expect(state.masteredCount).toBe(0);

      // Attempt 1 on Card 2: CORRECT (first try)
      const r2 = processCardAttempt(state, mockCards[1], "Back 2");
      state = r2.nextState;
      expect(state.firstTryCorrectCount).toBe(1);
      expect(state.masteredCount).toBe(1);

      // Card 1 returns! Attempt 2 on Card 1: CORRECT (second try)
      const r3 = processCardAttempt(state, mockCards[0], "Back 1");
      state = r3.nextState;

      // Eventual mastery: all 2 cards are mastered, but first-try accuracy was only 1 of 2 (50%)
      expect(state.masteredCount).toBe(2);
      expect(state.firstTryCorrectCount).toBe(1);
      expect(state.status).toBe("mastered");
      expect(state.queue.length).toBe(0);
    });

    it("flags card when 3 misses are reached", () => {
      let state = initializeFlashcardSession("s1", [mockCards[0]]);

      const r1 = processCardAttempt(state, mockCards[0], "bad 1");
      state = r1.nextState;
      expect(r1.threeMissesReached).toBe(false);

      const r2 = processCardAttempt(state, mockCards[0], "bad 2");
      state = r2.nextState;
      expect(r2.threeMissesReached).toBe(false);

      const r3 = processCardAttempt(state, mockCards[0], "bad 3");
      state = r3.nextState;
      expect(r3.threeMissesReached).toBe(true);
      expect(state.cardStats["c1"].misses).toBe(3);
    });

    it("handles one-card deck correctly without breaking queue", () => {
      let state = initializeFlashcardSession("s1", [mockCards[0]]);
      const r1 = processCardAttempt(state, mockCards[0], "wrong");
      state = r1.nextState;

      expect(state.queue).toEqual(["c1"]);
      expect(state.status).toBe("active");

      const r2 = processCardAttempt(state, mockCards[0], "Back 1");
      state = r2.nextState;

      expect(state.queue).toEqual([]);
      expect(state.status).toBe("mastered");
      expect(state.firstTryCorrectCount).toBe(0);
      expect(state.masteredCount).toBe(1);
    });
  });
});
