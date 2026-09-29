"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarBlank,
  ChartLineUp,
  ChatCircleDots,
  Handshake,
  House,
  Stack,
  Trophy,
  DotsThreeCircle,
  Sparkle,
  Timer,
  MusicNotes,
  CaretRight,
  X,
} from "@phosphor-icons/react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { FetchBrand } from "@/components/brand/fetch-brand";
import { useDemo } from "./demo-provider";
import { resolveStudyDestination } from "@/lib/study-destination";
import { getActiveDraftSnapshot } from "@/lib/study-session-draft";
import { cn } from "@/lib/cn";
import { ActiveGenerationIndicator } from "@/components/study/active-generation-indicator";

function subscribeToStorage(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getServerSnapshot() {
  return null;
}

const groups = [
  {
    name: "Workspace",
    items: [
      { href: "/app/home", label: "Home", icon: House },
      { href: "/app/study-packs", label: "StudyPacks", icon: Stack },
      { href: "/app/progress", label: "Progress", icon: ChartLineUp },
      { href: "/app/calendar", label: "Calendar", icon: CalendarBlank },
    ],
  },
  {
    name: "Study tools",
    items: [
      { href: "/app/tutor", label: "FETCH AI Tutor", icon: Sparkle },
      { href: "/app/pomodoro", label: "Pomodoro Timer", icon: Timer },
      { href: "/app/music", label: "Music Studio", icon: MusicNotes },
    ],
  },
  {
    name: "Community",
    items: [
      { href: "/app/live", label: "Live", icon: Trophy },
      { href: "/app/friends", label: "Friends", icon: Handshake },
      { href: "/app/messages", label: "Messages", icon: ChatCircleDots },
    ],
  },
];
const navArtwork: Record<string, [number, number]> = {
  Home: [2, 0], StudyPacks: [3, 0], Progress: [0, 1], Calendar: [1, 1],
  "FETCH AI Tutor": [2, 1], "Pomodoro Timer": [3, 1], "Music Studio": [0, 2],
  Live: [1, 2], Friends: [2, 2], Messages: [3, 2], Settings: [0, 3],
  "Dark theme": [1, 3], "Sign out": [2, 3], "Start studying": [0, 0], "Add material": [1, 0],
};

function NavArtwork({ name }: { name: string }) {
  const [column, row] = navArtwork[name] ?? [2, 0];
  return <span className="fetch-nav-art" aria-hidden="true" style={{ backgroundPosition: (-4 - column * 49) + "px " + (-19 - row * 51) + "px" }} />;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { packs, attempts, mode, userId, status, syncError, storageWarning, retryLoad } = useDemo();
  const scopeId = mode === "account" && userId ? userId : "demo";
  const activeDraft = useSyncExternalStore(
    subscribeToStorage,
    () => getActiveDraftSnapshot(scopeId),
    getServerSnapshot,
  );
  const studyDestination = resolveStudyDestination({
    scopeId,
    packs,
    attempts,
    activeDraft,
  });
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [authError, setAuthError] = useState("");
  useEffect(() => {
    const sync = () =>
      setDark(document.documentElement.dataset.theme === "dark");
    const frame = requestAnimationFrame(sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  function toggleTheme() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("fetch-theme", next ? "dark" : "light");
    } catch {
      /* Theme still works without storage. */
    }
    setDark(next);
  }
  async function signOut() {
    if (mode === "demo") {
      router.push("/");
      return;
    }
    setSigningOut(true);
    setAuthError("");
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/app");
      router.refresh();
    } catch {
      setAuthError("FETCH could not sign you out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  const navigation = (
    <>
      {groups.map((group) => (
        <div key={group.name} className="mt-5">
          <p className="fetch-nav-heading mb-2 px-2 text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-tertiary)]">
            {group.name}
          </p>
          {group.items.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "fetch-nav-link flex min-h-[50px] items-center gap-2.5 rounded-xl px-2 text-sm font-bold no-underline transition-colors",
                  active
                    ? "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-800)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                <NavArtwork name={label} />
                <span className="min-w-0 flex-1">{label}</span>
                <CaretRight size={15} weight="bold" className="opacity-60" />
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
  const accountActions = (
      <div className="fetch-account-actions mt-4 border-t border-[var(--border-subtle)] pt-2">
        <Link
          href="/app/settings"
          aria-current={pathname === "/app/settings" ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={cn(
            "fetch-nav-link flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-bold",
            pathname === "/app/settings" &&
              "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-800)]",
          )}
        >
          <NavArtwork name="Settings" /> Settings <CaretRight size={15} className="ml-auto opacity-60" />
        </Link>
        <button
          onClick={toggleTheme}
          role="switch"
          aria-checked={dark}
          className="fetch-nav-link flex min-h-11 w-full cursor-pointer items-center gap-2 px-1 text-sm font-bold"
        >
          <NavArtwork name="Dark theme" />
          <span>{dark ? "Light theme" : "Dark theme"}</span>
          <span className={cn("fetch-theme-switch ml-auto", dark && "is-on")} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void signOut()}
          className="fetch-nav-link flex min-h-11 w-full cursor-pointer items-center gap-2 border-t border-[var(--border-subtle)] px-1 text-left text-sm text-[var(--text-secondary)] disabled:opacity-60"
        >
          <NavArtwork name="Sign out" />
          {signingOut ? "Signing out…" : mode === "account" ? "Sign out" : "Exit demo"}
          <CaretRight size={15} className="ml-auto opacity-60" />
        </button>
      </div>
  );
  return (
    <div className="min-h-[100dvh] lg:pl-[270px]">
      <a href="#app-main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="fetch-sidebar fixed inset-y-0 left-0 z-40 hidden w-[270px] flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-4 lg:flex">
        <div className="fetch-sidebar-brand"><FetchBrand /></div>
        <Link
          href={studyDestination.href}
          className="fetch-sidebar-primary mt-3 flex min-h-[52px] items-center gap-2 rounded-xl bg-[var(--action-bg)] px-3 text-sm font-extrabold text-[var(--action-text)]"
        >
          <NavArtwork name="Start studying" />
          {studyDestination.label}
          <CaretRight size={18} className="ml-auto" />
        </Link>
        <Link
          href="/app/home#add-material"
          className="fetch-sidebar-add mt-2 flex min-h-[52px] items-center gap-2 rounded-xl border border-[var(--border-strong)] px-3 text-sm font-bold"
        >
          <NavArtwork name="Add material" />
          Add material
          <CaretRight size={18} className="ml-auto opacity-60" />
        </Link>
        <nav
          aria-label="App navigation"
          className="min-h-0 flex-1 overflow-y-auto pb-3"
        >
          {navigation}
        </nav>
        <div className="fetch-account-card border border-[var(--border-subtle)] p-3 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center justify-between gap-2">
            <Image src="/assets/mascot/fetch-logo.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
            <strong className="text-[var(--text-primary)]">
              {mode === "account" ? "Your account" : "Local demo"}
            </strong>
            <p className="truncate">
              {mode === "account"
                ? status === "loading" ? "Checking account sync…" : status === "error" ? "Sync error" : "Synced to your account"
                : storageWarning ? "Storage warning" : "Saved in this browser"}
            </p></div>
            {status === "error" && mode === "account" && (
              <button
                type="button"
                onClick={retryLoad}
                className="font-bold text-[var(--fetch-blue-700)] underline"
              >
                Retry
              </button>
            )}
          </div>
          {accountActions}
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 lg:hidden">
        <FetchBrand />
        <span className="text-xs font-bold text-[var(--text-secondary)]">
          {mode === "account" ? "Account" : "Local demo"}
        </span>
      </header>
      <main id="app-main" className="min-w-0 pb-24 lg:pb-8">
        {(syncError || authError || storageWarning) && (
          <div role="alert" className="notice mx-4 mt-4 flex items-center justify-between gap-3 lg:mx-8">
            <span>{syncError || authError || storageWarning}</span>
            {syncError && mode === "account" && (
              <button
                type="button"
                onClick={retryLoad}
                className="shrink-0 font-bold underline"
              >
                Retry
              </button>
            )}
          </div>
        )}
        {children}
        <ActiveGenerationIndicator />
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      >
        {groups[0].items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={pathname === href ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-extrabold",
              pathname === href &&
                "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-800)]",
            )}
          >
            <Icon size={22} />
            {label}
          </Link>
        ))}
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-extrabold">
            <DotsThreeCircle size={22} />
            More
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
            <Dialog.Content className="fixed inset-y-0 right-0 z-[70] w-[min(340px,90vw)] overflow-y-auto bg-[var(--surface-card)] p-5">
              <div className="flex items-center justify-between">
                <Dialog.Title className="font-display text-2xl font-semibold">
                  Your workspace
                </Dialog.Title>
                <Dialog.Close
                  aria-label="Close navigation"
                  className="flex size-11 items-center justify-center"
                >
                  <X size={23} />
                </Dialog.Close>
              </div>
              <Dialog.Description className="text-sm text-[var(--text-secondary)]">
                Study tools, community, and settings.
              </Dialog.Description>
              <nav aria-label="All destinations">{navigation}{accountActions}</nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </div>
  );
}
