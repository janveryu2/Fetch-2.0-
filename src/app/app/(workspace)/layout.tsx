import { MusicProvider } from "@/components/tools/music-provider";
import { TimerProvider } from "@/components/tools/timer-provider";
import { AppShell } from "@/components/app/app-shell";
import { DemoProvider } from "@/components/app/demo-provider";
import { getAuthenticatedRequestContext } from "@/lib/supabase/authorization";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await getAuthenticatedRequestContext();
  const mode = account ? "account" : "demo";
  const tutorAvailable = Boolean(
    account && process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL,
  );
  return (
    <DemoProvider key={mode} mode={mode} userId={account?.userId} tutorAvailable={tutorAvailable}>
      <TimerProvider>
        <MusicProvider>
          <AppShell>{children}</AppShell>
        </MusicProvider>
      </TimerProvider>
    </DemoProvider>
  );
}
