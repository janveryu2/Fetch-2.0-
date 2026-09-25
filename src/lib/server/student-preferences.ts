import "server-only";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import {
  studentPreferencesSchema,
  type StudentPreferences,
} from "@/lib/student-preferences";

export type StudentPreferenceState =
  | { status: "unauthenticated" }
  | { status: "unavailable"; error: string }
  | { status: "pending"; preferences: StudentPreferences; userId: string; email: string | null }
  | { status: "completed"; preferences: StudentPreferences; userId: string; email: string | null }
  | { status: "skipped"; preferences: StudentPreferences; userId: string; email: string | null };

export async function getStudentPreferenceState(): Promise<StudentPreferenceState> {
  const context = await getAuthenticatedRequestContext();
  if (!context) {
    return { status: "unauthenticated" };
  }

  const { supabase, userId, email } = context;

  try {
    const { data, error } = await supabase.rpc("get_student_preferences");
    if (error) {
      return { status: "unavailable", error: error.message };
    }

    const parsed = studentPreferencesSchema.safeParse(data);
    if (!parsed.success) {
      return { status: "unavailable", error: "Invalid preference payload from database" };
    }

    const preferences = parsed.data;
    if (preferences.onboardingStatus === "completed") {
      return { status: "completed", preferences, userId, email };
    }
    if (preferences.onboardingStatus === "skipped") {
      return { status: "skipped", preferences, userId, email };
    }

    return { status: "pending", preferences, userId, email };
  } catch (err) {
    return {
      status: "unavailable",
      error: err instanceof Error ? err.message : "Failed to load student preferences",
    };
  }
}
