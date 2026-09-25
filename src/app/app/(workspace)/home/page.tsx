import { redirect } from "next/navigation";
import { getStudentPreferenceState } from "@/lib/server/student-preferences";
import { createClient } from "@/lib/supabase/server";
import { HomeView } from "./home-view";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const rawAuth = typeof resolvedParams?.auth === "string" ? resolvedParams.auth : undefined;
  const authSignal = rawAuth === "setup-username" || rawAuth === "username-taken" ? rawAuth : null;
  const authQuery = authSignal ? `?auth=${authSignal}` : "";

  const state = await getStudentPreferenceState();

  if (state.status === "pending") {
    redirect(`/app/onboarding${authQuery}`);
  }

  let displayName: string | null = null;
  if (state.status === "completed" || state.status === "skipped") {
    try {
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", state.userId)
        .maybeSingle();

      if (profile?.display_name) {
        displayName = profile.display_name;
      }
    } catch {
      // Profile fetch failure is best-effort for greeting
    }
  }

  return (
    <HomeView
      displayName={displayName}
      initialAuthSignal={authSignal}
    />
  );
}
