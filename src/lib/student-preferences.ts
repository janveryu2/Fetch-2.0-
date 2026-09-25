import { z } from "zod";

export type StudyGoal = "exam" | "understand" | "habit";
export type FocusMinutes = 15 | 25 | 45;
export type OnboardingStatus = "pending" | "completed" | "skipped";
export type PreferenceAction = "complete" | "skip" | "save";

export interface StudentPreferences {
  primarySubject: string | null;
  studyGoal: StudyGoal | null;
  focusMinutes: FocusMinutes;
  onboardingStatus: OnboardingStatus;
  onboardingVersion: number;
  completedAt: string | null;
}

export const DEFAULT_STUDENT_PREFERENCES: StudentPreferences = {
  primarySubject: null,
  studyGoal: null,
  focusMinutes: 25,
  onboardingStatus: "pending",
  onboardingVersion: 1,
  completedAt: null,
};

export function normalizePrimarySubject(subject: string | null | undefined): string | null {
  if (typeof subject !== "string") return null;
  const trimmed = subject.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const studentPreferencesSchema = z.object({
  primarySubject: z.string().trim().max(100).nullable(),
  studyGoal: z.enum(["exam", "understand", "habit"]).nullable(),
  focusMinutes: z.union([z.literal(15), z.literal(25), z.literal(45)]),
  onboardingStatus: z.enum(["pending", "completed", "skipped"]),
  onboardingVersion: z.number().int(),
  completedAt: z.string().nullable(),
});

export const patchStudentPreferencesSchema = z.object({
  primarySubject: z.preprocess(
    (val) => (typeof val === "string" ? normalizePrimarySubject(val) : val),
    z.string().max(100).nullable()
  ),
  studyGoal: z.enum(["exam", "understand", "habit"]).nullable(),
  focusMinutes: z.union([z.literal(15), z.literal(25), z.literal(45)]),
  action: z.enum(["complete", "skip", "save"]),
}).strict();

export type PatchStudentPreferencesInput = z.infer<typeof patchStudentPreferencesSchema>;
