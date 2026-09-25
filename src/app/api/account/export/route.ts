import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { createApiErrorResponse } from "@/lib/api-errors";

export async function GET() {
  const context = await getAuthenticatedRequestContext();
  if (!context) return unauthorizedResponse("Authentication required to export account data.");

  const { supabase, userId, email } = context;

  try {
    // 1. Profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, username, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle();

    // 2. Study Packs with questions
    const { data: packs } = await supabase
      .from("study_packs")
      .select(`
        id,
        title,
        source_type,
        source_label,
        status,
        archived_at,
        created_at,
        questions:questions (
          id,
          position,
          kind,
          prompt,
          choices
        )
      `)
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    // 3. Study Sessions with per-answer records
    const { data: sessions } = await supabase
      .from("study_sessions")
      .select(`
        id,
        pack_id,
        score,
        correct_count,
        question_count,
        completed_at,
        answers:study_session_answers (
          question_id,
          submitted_answer,
          is_correct,
          answered_at,
          ordinal
        )
      `)
      .eq("user_id", userId)
      .order("completed_at", { ascending: false });

    // 4. Calendar Events
    const { data: events } = await supabase
      .from("calendar_events")
      .select("id, title, event_type, starts_at, ends_at, event_date, start_time, end_time, all_day, color, subject, location, pack_id, created_at")
      .eq("user_id", userId)
      .order("starts_at", { ascending: true });

    // 5. Friends
    let friendsData: unknown[] = [];
    try {
      const { data: friends } = await supabase.rpc("list_friends");
      if (Array.isArray(friends)) {
        friendsData = friends;
      }
    } catch {
      // Best-effort if RPC is unavailable
    }

    // 6. Preferences
    let preferencesData: Record<string, unknown> | null = null;
    try {
      const { data: prefs } = await supabase.rpc("get_account_preferences");
      if (prefs) {
        preferencesData = prefs as Record<string, unknown>;
      }
    } catch {
      // Best-effort
    }

    // 7. Student Preferences
    let studentPreferencesData: Record<string, unknown> | null = null;
    try {
      const { data: studentPrefs } = await supabase.rpc("get_student_preferences");
      if (studentPrefs) {
        studentPreferencesData = studentPrefs as Record<string, unknown>;
      }
    } catch {
      // Best-effort
    }

    const exportPayload = {
      exportVersion: "3.0",
      exportedAt: new Date().toISOString(),
      account: {
        id: userId,
        email: email || null,
        displayName: profile?.display_name || "FETCH Student",
        username: profile?.username || null,
        avatarUrl: profile?.avatar_url || null,
        joinedAt: profile?.created_at || null,
      },
      preferences: preferencesData || {
        discoverable: true,
        allow_direct_messages: true,
        study_reminders: true,
      },
      studentPreferences: studentPreferencesData || {
        primarySubject: null,
        studyGoal: null,
        focusMinutes: 25,
        onboardingStatus: "pending",
        onboardingVersion: 1,
        completedAt: null,
      },
      studyPacks: packs || [],
      studySessions: sessions || [],
      calendarEvents: events || [],
      friends: friendsData,
      metadata: {
        totalStudyPacks: packs?.length || 0,
        totalStudySessions: sessions?.length || 0,
        totalCalendarEvents: events?.length || 0,
        totalFriends: friendsData.length,
      },
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="fetch-account-data-${dateStr}.json"`,
      },
    });
  } catch (err) {
    return createApiErrorResponse(
      "EXPORT_FAILED",
      err instanceof Error ? err.message : "Failed to compile account export.",
      500
    );
  }
}
