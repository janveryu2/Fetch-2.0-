import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";
import { z } from "zod";

const updatePreferencesSchema = z.object({
  discoverable: z.boolean().optional(),
  allowDirectMessages: z.boolean().optional(),
  studyReminders: z.boolean().optional(),
});

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse("Authentication required to view preferences.");

  const { supabase } = context;

  const { data, error } = await supabase.rpc("get_account_preferences");
  if (error) {
    return createApiErrorResponse(
      "PREFERENCES_FETCH_FAILED",
      error.message || "Failed to retrieve account preferences.",
      500
    );
  }

  return NextResponse.json({ preferences: data });
}

export async function PATCH(request: NextRequest) {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse("Authentication required to update preferences.");

  const { supabase } = context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("INVALID_JSON", "Invalid JSON payload.", 400);
  }

  const parsed = updatePreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      "INVALID_PREFERENCES",
      parsed.error.issues[0]?.message || "Invalid preferences data.",
      400
    );
  }

  const { discoverable, allowDirectMessages, studyReminders } = parsed.data;

  const { data, error } = await supabase.rpc("update_account_preferences", {
    p_discoverable: discoverable ?? null,
    p_allow_direct_messages: allowDirectMessages ?? null,
    p_study_reminders: studyReminders ?? null,
  });

  if (error) {
    return createApiErrorResponse(
      "PREFERENCES_UPDATE_FAILED",
      error.message || "Failed to update account preferences.",
      500
    );
  }

  return NextResponse.json({ preferences: data });
}
