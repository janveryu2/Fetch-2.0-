"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm({ authConfigured }: { authConfigured: boolean }) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!authConfigured) {
      setError("Password recovery is unavailable until Supabase Auth is configured.");
      return;
    }
    setLoading(true);
    const form = new FormData(event.currentTarget);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(
        String(form.get("email") ?? "").trim(),
        { redirectTo: `${window.location.origin}/auth/callback?next=/app/reset-password` },
      );
      if (resetError) throw resetError;
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "FETCH could not send recovery instructions.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="surface-card w-full max-w-[470px] p-7 text-center sm:p-9">
      <Image src="/assets/mascot/fetch-seated.png" alt="FETCH waiting while you recover access" width={160} height={160} className="pixel-art mx-auto w-[135px]" />
      <h1 className="font-display mt-3 text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-[var(--text-secondary)]">Enter your email. If an account exists, we’ll send recovery instructions.</p>
      {sent ? (
        <p role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-sm font-bold text-emerald-950">If an account matches that address, a recovery link is on its way.</p>
      ) : (
        <form className="mt-6 text-left" onSubmit={(event) => void submit(event)}>
          <label className="block font-extrabold">Email<input name="email" type="email" autoComplete="email" required className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4" /></label>
          {error && <p role="alert" className="mt-3 text-sm font-bold text-[var(--danger)]">{error}</p>}
          <Button type="submit" disabled={!authConfigured || loading} className="mt-5 w-full">{loading ? "Sending…" : "Send recovery email"}</Button>
          {!authConfigured && <p className="mt-3 text-center text-xs text-[var(--text-secondary)]">Email delivery becomes available after Supabase Auth is configured.</p>}
        </form>
      )}
    </div>
  );
}
