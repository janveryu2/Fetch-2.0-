import { z } from "zod";

export interface PageOcrResult {
  text: string;
  qualityFlag: "ok" | "blurry" | "low_contrast" | "rotated" | "unreadable";
  confidenceNotes?: string;
}

const ocrResponseSchema = z.object({
  text: z.string(),
  quality: z.enum(["ok", "blurry", "low_contrast", "rotated", "unreadable"]).default("ok"),
  notes: z.string().optional(),
});

export class GeminiOcrService {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(options?: { apiKey?: string; model?: string; timeoutMs?: number }) {
    this.apiKey = options?.apiKey || process.env.GEMINI_API_KEY || "";
    this.model = options?.model || "gemini-3.7-flash";
    this.timeoutMs = options?.timeoutMs ?? 45_000;
  }

  async extractPageText(
    imageBuffer: Uint8Array | Buffer,
    mimeType: "image/jpeg" | "image/png"
  ): Promise<PageOcrResult> {
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured for OCR scan extraction.");
    }

    if (imageBuffer.length > 5 * 1024 * 1024) {
      throw new Error("Page image exceeds 5 MiB size limit.");
    }

    const base64Data = Buffer.from(imageBuffer).toString("base64");

    const candidateModels = [
      this.model,
      ...(this.model === "gemini-3.7-flash" ? ["gemini-2.5-flash"] : []),
    ];

    let lastError: Error | null = null;

    for (const modelToUse of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        modelToUse
      )}:generateContent?key=${this.apiKey}`;

      const systemPrompt =
        "You are an expert OCR transcription engine for student notes, handwritten notebooks, and printed study guides. Transcribe all text verbatim. Preserve line breaks, headings, bullet points, math equations, and tables. Evaluate the visual clarity of the scan (ok, blurry, low_contrast, rotated, unreadable). Respond strictly in valid JSON format matching the schema.";

      const userPrompt =
        "Transcribe this page of study notes verbatim and assess image readability.";

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
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data,
                    },
                  },
                  { text: userPrompt },
                ],
              },
            ],
            generationConfig: {
              response_mime_type: "application/json",
              response_schema: {
                type: "OBJECT",
                properties: {
                  text: { type: "STRING" },
                  quality: {
                    type: "STRING",
                    enum: ["ok", "blurry", "low_contrast", "rotated", "unreadable"],
                  },
                  notes: { type: "STRING" },
                },
                required: ["text", "quality"],
              },
              temperature: 0.1,
            },
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          throw new Error(`Gemini OCR HTTP ${response.status}: ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const rawJsonText =
          data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        const parsedJson = JSON.parse(rawJsonText);
        const validated = ocrResponseSchema.parse(parsedJson);

        return {
          text: validated.text.trim(),
          qualityFlag: validated.quality,
          confidenceNotes: validated.notes,
        };
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError || new Error("Failed to extract text from scan image.");
  }
}
