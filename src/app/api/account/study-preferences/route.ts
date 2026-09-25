import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";
import {
  patchStudentPreferencesSchema,
  studentPreferencesSchema,
} from "@/lib/student-preferences";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Type": "application/json",
};

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) {
    return unauthorizedResponse("Authentication required to access study preferences.");
  }

  const { supabase } = context;

  try {
    const { data, error } = await supabase.rpc("get_student_preferences");
    if (error) {
      return createApiErrorResponse(
        "STUDY_PREFERENCES_UNAVAILABLE",
        "Study preferences currently unavailable.",
        503
      );
    }

    const parsed = studentPreferencesSchema.safeParse(data);
    if (!parsed.success) {
      return createApiErrorResponse(
        "STUDY_PREFERENCES_UNAVAILABLE",
        "Invalid study preferences data.",
        503
      );
    }

    return new Response(JSON.stringify({ preferences: parsed.data }), {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    return createApiErrorResponse(
      "STUDY_PREFERENCES_UNAVAILABLE",
      err instanceof Error ? err.message : "Failed to load study preferences.",
      503
    );
  }
}

export async function PATCH(request: Request) {
  const context = await getAuthenticatedRequestContext();
  if (!context) {
    return unauthorizedResponse("Authentication required to update study preferences.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("INVALID_JSON", "Invalid JSON payload.", 400);
  }

  const parsed = patchStudentPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_STUDY_PREFERENCES",
      "Invalid study preferences fields.",
      400,
      undefined,
      { issues: parsed.error.issues }
    );
  }

  const { primarySubject, studyGoal, focusMinutes, action } = parsed.data;
  const { supabase } = context;

  const rpcParams =
    action === "skip"
      ? {
          p_primary_subject: null,
          p_study_goal: null,
          p_focus_minutes: 25,
          p_action: "skip",
        }
      : {
          p_primary_subject: primarySubject,
          p_study_goal: studyGoal,
          p_focus_minutes: focusMinutes,
          p_action: action,
        };

  try {
    const { data, error } = await supabase.rpc("save_student_preferences", rpcParams);
    if (error) {
      return createApiErrorResponse(
        "STUDY_PREFERENCES_SAVE_FAILED",
        "Failed to save study preferences.",
        503
      );
    }

    const validated = studentPreferencesSchema.safeParse(data);
    if (!validated.success) {
      return createApiErrorResponse(
        "STUDY_PREFERENCES_SAVE_FAILED",
        "Database returned invalid preferences shape.",
        503
      );
    }

    return new Response(JSON.stringify({ preferences: validated.data }), {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (err) {
    return createApiErrorResponse(
      "STUDY_PREFERENCES_SAVE_FAILED",
      err instanceof Error ? err.message : "Failed to save study preferences.",
      503
    );
  }
}
