import { describe, expect, it } from "vitest";
import { fixtureQuestions, requestSchema } from "./route";

const source = "Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light most strongly in the blue and red parts of the visible spectrum. Carbon dioxide and water are used to produce glucose and oxygen.";

describe("StudyPack generation boundary", () => {
  it("rejects study material that is too short", () => {
    expect(requestSchema.safeParse({ title: "Biology", source: "Too short", count: 5 }).success).toBe(false);
  });

  it("creates deterministic, source-grounded development questions", () => {
    const questions = fixtureQuestions(source, 3);
    expect(questions).toHaveLength(3);
    expect(questions.every((question) => question.explanation.startsWith("The source sentence states:"))).toBe(true);
    expect(questions.every((question) => question.answer.length > 0)).toBe(true);
  });
});
