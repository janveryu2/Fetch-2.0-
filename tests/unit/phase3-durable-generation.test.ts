import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  verifySourceGrounding,
  isQuestionDuplicate,
} from "@/lib/ai/gemini-study-pack";
import {
  planBatches,
  chunkSourceText,
  createFixtureBatchQuestions,
  createFixtureSummary,
  structuredSummarySchema,
} from "@/lib/ai/durable-generation";

describe("Phase 3: Durable Large Generation & Review Content", () => {
  const sampleSource = `
Photosynthesis is the biological process used by plants, algae, and certain bacteria to convert light energy into chemical energy.
This chemical energy is stored in carbohydrate molecules, such as sugars and starches, which are synthesized from carbon dioxide and water.
The overall chemical equation for oxygenic photosynthesis is 6CO2 + 6H2O + light energy -> C6H12O6 + 6O2.
In plants and algae, photosynthesis takes place in specialized organelles called chloroplasts.
Chloroplasts contain a green pigment called chlorophyll, which absorbs light energy primarily from the blue and red portions of the electromagnetic spectrum while reflecting green light.
The light-dependent reactions take place on the thylakoid membranes inside the chloroplast, producing ATP and NADPH.
The light-independent reactions, commonly known as the Calvin cycle, take place in the stroma of the chloroplast, utilizing ATP and NADPH to fix carbon dioxide into three-carbon sugars.
  `.trim();

  describe("1. Strict Full-Span Grounding Verification", () => {
    it("accepts verbatim quotes from the source", () => {
      const quote = "photosynthesis takes place in specialized organelles called chloroplasts";
      expect(verifySourceGrounding(sampleSource, quote)).toBe(true);
    });

    it("accepts quotes with normalized punctuation and ellipsis", () => {
      const quote = "Photosynthesis is the biological process... to convert light energy into chemical energy";
      expect(verifySourceGrounding(sampleSource, quote)).toBe(true);
    });

    it("accepts quotes spanning line breaks and whitespace differences", () => {
      const quote = "which absorbs light energy primarily from the blue and red portions";
      expect(verifySourceGrounding(sampleSource, quote)).toBe(true);
    });

    it("REJECTS hallucinated / invented quote suffixes (strict full-span rule)", () => {
      // Starts with 25+ real chars from source, but continues with invented text:
      // In the legacy code, any prefix match >= 20 chars passed! Now full-span match rejects this.
      const quoteWithInventedSuffix =
        "Photosynthesis is the biological process used by plants, and it was discovered by Albert Einstein in 1999.";
      expect(verifySourceGrounding(sampleSource, quoteWithInventedSuffix)).toBe(false);
    });

    it("rejects quotes completely absent from the source", () => {
      const fakeQuote = "Mitochondria are the powerhouse of the mammalian cell";
      expect(verifySourceGrounding(sampleSource, fakeQuote)).toBe(false);
    });
  });

  describe("2. Cross-Batch Semantic Deduplication", () => {
    it("detects identical prompts as duplicates", () => {
      const existing = [
        {
          prompt: "Where does photosynthesis take place in plants?",
          answer: "Chloroplasts",
        },
      ];
      const candidate = {
        prompt: "where does photosynthesis take place in plants?",
        answer: "Chloroplasts",
      };

      expect(isQuestionDuplicate(candidate, existing)).toBe(true);
    });

    it("detects same answer with high prompt containment/overlap as duplicate", () => {
      const existing = [
        {
          prompt: "Which green pigment absorbs light in chloroplasts?",
          answer: "Chlorophyll",
        },
      ];
      const candidate = {
        prompt: "What is the green pigment in chloroplasts that absorbs light?",
        answer: "Chlorophyll",
      };

      expect(isQuestionDuplicate(candidate, existing)).toBe(true);
    });

    it("allows distinct questions on different topics or with different answers", () => {
      const existing = [
        {
          prompt: "Which green pigment absorbs light in chloroplasts?",
          answer: "Chlorophyll",
        },
      ];
      const candidate = {
        prompt: "What are the specialized organelles where photosynthesis takes place?",
        answer: "Chloroplasts",
      };

      expect(isQuestionDuplicate(candidate, existing)).toBe(false);
    });
  });

  describe("3. Batched Question Planning for up to 50 Questions", () => {
    it("plans exactly 5 batches of at most 10 questions for a 50-question request", () => {
      const plans = planBatches(50, sampleSource);
      expect(plans.length).toBe(5);
      const totalQuestions = plans.reduce((acc, p) => acc + p.allocatedCount, 0);
      expect(totalQuestions).toBe(50);
      for (const plan of plans) {
        expect(plan.allocatedCount).toBeLessThanOrEqual(10);
        expect(plan.allocatedCount).toBeGreaterThan(0);
        expect(plan.sourceChunk).toBeTruthy();
      }
    });

    it("plans bounded batches for small requests (e.g. 15 questions)", () => {
      const plans = planBatches(15, sampleSource);
      expect(plans.length).toBe(2);
      const totalQuestions = plans.reduce((acc, p) => acc + p.allocatedCount, 0);
      expect(totalQuestions).toBe(15);
      expect(plans[0].allocatedCount).toBe(8);
      expect(plans[1].allocatedCount).toBe(7);
    });

    it("chunks text into coherent sections without losing paragraphs", () => {
      const chunks = chunkSourceText(sampleSource, 3);
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks.length).toBeLessThanOrEqual(3);
    });

    it("generates deterministic fixture questions that pass strict grounding", () => {
      const questions = createFixtureBatchQuestions(sampleSource, 8, 0);
      expect(questions.length).toBe(8);
      for (const q of questions) {
        expect(q.prompt).toBeTruthy();
        expect(q.answer).toBeTruthy();
        expect(verifySourceGrounding(sampleSource, q.sourceQuote)).toBe(true);
      }
    });
  });

  describe("4. Structured Study Summary", () => {
    it("creates a well-formed structured summary matching schema", () => {
      const summary = createFixtureSummary("Photosynthesis Overview", sampleSource);
      const validation = structuredSummarySchema.safeParse(summary);

      expect(validation.success).toBe(true);
      if (validation.success) {
        expect(validation.data.overview.length).toBeGreaterThan(10);
        expect(validation.data.keyConcepts.length).toBeGreaterThanOrEqual(1);
        expect(validation.data.remember.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("enforces required fields in structured summary schema", () => {
      const invalid = {
        overview: "Too short",
        keyConcepts: [],
      };
      const validation = structuredSummarySchema.safeParse(invalid);
      expect(validation.success).toBe(false);
    });
  });
});
