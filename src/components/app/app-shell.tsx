"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarBlank,
  ChartLineUp,
  ChatCircleDots,
  Gear,
  Handshake,
  House,
  Moon,
  Plus,
  SignOut,
  Stack,
  Sun,
  Trophy,
  GameController,
  DotsThreeCircle,
  Sparkle,
  Timer,
  MusicNotes,
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
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { packs, attempts, mode, status, syncError, storageWarning, retryLoad } = useDemo();
  const activeDraft = useSyncExternalStore(
    subscribeToStorage,
    () => getActiveDraftSnapshot(mode === "account" ? "account" : "demo"),
    getServerSnapshot,
  );
  const studyDestination = resolveStudyDestination({
    scopeId: mode === "account" ? "account" : "demo",
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
          <p className="mb-1 px-3 text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-tertiary)]">
            {group.name}
          </p>
          {group.items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold no-underline transition-colors",
                  active
                    ? "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-800)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                <Icon size={21} weight={active ? "fill" : "regular"} />
                {label}
                {active && (
                  <span className="ml-auto size-1.5 rounded-full bg-current" />
                )}
              </Link>
            );
          })}
        </div>
      ))}
      <div className="mt-5 border-t border-[var(--border-subtle)] pt-3">
        <Link
          href="/app/settings"
          aria-current={pathname === "/app/settings" ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold",
            pathname === "/app/settings" &&
              "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-800)]",
          )}
        >
          <Gear size={21} />
          Settings
        </Link>
        <button
          onClick={toggleTheme}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 text-sm font-bold"
        >
          {dark ? <Sun size={21} /> : <Moon size={21} />}{" "}
          {dark ? "Light theme" : "Dark theme"}
        </button>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void signOut()}
          className="flex min-h-11 w-full cursor-pointer items-center gap-3 px-3 text-left text-sm text-[var(--text-secondary)] disabled:opacity-60"
        >
          <SignOut size={21} />
          {signingOut ? "Signing out…" : mode === "account" ? "Sign out" : "Exit demo"}
        </button>
      </div>
    </>
  );
  return (
    <div className="min-h-[100dvh] lg:pl-[248px]">
      <a href="#app-main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 py-5 lg:flex">
        <FetchBrand />
        <Link
          href={studyDestination.href}
          className="mt-6 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--action-bg)] text-sm font-extrabold text-[var(--action-text)]"
        >
          <GameController size={21} />
          {studyDestination.label}
        </Link>
        <Link
          href="/app/home#add-material"
          className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] text-sm font-bold"
        >
          <Plus size={18} />
          Add material
        </Link>
        <nav
          aria-label="App navigation"
          className="min-h-0 flex-1 overflow-y-auto pb-3"
        >
          {navigation}
        </nav>
        <div className="border-t border-[var(--border-subtle)] pt-3 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center justify-between">
            <strong className="text-[var(--text-primary)]">
              {mode === "account" ? "Your account" : "Local demo"}
            </strong>
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
          <p className="mt-0.5">
            {mode === "account"
              ? status === "loading"
                ? "Checking account sync…"
                : status === "error"
                  ? "Sync error · Cloud data unavailable"
                  : "Synced to your account"
              : storageWarning
                ? "Storage warning · Working in memory"
                : "Saved in this browser"}
          </p>
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
              <nav aria-label="All destinations">{navigation}</nav>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </div>
  );
}
