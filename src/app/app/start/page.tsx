import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudentPreferenceState } from "@/lib/server/student-preferences";

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const rawAuth = typeof resolvedParams?.auth === "string" ? resolvedParams.auth : undefined;
  const authParam = rawAuth === "setup-username" || rawAuth === "username-taken" ? rawAuth : null;
  const authQuery = authParam ? `?auth=${authParam}` : "";

  const state = await getStudentPreferenceState();

  if (state.status === "unauthenticated") {
    redirect("/app/home");
  }

  if (state.status === "pending") {
    redirect(`/app/onboarding${authQuery}`);
  }

  if (state.status === "completed" || state.status === "skipped") {
    redirect(`/app/home${authQuery}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-[var(--surface-canvas)]">
      <div className="surface-card w-full max-w-[480px] p-6 sm:p-8 text-center">
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
          Account setup unavailable
        </h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          We could not load your study preferences right now. Please try again in a moment.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={`/app/start${authQuery}`}
            className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[var(--fetch-blue-600)] px-4 font-bold text-white hover:bg-[var(--fetch-blue-700)] transition-colors"
          >
            Retry
          </Link>
        </div>
      </div>
    </div>
  );
}
