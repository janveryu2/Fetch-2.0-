import { z } from "zod";

export interface StudyPackGeneratorInput {
  title: string;
  source: string;
  count: number;
}

export interface GeneratedQuestion {
  id: string;
  type: "multiple_choice" | "fill_blank";
  prompt: string;
  answer: string;
  choices?: string[];
  explanation: string;
  sourceQuote: string;
}

export interface StudyPackGenerator {
  generate(input: StudyPackGeneratorInput): Promise<GeneratedQuestion[]>;
}

export const rawGeneratedPackSchema = z.object({
  questions: z.array(
    z.object({
      type: z.enum(["multiple_choice", "fill_blank"]),
      prompt: z.string().min(1),
      answer: z.string().min(1),
      choices: z.array(z.string()).default([]),
      explanation: z.string().default(""),
      sourceQuote: z.string().min(1),
    })
  ),
});

export function normalizeTextForGrounding(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛`]/g, "'")
    .replace(/[—–−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function verifySourceGrounding(source: string, quote: string): boolean {
  if (!quote || quote.trim().length < 5) return false;
  const normSource = normalizeTextForGrounding(source).toLowerCase();
  let normQuote = normalizeTextForGrounding(quote).toLowerCase();
  // Strip surrounding quotes that LLMs frequently wrap around citations
  normQuote = normQuote.replace(/^["']+|["']+$/g, "").trim();
  if (normQuote.length < 5) return false;
  return normSource.includes(normQuote);
}

export function validateAndTransformQuestions(
  rawQuestions: unknown[],
  source: string,
  expectedCount: number
): GeneratedQuestion[] {
  if (!Array.isArray(rawQuestions) || rawQuestions.length !== expectedCount) {
    throw new Error(
      `The AI provider returned ${rawQuestions?.length ?? 0} questions, expected exactly ${expectedCount}.`
    );
  }

  const seenPrompts = new Set<string>();
  const questions: GeneratedQuestion[] = [];

  for (let i = 0; i < rawQuestions.length; i++) {
    const raw = rawQuestions[i] as Record<string, unknown>;
    if (!raw || typeof raw !== "object") {
      throw new Error(`Invalid question object at index ${i}`);
    }

    const type = raw.type;
    if (type !== "multiple_choice" && type !== "fill_blank") {
      throw new Error(`Invalid question type "${String(type)}" at index ${i}`);
    }

    const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
    if (!prompt) {
      throw new Error(`Question prompt at index ${i} is empty.`);
    }

    const normalizedPrompt = prompt.toLowerCase();
    if (seenPrompts.has(normalizedPrompt)) {
      throw new Error(`Duplicate question prompt detected: "${prompt}"`);
    }
    seenPrompts.add(normalizedPrompt);

    const answer = typeof raw.answer === "string" ? raw.answer.trim() : "";
    if (!answer) {
      throw new Error(`Question answer at index ${i} is empty.`);
    }

    const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
    const sourceQuote = typeof raw.sourceQuote === "string" ? raw.sourceQuote.trim() : "";

    if (!verifySourceGrounding(source, sourceQuote)) {
      throw new Error(
        `Source grounding verification failed for question ${i + 1}: quote "${sourceQuote}" is not verbatim in source.`
      );
    }

    let choices: string[] | undefined = undefined;
    if (type === "multiple_choice") {
      const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
      if (rawChoices.length !== 4) {
        throw new Error(`Multiple choice question ${i + 1} must have exactly 4 choices.`);
      }
      const trimmedChoices = rawChoices.map((c) => (typeof c === "string" ? c.trim() : ""));
      const uniqueChoices = new Set(trimmedChoices.map((c) => c.toLowerCase()));
      if (uniqueChoices.size !== 4) {
        throw new Error(`Multiple choice question ${i + 1} choices must all be unique.`);
      }
      if (!trimmedChoices.some((c) => c.toLowerCase() === answer.toLowerCase())) {
        throw new Error(
          `Multiple choice question ${i + 1} answer "${answer}" is not in the choices list.`
        );
      }
      choices = trimmedChoices;
    }

    questions.push({
      id: crypto.randomUUID(),
      type,
      prompt,
      answer,
      choices,
      explanation: explanation
        ? `${explanation} Source: “${sourceQuote}”`
        : `Source: “${sourceQuote}”`,
      sourceQuote,
    });
  }

  return questions;
}

export class GeminiStudyPackProvider implements StudyPackGenerator {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;

  constructor(options?: { apiKey?: string; model?: string; timeoutMs?: number }) {
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY || "";
    this.model = options?.model || process.env.GEMINI_STUDYPACK_MODEL || "gemini-3.7-flash";
    this.timeoutMs = options?.timeoutMs ?? 45_000;
  }

  async generate(input: StudyPackGeneratorInput): Promise<GeneratedQuestion[]> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const systemPrompt = `You create accurate, high-quality study questions using ONLY the supplied source text.
Create exactly ${input.count} varied questions (a mix of multiple_choice and fill_blank).
Every single question must have:
1. "prompt": clear and unambiguous question text.
2. "answer": the correct answer.
3. "choices": for multiple_choice, exactly 4 unique options including the exact answer; for fill_blank, an empty array.
4. "explanation": a concise explanation of why the answer is correct.
5. "sourceQuote": a verbatim, exact quote from the source material that proves the answer.

CRITICAL RULES:
- The "sourceQuote" MUST be an exact, word-for-word excerpt from the source text.
- Never invent quotes or hallucinate facts not in the source text.
- Do not duplicate question prompts.`;

    const userPrompt = `SOURCE TITLE: ${input.title}\n\nSOURCE MATERIAL:\n---\n${input.source}\n---`;

    // Attempt generation with up to one bounded repair/retry if grounding fails
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rawJson = await this.callGeminiApi(systemPrompt, userPrompt, attempt > 0);
        const parsed = rawGeneratedPackSchema.parse(rawJson);
        return validateAndTransformQuestions(parsed.questions, input.source, input.count);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // If it's a network/config error, do not retry
        if (lastError.message.includes("GEMINI_API_KEY") || lastError.message.includes("401") || lastError.message.includes("403")) {
          throw lastError;
        }
      }
    }

    throw lastError || new Error("Gemini generation failed after retry.");
  }

  private async callGeminiApi(
    systemPrompt: string,
    userPrompt: string,
    isRetry: boolean
  ): Promise<unknown> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.model
    )}:generateContent?key=${this.apiKey}`;

    const retryNote = isRetry
      ? "\n\nCRITICAL REMINDER: The previous generation failed validation because one or more quotes were not verbatim in the source. Ensure EVERY sourceQuote is an exact substring from the source."
      : "";

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt + retryNote }],
            },
          ],
          generationConfig: {
            response_mime_type: "application/json",
            response_schema: {
              type: "OBJECT",
              properties: {
                questions: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      type: {
                        type: "STRING",
                        enum: ["multiple_choice", "fill_blank"],
                      },
                      prompt: { type: "STRING" },
                      answer: { type: "STRING" },
                      choices: {
                        type: "ARRAY",
                        items: { type: "STRING" },
                      },
                      explanation: { type: "STRING" },
                      sourceQuote: { type: "STRING" },
                    },
                    required: [
                      "type",
                      "prompt",
                      "answer",
                      "choices",
                      "explanation",
                      "sourceQuote",
                    ],
                  },
                },
              },
              required: ["questions"],
            },
            temperature: 0.2,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Gemini API error (status ${response.status}): ${errorText.slice(0, 300)}`
        );
      }

      const data = await response.json();
      const candidateText =
        data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!candidateText || typeof candidateText !== "string") {
        throw new Error("Gemini returned empty or malformed content parts.");
      }

      return JSON.parse(candidateText);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
