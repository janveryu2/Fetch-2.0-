import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedRequestContext, unauthorizedResponse } from "@/lib/supabase/authorization";
import { z } from "zod";

const updateProfileSchema = z.object({
  displayName: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length >= 1 && val.length <= 60, {
      message: "Display name must be between 1 and 60 characters.",
    })
    .optional(),
  username: z
    .string()
    .transform((val) => val.toLowerCase().trim())
    .refine((val) => /^[a-z0-9_]{3,24}$/.test(val), {
      message: "Username must be 3-24 characters and contain only lowercase letters, numbers, and underscores.",
    })
    .optional(),
});

export async function GET() {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return unauthorizedResponse("Authentication required to access profile.");
  }

  const { supabase, userId, email } = account;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "Could not retrieve account profile.", code: "PROFILE_FETCH_FAILED" },
      { status: 500 }
    );
  }

  if (!profile) {
    // Attempt idempotent profile repair
    const { data: repaired, error: repairError } = await supabase.rpc("ensure_profile");
    if (repairError || !repaired) {
      // Fallback: create default profile row
      const rawName = email ? email.split("@")[0].trim() : "";
      const fallbackName = (rawName.length > 0 ? rawName.slice(0, 60) : "FETCH Student");
      const { data: created, error: createError } = await supabase
        .from("profiles")
        .insert({ id: userId, display_name: fallbackName, username: null })
        .select("id, display_name, username, avatar_url, created_at, updated_at")
        .single();

      if (createError || !created) {
        return NextResponse.json(
          { error: "Failed to initialize profile.", code: "PROFILE_INIT_FAILED" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        profile: {
          id: created.id,
          displayName: created.display_name,
          username: created.username,
          avatarUrl: created.avatar_url,
          email,
          createdAt: created.created_at,
          updatedAt: created.updated_at,
        },
      });
    }

    const rep = repaired as {
      id: string;
      display_name: string;
      username: string | null;
      avatar_url: string | null;
      created_at: string;
      updated_at: string;
    };

    return NextResponse.json({
      profile: {
        id: rep.id,
        displayName: rep.display_name,
        username: rep.username,
        avatarUrl: rep.avatar_url,
        email,
        createdAt: rep.created_at,
        updatedAt: rep.updated_at,
      },
    });
  }

  return NextResponse.json({
    profile: {
      id: profile.id,
      displayName: profile.display_name,
      username: profile.username,
      avatarUrl: profile.avatar_url,
      email,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const account = await getAuthenticatedRequestContext();
  if (!account) {
    return unauthorizedResponse("Authentication required to update profile.");
  }

  const { supabase, userId, email } = account;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload.", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || "Invalid profile data.",
        code: parsed.error.issues[0]?.message.includes("Username")
          ? "INVALID_USERNAME_FORMAT"
          : "INVALID_PROFILE_DATA",
      },
      { status: 400 }
    );
  }

  const { displayName, username } = parsed.data;
  if (displayName === undefined && username === undefined) {
    return NextResponse.json(
      { error: "No fields provided to update.", code: "NO_UPDATES" },
      { status: 400 }
    );
  }

  // Pre-check username availability via RPC to safely bypass table RLS without data leakage
  if (username !== undefined) {
    const { data: isAvailable, error: checkError } = await supabase.rpc(
      "check_username_available",
      {
        p_username: username,
        p_current_user_id: userId,
      }
    );

    if (!checkError && isAvailable === false) {
      return NextResponse.json(
        { error: "That username is already taken. Please choose another.", code: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (displayName !== undefined) updates.display_name = displayName;
  if (username !== undefined) updates.username = username;

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("id, display_name, username, avatar_url, created_at, updated_at")
    .single();

  if (updateError) {
    if (updateError.code === "23505") {
      return NextResponse.json(
        { error: "That username is already taken. Please choose another.", code: "USERNAME_TAKEN" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Could not update profile.", code: "PROFILE_UPDATE_FAILED" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    profile: {
      id: updated.id,
      displayName: updated.display_name,
      username: updated.username,
      avatarUrl: updated.avatar_url,
      email,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    },
  });
}
