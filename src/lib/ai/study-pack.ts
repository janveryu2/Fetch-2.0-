import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export const generatedPackSchema = z.object({
  questions: z.array(z.object({
    type: z.enum(["multiple_choice", "fill_blank"]),
    prompt: z.string(),
    answer: z.string(),
    choices: z.array(z.string()),
    explanation: z.string(),
    sourceQuote: z.string(),
  })),
});

export async function generateStudyPack(input: { source: string; count: number }) {
  const model = process.env.OPENAI_MODEL;
  if (!process.env.OPENAI_API_KEY || !model) {
    throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required for production generation.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.responses.parse({
    model,
    store: false,
    input: [
      {
        role: "system",
        content: `You create accurate study questions using only the supplied source. Create exactly ${input.count} varied questions. Every answer and explanation must be supported by a short verbatim sourceQuote. For fill_blank questions return an empty choices array. For multiple_choice questions return exactly four plausible, unique choices including the answer. Never add outside facts.`,
      },
      { role: "user", content: `SOURCE MATERIAL\n---\n${input.source}\n---` },
    ],
    text: { format: zodTextFormat(generatedPackSchema, "fetch_study_pack") },
  });

  if (!response.output_parsed) throw new Error("The AI provider returned no usable study pack.");
  const validated = generatedPackSchema.parse(response.output_parsed);
  if (validated.questions.length !== input.count) throw new Error("The AI provider returned the wrong question count. Please retry.");
  return validated.questions.map(({ sourceQuote, ...question }) => ({
    ...question,
    sourceQuote,
    id: crypto.randomUUID(),
    explanation: `${question.explanation} Source: “${sourceQuote}”`,
    choices: question.type === "fill_blank" ? undefined : question.choices,
  }));
}
