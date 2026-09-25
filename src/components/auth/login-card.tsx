"use client";

import { Eye, EyeSlash, GraduationCap } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function GoogleIcon() {
  return (
    <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

export function LoginCard({ authConfigured }: { authConfigured: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationFailed, setConfirmationFailed] = useState(false);
  const [usernameConflict, setUsernameConflict] = useState(false);
  const [oauthCancelled, setOauthCancelled] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const authParam = params.get("auth");
        if (authParam === "confirmation-failed") {
          setConfirmationFailed(true);
        } else if (authParam === "username-taken") {
          setUsernameConflict(true);
        } else if (authParam === "access_denied" || authParam === "oauth-cancelled") {
          setOauthCancelled(true);
        }
      } catch {
        // Ignore location parse errors
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function signInWithGoogle() {
    if (!authConfigured || loading || googleLoading) return;
    setError("");
    setGoogleLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error: authError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/app/start`,
        },
      });
      if (authError) throw authError;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "FETCH could not connect to Google sign-in.");
      setGoogleLoading(false);
    }
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authConfigured || loading || googleLoading) return;
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error: authError } = await createClient().auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (authError) throw authError;
      router.replace("/app/start");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "FETCH could not sign you in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface-card w-full max-w-[470px] p-6 sm:p-9">
      <div className="text-center">
        <Image
          src="/assets/mascot/fetch-wave.png"
          alt="FETCH waving hello"
          width={190}
          height={190}
          priority
          className="pixel-art mx-auto -mt-4 w-[150px] sm:w-[180px]"
        />
        <Badge className="mt-1">FETCH</Badge>
        <h1 className="font-display mt-4 text-3xl font-semibold tracking-[-.02em]">Welcome back to the pack</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Log in and let FETCH help you prepare for your next exam.</p>
      </div>

      {confirmationFailed && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">
          Email confirmation or sign-in link could not be verified. It may have expired or is invalid. Please try again or use the development demo.
        </div>
      )}

      {oauthCancelled && (
        <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
          Sign-in was cancelled. Please try again when you are ready.
        </div>
      )}

      {usernameConflict && (
        <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
          Your account was confirmed! However, your requested username was already claimed. You can set a unique @username in Settings once signed in.
        </div>
      )}

      {!authConfigured && (
        <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
          Production login is waiting for Supabase credentials. Development demo mode is ready below.
        </div>
      )}

      {/* Google OAuth Button */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={!authConfigured || loading || googleLoading}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 font-bold text-[var(--text-primary)] shadow-sm hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GoogleIcon />
          <span>{googleLoading ? "Connecting to Google…" : "Continue with Google"}</span>
        </button>
      </div>

      <div className="relative my-6 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border-subtle)]" />
        </div>
        <span className="relative bg-[var(--surface-card)] px-3 text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
          or with email
        </span>
      </div>

      <form className="space-y-4" onSubmit={(event) => void signIn(event)}>
        <label className="block font-bold">
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]"
            placeholder="you@example.com"
          />
        </label>
        <label className="block font-bold">
          Password
          <span className="relative mt-2 block">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              className="min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 pr-12 text-[var(--text-primary)]"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="absolute right-1 top-1 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeSlash size={21} /> : <Eye size={21} />}
            </button>
          </span>
        </label>
        {error && <p role="alert" className="text-sm font-bold text-[var(--danger)]">{error}</p>}
        <Button type="submit" className="w-full" disabled={!authConfigured || loading || googleLoading}>
          {loading ? "Signing in…" : "Log In"}
        </Button>
      </form>

      <div className="mt-4 text-center">
        <Link href="/app/forgot-password" className="font-bold text-[var(--fetch-blue-700)]">
          Forgot password?
        </Link>
      </div>

      <button
        type="button"
        onClick={() => router.push("/app/home")}
        className="mt-5 flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-[13px] border border-[var(--fetch-blue-200)] bg-[var(--fetch-blue-50)] px-5 font-extrabold text-[var(--fetch-blue-800)] hover:bg-[var(--fetch-blue-100)]"
      >
        <GraduationCap size={22} weight="duotone" /> Try the development demo
      </button>
      <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">Local fixture data stays in this browser.</p>
      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        Don&apos;t have an account? <Link href="/app/signup" className="font-extrabold text-[var(--fetch-blue-700)]">Sign up</Link>
      </p>
    </div>
  );
}
