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
import { useMobileKeyboard } from "@/components/app/use-mobile-keyboard";

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
const navIconMap: Record<string, string> = {
  "Start studying": "/assets/icons/nav/start-studying.png",
  "Add material": "/assets/icons/nav/add-material.png",
  Home: "/assets/icons/nav/home.png",
  StudyPacks: "/assets/icons/nav/studypacks.png",
  Progress: "/assets/icons/nav/progress.png",
  Calendar: "/assets/icons/nav/calendar.png",
  "FETCH AI Tutor": "/assets/icons/nav/tutor.png",
  "Pomodoro Timer": "/assets/icons/nav/pomodoro.png",
  "Music Studio": "/assets/icons/nav/music.png",
  Live: "/assets/icons/nav/live.png",
  Friends: "/assets/icons/nav/friends.png",
  Messages: "/assets/icons/nav/messages.png",
  Settings: "/assets/icons/nav/settings.png",
  "Dark theme": "/assets/icons/nav/dark-theme.png",
  "Sign out": "/assets/icons/nav/sign-out.png",
  "Cloud sync": "/assets/icons/nav/cloud-sync.png",
};

function NavArtwork({ name, size = 36 }: { name: string; size?: number }) {
  const iconSrc = navIconMap[name] ?? "/assets/icons/nav/home.png";
  return (
    <Image
      src={iconSrc}
      alt=""
      width={size * 2}
      height={size * 2}
      className="shrink-0 object-contain"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden="true"
    />
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  useMobileKeyboard();
  const pathname = usePathname();
  const contextualItem = groups.flatMap(group => group.items).find(item =>
    ["/app/tutor", "/app/music", "/app/friends", "/app/live", "/app/calendar", "/app/messages"].includes(item.href) && pathname.startsWith(item.href)
  ) ?? groups[1].items[2];
  const mobileItems = [groups[0].items[0], groups[0].items[1], groups[1].items[1], contextualItem];
  const isActive = (href: string) => pathname.startsWith(href) ||
    (href === "/app/study-packs" && (pathname.startsWith("/app/study/") || pathname.startsWith("/app/study-flashcards/")));
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
        <div key={group.name} className="mt-4">
          <p className="fetch-nav-heading mb-1.5 px-2 text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
            {group.name}
          </p>
          <div className="space-y-0.5">
            {group.items.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "fetch-nav-link flex min-h-[46px] items-center gap-2.5 rounded-xl px-2 text-sm font-bold no-underline transition-all",
                    active
                      ? "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-700)] font-extrabold shadow-xs"
                      : "text-[var(--text-secondary)] hover:bg-[var(--fetch-blue-50)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <NavArtwork name={label} size={34} />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <CaretRight
                    size={15}
                    weight="bold"
                    className={cn("shrink-0", active ? "text-[var(--fetch-blue-600)] opacity-100" : "opacity-35")}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );

  const accountCardContent = (
    <div className="fetch-account-card rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 text-xs">
      <Link
        href="/app/settings"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-[var(--surface-subtle)]"
      >
        <div className="relative size-9 shrink-0">
          <Image
            src="/assets/mascot/fetch-logo.png"
            alt=""
            width={36}
            height={36}
            className="size-9 rounded-xl object-cover"
          />
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-[#10b981] ring-2 ring-[var(--surface-card)]" />
        </div>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-xs font-bold text-[var(--text-primary)]">
            {mode === "account" ? "Your account" : "Local demo"}
          </strong>
          <span className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] truncate">
            <Image
              src="/assets/icons/nav/cloud-sync.png"
              alt=""
              width={13}
              height={13}
              className="inline size-3.5 shrink-0"
            />
            {mode === "account"
              ? status === "loading"
                ? "Checking sync…"
                : status === "error"
                  ? "Sync error"
                  : "Synced to your account"
              : storageWarning
                ? "Storage warning"
                : "Saved in this browser"}
          </span>
        </div>
        <CaretRight size={14} weight="bold" className="shrink-0 opacity-40" />
      </Link>

      {status === "error" && mode === "account" && (
        <div className="px-2 py-1">
          <button
            type="button"
            onClick={retryLoad}
            className="text-[11px] font-bold text-[var(--fetch-blue-700)] underline"
          >
            Retry account sync
          </button>
        </div>
      )}

      <div className="mt-2 border-t border-[var(--border-subtle)] pt-1 space-y-0.5">
        <Link
          href="/app/settings"
          aria-current={pathname === "/app/settings" ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={cn(
            "fetch-nav-link flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-bold transition-colors",
            pathname === "/app/settings"
              ? "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-700)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]",
          )}
        >
          <NavArtwork name="Settings" size={24} />
          <span className="flex-1">Settings</span>
          <CaretRight size={13} weight="bold" className="opacity-40" />
        </Link>
        <button
          type="button"
          onClick={toggleTheme}
          role="switch"
          aria-checked={dark}
          aria-label="Toggle dark theme"
          className="fetch-nav-link flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] transition-colors"
        >
          <NavArtwork name="Dark theme" size={24} />
          <span className="flex-1 text-left">Dark theme</span>
          <span className={cn("fetch-theme-switch ml-auto", dark && "is-on")} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void signOut()}
          className="fetch-nav-link flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-60"
        >
          <NavArtwork name="Sign out" size={24} />
          <span className="flex-1">{signingOut ? "Signing out…" : mode === "account" ? "Sign out" : "Exit demo"}</span>
          <CaretRight size={13} weight="bold" className="opacity-40" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="fetch-app-shell min-h-[100dvh] lg:pl-[270px]">
      <a href="#app-main" className="skip-link">
        Skip to workspace
      </a>
      <aside className="fetch-sidebar fixed inset-y-0 left-0 z-40 hidden w-[270px] flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-card)] px-3.5 py-3.5 lg:flex">
        {/* Brand Card with subtle paw watermark */}
        <div className="fetch-sidebar-brand flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5 shadow-xs">
          <Link href="/app/home" className="flex items-center gap-2.5 no-underline">
            <Image
              src="/assets/mascot/fetch-logo.png"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-xl"
              priority
            />
            <div>
              <span className="font-display block text-base font-black tracking-tight text-[var(--text-primary)] leading-none">
                FETCH
              </span>
              <span className="mt-0.5 block text-[9px] font-black tracking-widest text-[var(--fetch-blue-600)] leading-none">
                STUDY BUDDY
              </span>
            </div>
          </Link>
          <div className="text-[var(--fetch-blue-300)] pr-1" aria-hidden="true">
            <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
              <ellipse cx="6.5" cy="8" rx="2" ry="2.5" />
              <ellipse cx="11" cy="5" rx="2" ry="2.5" />
              <ellipse cx="16" cy="6" rx="2" ry="2.5" />
              <ellipse cx="19.5" cy="10" rx="1.8" ry="2.2" />
              <path d="M7.5 15.5c0-2.5 2-4 5-4s5 1.5 5 4c0 3-2 5-5 5s-5-2-5-5z" />
            </svg>
          </div>
        </div>

        {/* Primary CTAs */}
        <Link
          href={studyDestination.href}
          className="fetch-sidebar-primary mt-3 flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#0066FF] to-[#1272FF] px-2.5 text-sm font-extrabold text-white shadow-md transition-transform active:scale-[0.98]"
        >
          <NavArtwork name="Start studying" size={32} />
          <span className="truncate">{studyDestination.label}</span>
          <CaretRight size={16} weight="bold" className="ml-auto shrink-0" />
        </Link>
        <Link
          href="/app/home#add-material"
          className="fetch-sidebar-add mt-1.5 flex min-h-[48px] items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2.5 text-sm font-bold text-[var(--text-primary)] shadow-xs transition-colors hover:bg-[var(--fetch-blue-50)]"
        >
          <NavArtwork name="Add material" size={32} />
          <span>Add material</span>
          <CaretRight size={16} weight="bold" className="ml-auto shrink-0 opacity-40" />
        </Link>

        {/* Nav Links scrollable region */}
        <nav
          aria-label="App navigation"
          className="min-h-0 flex-1 overflow-y-auto py-2 my-1"
        >
          {navigation}
        </nav>

        {/* Account Card at bottom */}
        {accountCardContent}
      </aside>
      <header className="fetch-mobile-header sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 lg:hidden">
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
        className="fetch-mobile-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      >
        {mobileItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className={cn(
              "flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-extrabold",
              isActive(href) &&
                "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-800)]",
            )}
          >
            <Icon size={22} weight={isActive(href) ? "fill" : "regular"} />
            {label === "Pomodoro Timer" ? "Pomodoro" : label === "Music Studio" ? "Music" : label === "FETCH AI Tutor" ? "Tutor" : label}
          </Link>
        ))}
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger className="flex min-h-12 flex-col items-center justify-center gap-1 text-[10px] font-extrabold">
            <DotsThreeCircle size={22} />
            More
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
            <Dialog.Content className="fetch-more-sheet fixed z-[70] overflow-y-auto bg-[var(--surface-card)] p-5">
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
              <nav aria-label="All destinations" className="fetch-more-grid">
                {groups.flatMap(group => group.items).map(({ href, label, icon: Icon }) => (
                  <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={isActive(href) ? "page" : undefined}>
                    <Icon size={23} />{label}
                  </Link>
                ))}
              </nav>
              <div className="fetch-more-account mt-4">{accountCardContent}</div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </div>
  );
}
