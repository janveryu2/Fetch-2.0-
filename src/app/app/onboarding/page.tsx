import Link from "next/link";
import { redirect } from "next/navigation";
import { FetchBrand } from "@/components/brand/fetch-brand";
import { StudentOnboarding } from "@/components/onboarding/student-onboarding";
import { getStudentPreferenceState } from "@/lib/server/student-preferences";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const rawAuth = typeof resolvedParams?.auth === "string" ? resolvedParams.auth : undefined;
  const authSignal = rawAuth === "setup-username" || rawAuth === "username-taken" ? rawAuth : null;

  const state = await getStudentPreferenceState();

  if (state.status === "unauthenticated") {
    redirect("/app");
  }

  if (state.status === "completed" || state.status === "skipped") {
    redirect("/app/home");
  }

  if (state.status === "unavailable") {
    return (
      <div className="blue-grid min-h-[100dvh]">
        <header className="mx-auto flex h-[78px] max-w-[1380px] items-center justify-between px-5 lg:px-10">
          <FetchBrand />
        </header>
        <main className="flex min-h-[calc(100dvh-78px)] items-center justify-center px-4 py-10">
          <div className="surface-card w-full max-w-[480px] p-6 sm:p-8 text-center">
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
              Setup is temporarily unavailable
            </h1>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              We encountered an issue checking your study preferences. Please try again.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                href="/app/onboarding"
                className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[var(--fetch-blue-600)] px-4 font-bold text-white hover:bg-[var(--fetch-blue-700)] transition-colors"
              >
                Retry
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const supabase = await createClient();
  let { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username")
    .eq("id", state.userId)
    .maybeSingle();

  if (!profile) {
    const { data: repaired } = await supabase.rpc("ensure_profile");
    if (repaired && typeof repaired === "object") {
      const rep = repaired as { display_name?: string; username?: string | null };
      profile = {
        display_name: rep.display_name || "Student",
        username: rep.username || null,
      };
    }
  }

  const displayName = profile?.display_name || "Student";

  return (
    <div className="blue-grid min-h-[100dvh]">
      <header className="mx-auto flex h-[78px] max-w-[1380px] items-center justify-between px-5 lg:px-10">
        <FetchBrand />
      </header>
      <main className="flex min-h-[calc(100dvh-78px)] items-center justify-center px-4 py-10">
        <StudentOnboarding
          displayName={displayName}
          initialPreferences={state.preferences}
          authSignal={authSignal}
        />
      </main>
    </div>
  );
}
