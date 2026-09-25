import { z } from "zod";
import { createHash } from "node:crypto";
import { generateStudyPack } from "@/lib/ai/study-pack";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import type { Question } from "@/lib/demo-types";

export const requestSchema = z.object({
  title: z.string().trim().min(2).max(80),
  source: z.string().trim().min(80).max(20_000),
  count: z.number().int().min(3).max(20),
});

export function fixtureQuestions(source: string, count: number): Question[] {
  const cleaned = source.replace(/\s+/g, " ").trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 30);
  const material = sentences.length ? sentences : [cleaned];
  return Array.from({ length: Math.min(count, Math.max(3, material.length)) }, (_, index) => {
    const sentence = material[index % material.length];
    const words = sentence.replace(/[^a-zA-Z0-9\s-]/g, "").split(/\s+/).filter((word) => word.length > 5);
    const answer = words[index % Math.max(words.length, 1)] || sentence.split(" ")[0] || "concept";
    const prompt = sentence.replace(new RegExp(`\\b${answer}\\b`, "i"), "____");
    return {
      id: crypto.randomUUID(),
      type: index % 2 === 0 ? "fill_blank" : "multiple_choice",
      prompt: index % 2 === 0 ? prompt : `Which key term best completes this source idea: “${prompt}”?`,
      answer,
      choices: index % 2 === 0 ? undefined : [answer, "context", "evidence", "revision"].filter((value, choiceIndex, all) => all.indexOf(value) === choiceIndex),
      explanation: `The source sentence states: “${sentence}”`,
    };
  });
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Add a title and at least 80 characters of study material." }, { status: 400 });

  const account = await getAuthenticatedRequestContext();
  let questions: Question[];
  let provider: "openai" | "development-fixture";
  let warning: string | undefined;
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    try {
      questions = await generateStudyPack(parsed.data);
      provider = "openai";
    } catch (error) {
      console.error("Study-pack generation failed", error);
      return Response.json({ error: "Generation failed safely. Your material was not saved; please retry." }, { status: 502 });
    }
  } else if (process.env.NODE_ENV === "production" && process.env.FETCH_ENABLE_DEV_FIXTURE !== "true") {
    return Response.json({ error: "AI generation is not configured. Add both OPENAI_API_KEY and OPENAI_MODEL." }, { status: 503 });
  } else {
    questions = fixtureQuestions(parsed.data.source, parsed.data.count);
    provider = "development-fixture";
    warning = "These questions are deterministic development fixtures, not AI-generated production content.";
  }

  if (!account) return Response.json({ provider, warning, questions });

  const { data, error } = await account.supabase.rpc("create_study_pack", {
    p_title: parsed.data.title,
    p_source_type: "text",
    p_source_label: provider === "openai" ? "Pasted text · AI generated" : "Pasted text · development fixture",
    p_source_content: parsed.data.source,
    p_content_hash: createHash("sha256").update(parsed.data.source).digest("hex"),
    p_questions: questions,
  });
  if (error || !data || typeof data !== "object") {
    console.error("StudyPack persistence failed", error?.code);
    return Response.json({ error: "FETCH generated the questions but could not save this StudyPack. Apply the account database schema and retry." }, { status: 503 });
  }
  const saved = data as { id?: unknown; questions?: unknown };
  if (typeof saved.id !== "string" || !Array.isArray(saved.questions)) {
    return Response.json({ error: "FETCH could not confirm that this StudyPack was saved." }, { status: 503 });
  }
  return Response.json({ provider, warning, packId: saved.id, questions: saved.questions });
}
