"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirm") ?? "")) {
      setError("Those passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("This recovery link is invalid or has expired. Request a new one.");
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setComplete(true);
      window.setTimeout(() => {
        router.replace("/app/home");
        router.refresh();
      }, 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "FETCH could not update your password.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="surface-card w-full max-w-[470px] p-7 sm:p-9"><h1 className="font-display text-3xl font-semibold">Choose a new password</h1><p className="mt-2 text-[var(--text-secondary)]">Use at least eight characters.</p>{complete ? <p role="status" className="mt-6 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-950">Password updated. Taking you to FETCH…</p> : <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4"><label className="block font-extrabold">New password<input name="password" type="password" minLength={8} autoComplete="new-password" required className="field mt-2" /></label><label className="block font-extrabold">Confirm password<input name="confirm" type="password" minLength={8} autoComplete="new-password" required className="field mt-2" /></label>{error && <p role="alert" className="text-sm font-bold text-[var(--danger)]">{error}</p>}<Button disabled={loading} className="w-full">{loading ? "Updating…" : "Update password"}</Button></form>}</div>;
}
