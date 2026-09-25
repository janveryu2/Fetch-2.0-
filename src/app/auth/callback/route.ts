import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DESTINATIONS = [
  "/app",
  "/app/home",
  "/app/settings",
  "/app/reset-password",
  "/app/study-packs",
  "/app/calendar",
  "/app/progress",
  "/app/tutor",
  "/app/pomodoro",
  "/app/music",
  "/app/live",
  "/app/friends",
  "/app/messages",
];

export function safeNext(value: string | null): string {
  if (!value) return "/app/home";
  // Disallow scheme-relative, backslash, protocol/host manipulation, control characters
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("://") ||
    /[\x00-\x1f\x7f]/.test(value)
  ) {
    return "/app/home";
  }

  try {
    const dummyOrigin = "http://localhost";
    const parsed = new URL(value, dummyOrigin);
    if (parsed.origin !== dummyOrigin) {
      return "/app/home";
    }

    const normalizedPath = parsed.pathname;
    const isAllowed = ALLOWED_DESTINATIONS.some(
      (allowed) => normalizedPath === allowed || normalizedPath.startsWith(allowed + "/")
    );

    if (!isAllowed) {
      return "/app/home";
    }

    return `${normalizedPath}${parsed.search}${parsed.hash}`;
  } catch {
    return "/app/home";
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const rawNext = searchParams.get("next");
  const errorParam = searchParams.get("error");

  // Handle provider-level errors (e.g. OAuth cancellation or access denied)
  if (errorParam) {
    const errorTarget = new URL("/app", origin);
    errorTarget.searchParams.set("auth", errorParam);
    return NextResponse.redirect(errorTarget);
  }

  // Handle recovery flow
  const isRecovery = type === "recovery" || (rawNext && rawNext.includes("reset-password"));
  const destination = isRecovery ? "/app/reset-password" : safeNext(rawNext);
  const target = new URL(destination, origin);

  if (!code) {
    const errorTarget = new URL("/app", origin);
    errorTarget.searchParams.set("auth", "confirmation-failed");
    return NextResponse.redirect(errorTarget);
  }

  try {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      const errorTarget = new URL("/app", origin);
      errorTarget.searchParams.set("auth", "confirmation-failed");
      return NextResponse.redirect(errorTarget);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Check existing profile
      let { data: profile } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        // Trigger might not have run or legacy user; repair profile via database RPC
        const { data: repaired } = await supabase.rpc("ensure_profile");
        if (repaired && typeof repaired === "object") {
          const rep = repaired as { id: string; display_name: string; username: string | null };
          profile = {
            id: rep.id,
            display_name: rep.display_name,
            username: rep.username,
          };
        }
      }

      if (profile && !profile.username && !isRecovery) {
        // If user metadata had an explicit username that failed to register (e.g. collision)
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const rawRequestedUsername =
          typeof metadata.username === "string" ? metadata.username.trim() : "";

        if (rawRequestedUsername) {
          target.searchParams.set("auth", "username-taken");
        } else {
          target.searchParams.set("auth", "setup-username");
        }
      }
    }

    return NextResponse.redirect(target);
  } catch {
    const errorTarget = new URL("/app", origin);
    errorTarget.searchParams.set("auth", "confirmation-failed");
    return NextResponse.redirect(errorTarget);
  }
}
