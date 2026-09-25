import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/app/home";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target = new URL(safeNext(request.nextUrl.searchParams.get("next")), request.nextUrl.origin);
  try {
    if (!code) throw new Error("Missing confirmation code.");
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const metadata = user.user_metadata as Record<string, unknown>;
      const displayName = typeof metadata.display_name === "string"
        ? metadata.display_name.trim().slice(0, 60)
        : user.email?.split("@")[0]?.slice(0, 60) || "FETCH Student";
      const username = typeof metadata.username === "string" && /^[a-z0-9_]{3,24}$/.test(metadata.username)
        ? metadata.username
        : null;
      const profile = { id: user.id, display_name: displayName || "FETCH Student", username };
      const { error: profileError } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
      if (profileError?.code === "23505") {
        await supabase.from("profiles").upsert({ ...profile, username: null }, { onConflict: "id" });
        target.search = "?auth=username-taken";
      }
    }
    return NextResponse.redirect(target);
  } catch {
    target.pathname = "/app";
    target.search = "?auth=confirmation-failed";
    return NextResponse.redirect(target);
  }
}
