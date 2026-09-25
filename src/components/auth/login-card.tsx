"use client";

import { Eye, EyeSlash, GraduationCap } from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function LoginCard({ authConfigured }: { authConfigured: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmationFailed, setConfirmationFailed] = useState(false);
  const [usernameConflict, setUsernameConflict] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("auth") === "confirmation-failed") {
          setConfirmationFailed(true);
        } else if (params.get("auth") === "username-taken") {
          setUsernameConflict(true);
        }
      } catch {
        // Ignore location parse errors
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authConfigured || loading) return;
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
      router.replace("/app/home");
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
        <Image src="/assets/mascot/fetch-wave.png" alt="FETCH waving hello" width={190} height={190} priority className="pixel-art mx-auto -mt-4 w-[150px] sm:w-[180px]" />
        <Badge className="mt-1">FETCH</Badge>
        <h1 className="font-display mt-4 text-3xl font-semibold tracking-[-.02em]">Welcome back to the pack</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Log in and let FETCH help you prepare for your next exam.</p>
      </div>
      {confirmationFailed && (
        <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-900">
          Email confirmation could not be verified. The link may have expired or is invalid. Please sign in or use the development demo.
        </div>
      )}
      {usernameConflict && (
        <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-950">
          Your email was confirmed! However, your requested username was already claimed. You can set a unique @username in Settings once signed in.
        </div>
      )}
      {!authConfigured && <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">Production login is waiting for Supabase credentials. Development demo mode is ready below.</div>}
      <form className="mt-6 space-y-4" onSubmit={(event) => void signIn(event)}>
        <label className="block font-bold">Email
          <input name="email" type="email" autoComplete="email" required className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]" placeholder="you@example.com" />
        </label>
        <label className="block font-bold">Password
          <span className="relative mt-2 block">
            <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required className="min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 pr-12 text-[var(--text-primary)]" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeSlash size={21} /> : <Eye size={21} />}</button>
          </span>
        </label>
        {error && <p role="alert" className="text-sm font-bold text-[var(--danger)]">{error}</p>}
        <Button type="submit" className="w-full" disabled={!authConfigured || loading}>{loading ? "Signing in…" : "Log In"}</Button>
      </form>
      <div className="mt-4 text-center"><Link href="/app/forgot-password" className="font-bold text-[var(--fetch-blue-700)]">Forgot password?</Link></div>
      <button type="button" onClick={() => router.push("/app/home")} className="mt-5 flex min-h-14 w-full cursor-pointer items-center justify-center gap-3 rounded-[13px] border border-[var(--fetch-blue-200)] bg-[var(--fetch-blue-50)] px-5 font-extrabold text-[var(--fetch-blue-800)] hover:bg-[var(--fetch-blue-100)]"><GraduationCap size={22} weight="duotone" /> Try the development demo</button>
      <p className="mt-2 text-center text-sm text-[var(--text-secondary)]">Local fixture data stays in this browser.</p>
      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">Don&apos;t have an account? <Link href="/app/signup" className="font-extrabold text-[var(--fetch-blue-700)]">Sign up</Link></p>
    </div>
  );
}
