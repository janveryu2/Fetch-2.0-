import { MusicProvider } from "@/components/tools/music-provider";
import { TimerProvider } from "@/components/tools/timer-provider";
import { AppShell } from "@/components/app/app-shell";
import { DemoProvider } from "@/components/app/demo-provider";
import { StudentPreferencesProvider } from "@/components/app/student-preferences-provider";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";
import { getStudentPreferenceState } from "@/lib/server/student-preferences";
import { DEFAULT_STUDENT_PREFERENCES, type StudentPreferences } from "@/lib/student-preferences";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getAuthenticatedRequestContext();
  const mode = account ? "account" : "demo";
  const tutorAvailable = Boolean(account && process.env.GROQ_API_KEY);

  let initialPreferences: StudentPreferences = DEFAULT_STUDENT_PREFERENCES;
  if (account) {
    const prefState = await getStudentPreferenceState();
    if (
      prefState.status === "completed" ||
      prefState.status === "skipped" ||
      prefState.status === "pending"
    ) {
      initialPreferences = prefState.preferences;
    }
  }

  const isolateKey = account ? account.userId : "demo";

  return (
    <DemoProvider key={isolateKey} mode={mode} userId={account?.userId} tutorAvailable={tutorAvailable}>
      <StudentPreferencesProvider key={isolateKey} initialPreferences={initialPreferences} mode={mode}>
        <TimerProvider key={isolateKey} preferredFocusMinutes={initialPreferences.focusMinutes}>
          <MusicProvider>
            <AppShell>{children}</AppShell>
          </MusicProvider>
        </TimerProvider>
      </StudentPreferencesProvider>
    </DemoProvider>
  );
}
