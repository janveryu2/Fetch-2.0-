import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  normalizeTextForGrounding,
  verifySourceGrounding,
  validateAndTransformQuestions,
  GeminiStudyPackProvider,
} from "@/lib/ai/gemini-study-pack";

describe("Gemini StudyPack Grounding & Normalization", () => {
  it("normalizes unicode whitespace, curly quotes, and dashes", () => {
    const input = "“Hello\u00A0world”\u200B — this\u2000is ‘grounded’–text.";
    const normalized = normalizeTextForGrounding(input);
    expect(normalized).toBe('"Hello world" - this is \'grounded\'-text.');
  });

  it("verifies verbatim source grounding accurately", () => {
    const source =
      "Mitochondria are membrane-bound cell organelles that generate most of the chemical energy needed to power the cell's biochemical reactions.";

    // Exact match
    expect(
      verifySourceGrounding(
        source,
        "generate most of the chemical energy needed to power the cell's biochemical reactions"
      )
    ).toBe(true);

    // Matching with punctuation / quotes variation
    expect(
      verifySourceGrounding(
        source,
        "‘generate most of the chemical energy’"
      )
    ).toBe(true);

    // Non-existent quote
    expect(
      verifySourceGrounding(source, "generate chlorophyll for plant photosynthesis")
    ).toBe(false);

    // Empty or too short quote
    expect(verifySourceGrounding(source, "cell")).toBe(false);
    expect(verifySourceGrounding(source, "")).toBe(false);
  });

  it("validates and transforms questions correctly", () => {
    const source =
      "Photosynthesis takes place in chloroplasts. Chlorophyll absorbs sunlight and turns it into chemical energy.";

    const rawQuestions = [
      {
        type: "multiple_choice",
        prompt: "Where does photosynthesis occur in plant cells?",
        answer: "Chloroplasts",
        choices: ["Chloroplasts", "Mitochondria", "Nucleus", "Ribosomes"],
        explanation: "The reaction occurs inside chloroplasts.",
        sourceQuote: "Photosynthesis takes place in chloroplasts.",
      },
      {
        type: "fill_blank",
        prompt: "Chlorophyll absorbs ____ and turns it into chemical energy.",
        answer: "sunlight",
        choices: [],
        explanation: "Chlorophyll captures solar energy.",
        sourceQuote: "Chlorophyll absorbs sunlight and turns it into chemical energy.",
      },
    ];

    const validated = validateAndTransformQuestions(rawQuestions, source, 2);
    expect(validated).toHaveLength(2);
    expect(validated[0].type).toBe("multiple_choice");
    expect(validated[0].choices).toEqual([
      "Chloroplasts",
      "Mitochondria",
      "Nucleus",
      "Ribosomes",
    ]);
    expect(validated[0].explanation).toContain(
      "Source: “Photosynthesis takes place in chloroplasts.”"
    );
    expect(validated[1].type).toBe("fill_blank");
    expect(validated[1].choices).toBeUndefined();
  });

  it("rejects questions when question count does not match expected count", () => {
    const source = "Sample text of sufficient length.";
    expect(() => validateAndTransformQuestions([], source, 3)).toThrow(
      "The AI provider returned 0 questions, expected exactly 3."
    );
  });

  it("rejects duplicate question prompts", () => {
    const source = "Photosynthesis occurs in chloroplasts. Sunlight is absorbed by chlorophyll.";
    const rawQuestions = [
      {
        type: "fill_blank",
        prompt: "What is absorbed?",
        answer: "Sunlight",
        choices: [],
        explanation: "Sunlight.",
        sourceQuote: "Sunlight is absorbed by chlorophyll.",
      },
      {
        type: "multiple_choice",
        prompt: "what is absorbed?",
        answer: "Sunlight",
        choices: ["Sunlight", "Water", "Oxygen", "Sugar"],
        explanation: "Sunlight.",
        sourceQuote: "Sunlight is absorbed by chlorophyll.",
      },
    ];
    expect(() => validateAndTransformQuestions(rawQuestions, source, 2)).toThrow(
      "Duplicate question prompt detected"
    );
  });

  it("rejects multiple choice questions with fewer than 4 choices or non-unique choices", () => {
    const source = "Photosynthesis occurs in chloroplasts.";
    const invalidChoices = [
      {
        type: "multiple_choice",
        prompt: "Where does it occur?",
        answer: "Chloroplasts",
        choices: ["Chloroplasts", "Mitochondria", "Nucleus"],
        explanation: "Chloroplasts.",
        sourceQuote: "Photosynthesis occurs in chloroplasts.",
      },
    ];
    expect(() => validateAndTransformQuestions(invalidChoices, source, 1)).toThrow(
      "must have exactly 4 choices"
    );

    const duplicateChoices = [
      {
        type: "multiple_choice",
        prompt: "Where does it occur?",
        answer: "Chloroplasts",
        choices: ["Chloroplasts", "Chloroplasts", "Nucleus", "Ribosomes"],
        explanation: "Chloroplasts.",
        sourceQuote: "Photosynthesis occurs in chloroplasts.",
      },
    ];
    expect(() => validateAndTransformQuestions(duplicateChoices, source, 1)).toThrow(
      "choices must all be unique"
    );
  });

  it("rejects multiple choice questions where answer is not among the choices", () => {
    const source = "Photosynthesis occurs in chloroplasts.";
    const missingAnswer = [
      {
        type: "multiple_choice",
        prompt: "Where does it occur?",
        answer: "Chloroplasts",
        choices: ["Vacuole", "Mitochondria", "Nucleus", "Ribosomes"],
        explanation: "Chloroplasts.",
        sourceQuote: "Photosynthesis occurs in chloroplasts.",
      },
    ];
    expect(() => validateAndTransformQuestions(missingAnswer, source, 1)).toThrow(
      'answer "Chloroplasts" is not in the choices list'
    );
  });

  it("rejects questions with ungrounded source quotes", () => {
    const source = "Photosynthesis occurs in chloroplasts.";
    const ungrounded = [
      {
        type: "fill_blank",
        prompt: "Where does cellular respiration occur?",
        answer: "Mitochondria",
        choices: [],
        explanation: "Mitochondria.",
        sourceQuote: "Cellular respiration occurs in mitochondria.",
      },
    ];
    expect(() => validateAndTransformQuestions(ungrounded, source, 1)).toThrow(
      "Source grounding verification failed"
    );
  });
});

describe("GeminiStudyPackProvider API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws if GEMINI_API_KEY is not configured", async () => {
    const provider = new GeminiStudyPackProvider({ apiKey: "" });
    await expect(
      provider.generate({ title: "Bio", source: "Some content here...", count: 3 })
    ).rejects.toThrow("GEMINI_API_KEY is not configured.");
  });

  it("calls Gemini endpoint with structured schema and parses valid questions", async () => {
    const source = "Mitochondria are the powerhouse of the cell, generating adenosine triphosphate.";
    const mockApiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  questions: [
                    {
                      type: "multiple_choice",
                      prompt: "What organelle produces adenosine triphosphate?",
                      answer: "Mitochondria",
                      choices: ["Mitochondria", "Nucleus", "Ribosome", "Golgi"],
                      explanation: "They produce ATP.",
                      sourceQuote: "generating adenosine triphosphate.",
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiStudyPackProvider({ apiKey: "test-gemini-key" });
    const result = await provider.generate({
      title: "Cell Biology",
      source,
      count: 1,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].answer).toBe("Mitochondria");
    expect(result[0].prompt).toBe("What organelle produces adenosine triphosphate?");
  });
});
