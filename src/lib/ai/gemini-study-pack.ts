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

export type GeminiFailureClass =
  | "GROUNDING_FAILED"
  | "WRONG_QUESTION_COUNT"
  | "INVALID_CHOICES"
  | "MALFORMED_PROVIDER_OUTPUT"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_QUOTA_EXCEEDED"
  | "CONFIG_ERROR"
  | "TIMEOUT"
  | "UNKNOWN_ERROR";

export class GeminiStudyPackError extends Error {
  public readonly classification: GeminiFailureClass;
  public readonly httpStatus?: number;
  public readonly validationStage?: string;

  constructor(
    message: string,
    classification: GeminiFailureClass,
    options?: { httpStatus?: number; validationStage?: string; cause?: unknown }
  ) {
    super(message, { cause: options?.cause });
    this.name = "GeminiStudyPackError";
    this.classification = classification;
    this.httpStatus = options?.httpStatus;
    this.validationStage = options?.validationStage;
  }
}

export function sanitizeErrorMessage(msg: string): string {
  return msg.replace(/key=[^&\s"'`]+/gi, "key=[REDACTED]");
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
  if (normSource.includes(normQuote)) return true;

  // Ellipsis match: if quote contains '...' or '…', verify each segment appears in source in order
  if (normQuote.includes("...") || normQuote.includes("…")) {
    const segments = normQuote
      .split(/\.{3,}|…/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6);
    if (segments.length > 0) {
      let lastIdx = 0;
      let allSegmentsFound = true;
      for (const seg of segments) {
        const foundIdx = normSource.indexOf(seg, lastIdx);
        if (foundIdx === -1) {
          allSegmentsFound = false;
          break;
        }
        lastIdx = foundIdx + seg.length;
      }
      if (allSegmentsFound) return true;
    }
  }

  // Secondary match: strip all non-alphanumeric characters to bridge OCR linebreaks and hyphens
  const cleanSource = normSource.replace(/[^a-z0-9]/g, "");
  const cleanQuote = normQuote.replace(/[^a-z0-9]/g, "");
  if (cleanQuote.length >= 8 && cleanSource.includes(cleanQuote)) {
    return true;
  }

  // Tertiary match: if quote is long (>25 chars), check if prefix of at least 20 chars matches
  if (cleanQuote.length > 25) {
    const prefix = cleanQuote.slice(0, 20);
    if (cleanSource.includes(prefix)) {
      return true;
    }
  }

  return false;
}

export function validateAndTransformQuestions(
  rawQuestions: unknown[],
  source: string,
  expectedCount: number
): GeneratedQuestion[] {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new GeminiStudyPackError(
      `The AI provider returned 0 questions, expected exactly ${expectedCount}.`,
      "WRONG_QUESTION_COUNT",
      { validationStage: "question_count" }
    );
  }

  const seenPrompts = new Set<string>();
  const questions: GeneratedQuestion[] = [];
  let firstGroundingError: string | null = null;

  for (let i = 0; i < rawQuestions.length; i++) {
    if (questions.length >= expectedCount) break;

    const raw = rawQuestions[i] as Record<string, unknown>;
    if (!raw || typeof raw !== "object") {
      throw new GeminiStudyPackError(
        `Invalid question object at index ${i}`,
        "MALFORMED_PROVIDER_OUTPUT",
        { validationStage: "question_structure" }
      );
    }

    const type = raw.type;
    if (type !== "multiple_choice" && type !== "fill_blank") {
      throw new GeminiStudyPackError(
        `Invalid question type "${String(type)}" at index ${i}`,
        "MALFORMED_PROVIDER_OUTPUT",
        { validationStage: "question_type" }
      );
    }

    const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
    if (!prompt) {
      throw new GeminiStudyPackError(
        `Question prompt at index ${i} is empty.`,
        "MALFORMED_PROVIDER_OUTPUT",
        { validationStage: "prompt" }
      );
    }

    const normalizedPrompt = prompt.toLowerCase();
    if (seenPrompts.has(normalizedPrompt)) {
      throw new GeminiStudyPackError(
        `Duplicate question prompt detected: "${prompt}"`,
        "MALFORMED_PROVIDER_OUTPUT",
        { validationStage: "duplicate_detection" }
      );
    }

    const answer = typeof raw.answer === "string" ? raw.answer.trim() : "";
    if (!answer) {
      throw new GeminiStudyPackError(
        `Question answer at index ${i} is empty.`,
        "MALFORMED_PROVIDER_OUTPUT",
        { validationStage: "answer" }
      );
    }

    const explanation = typeof raw.explanation === "string" ? raw.explanation.trim() : "";
    const sourceQuote = typeof raw.sourceQuote === "string" ? raw.sourceQuote.trim() : "";

    if (!verifySourceGrounding(source, sourceQuote)) {
      firstGroundingError = `Source grounding verification failed for question ${i + 1}: quote is not verbatim in source.`;
      continue;
    }

    let choices: string[] | undefined = undefined;
    if (type === "multiple_choice") {
      const rawChoices = Array.isArray(raw.choices) ? raw.choices : [];
      if (rawChoices.length !== 4) {
        throw new GeminiStudyPackError(
          `Multiple choice question ${i + 1} must have exactly 4 choices.`,
          "INVALID_CHOICES",
          { validationStage: "choices" }
        );
      }
      const trimmedChoices = rawChoices.map((c) => (typeof c === "string" ? c.trim() : ""));
      const uniqueChoices = new Set(trimmedChoices.map((c) => c.toLowerCase()));
      if (uniqueChoices.size !== 4) {
        throw new GeminiStudyPackError(
          `Multiple choice question ${i + 1} choices must all be unique.`,
          "INVALID_CHOICES",
          { validationStage: "choices" }
        );
      }
      if (!trimmedChoices.some((c) => c.toLowerCase() === answer.toLowerCase())) {
        throw new GeminiStudyPackError(
          `Multiple choice question ${i + 1} answer "${answer}" is not in the choices list.`,
          "INVALID_CHOICES",
          { validationStage: "choices" }
        );
      }
      choices = trimmedChoices;
    }

    seenPrompts.add(normalizedPrompt);
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

  if (questions.length < expectedCount) {
    if (questions.length === 0 && firstGroundingError) {
      throw new GeminiStudyPackError(
        firstGroundingError,
        "GROUNDING_FAILED",
        { validationStage: "grounding" }
      );
    }
    throw new GeminiStudyPackError(
      `The AI provider returned ${questions.length} valid questions, expected exactly ${expectedCount}.`,
      firstGroundingError ? "GROUNDING_FAILED" : "WRONG_QUESTION_COUNT",
      { validationStage: "question_count" }
    );
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
      throw new GeminiStudyPackError(
        "GEMINI_API_KEY is not configured.",
        "CONFIG_ERROR",
        { validationStage: "initialization" }
      );
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
        // If it's a network/config error or unrecoverable error, do not retry
        if (
          lastError.message.includes("GEMINI_API_KEY") ||
          lastError.message.includes("401") ||
          lastError.message.includes("403")
        ) {
          throw lastError;
        }
      }
    }

    throw lastError || new GeminiStudyPackError("Gemini generation failed after retry.", "UNKNOWN_ERROR");
  }

  private async callGeminiApi(
    systemPrompt: string,
    userPrompt: string,
    isRetry: boolean
  ): Promise<unknown> {
    const candidateModels = [
      this.model,
      ...(this.model === "gemini-3.7-flash" ? ["gemini-2.5-flash"] : []),
    ];

    let lastError: Error | null = null;

    for (let mIdx = 0; mIdx < candidateModels.length; mIdx++) {
      const modelToUse = candidateModels[mIdx];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelToUse
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
              maxOutputTokens: 8192,
            },
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          const isQuota = response.status === 429;
          const isUnavailable = response.status === 503;

          // If the model is experiencing high demand (503 / 429), try the next candidate model
          if ((isUnavailable || isQuota) && mIdx < candidateModels.length - 1) {
            console.warn(`Gemini model ${modelToUse} returned status ${response.status}. Trying fallback model...`);
            lastError = new GeminiStudyPackError(
              `Gemini API error (status ${response.status}): ${sanitizeErrorMessage(errorText).slice(0, 300)}`,
              isQuota ? "PROVIDER_QUOTA_EXCEEDED" : "PROVIDER_UNAVAILABLE",
              { httpStatus: response.status, validationStage: "api_call" }
            );
            continue;
          }

          throw new GeminiStudyPackError(
            `Gemini API error (status ${response.status}): ${sanitizeErrorMessage(errorText).slice(0, 300)}`,
            isQuota ? "PROVIDER_QUOTA_EXCEEDED" : isUnavailable ? "PROVIDER_UNAVAILABLE" : "UNKNOWN_ERROR",
            { httpStatus: response.status, validationStage: "api_call" }
          );
        }

        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const textParts = parts
          .filter(
            (p: { thought?: boolean; text?: string }) =>
              !p.thought && typeof p.text === "string"
          )
          .map((p: { text: string }) => p.text);

        let candidateText = textParts.join("").trim();
        if (!candidateText && parts.length > 0 && typeof parts[0]?.text === "string") {
          candidateText = parts[0].text.trim();
        }

        if (!candidateText) {
          throw new GeminiStudyPackError(
            "Gemini returned empty or malformed content parts.",
            "MALFORMED_PROVIDER_OUTPUT",
            { validationStage: "parsing" }
          );
        }

        const cleanedText = candidateText
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

        try {
          return JSON.parse(cleanedText);
        } catch (parseErr) {
          throw new GeminiStudyPackError(
            `Failed to parse JSON response from Gemini: ${(parseErr as Error).message}`,
            "MALFORMED_PROVIDER_OUTPUT",
            { validationStage: "json_parse", cause: parseErr }
          );
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (mIdx < candidateModels.length - 1 && !lastError.message.includes("GEMINI_API_KEY")) {
          console.warn(`Gemini model ${modelToUse} failed: ${lastError.message}. Trying fallback model...`);
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError || new GeminiStudyPackError("All Gemini model attempts failed.", "UNKNOWN_ERROR");
  }
}
