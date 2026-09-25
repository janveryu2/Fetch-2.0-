"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, CheckCircle, Eye, EyeSlash, ShieldWarning } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const stepCopy = [
  ["What’s your email address?", "We’ll use it for sign-in and account recovery."],
  ["Nice to meet you", "Choose how you’ll appear across FETCH."],
  ["Create a secure password", "Use at least eight characters."],
  ["Review your account", "Confirm your details before getting started."],
];

export function SignupWizard({ authConfigured }: { authConfigured: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  async function createAccount() {
    if (!canContinue || loading || complete) return;

    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const allowTestSignup = searchParams?.get("test_signup") === "1";

    if (!allowTestSignup) {
      // Truthful public gate: enters development demo
      router.push("/app/home");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/app/start`,
          data: {
            display_name: name.trim(),
            username: username.toLowerCase(),
          },
        },
      });
      if (signUpError) throw signUpError;
      if (data.session && data.user) {
        const profile = {
          id: data.user.id,
          display_name: name.trim(),
          username: username.toLowerCase(),
        };
        const { error: profileError } = await supabase.from("profiles").upsert(profile, { onConflict: "id" });
        if (profileError?.code === "23505") {
          // Truthful handling: do not silently erase username; inform the user and allow choosing another
          setError(`The username @${username} is already taken. Please choose another username.`);
          setStep(1);
          return;
        }
        router.replace("/app/start");
        router.refresh();
      } else {
        setComplete(true);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "FETCH could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  const canContinue = [
    email.includes("@"),
    name.trim().length > 1 && /^[a-zA-Z0-9_]{3,20}$/.test(username),
    password.length >= 8,
    true,
  ][step];

  return (
    <div className="surface-card w-full max-w-[620px] overflow-hidden">
      <div className="border-b border-[var(--border-subtle)] p-5 sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <Badge>Step {step + 1} of 4</Badge>
          <span className="text-sm font-bold text-[var(--text-secondary)]">Account setup</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
          <div
            className="h-full rounded-full bg-[var(--fetch-blue-600)] transition-[width]"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>
      </div>
      <div className="p-6 sm:p-9">
        <Image
          src={step === 3 ? "/assets/mascot/fetch-celebrate.png" : "/assets/mascot/fetch-wave.png"}
          alt={step === 3 ? "FETCH celebrating account setup" : "FETCH welcoming a new learner"}
          width={150}
          height={150}
          className="pixel-art mx-auto w-[120px]"
        />
        <h1 className="font-display mt-3 text-center text-3xl font-semibold">{stepCopy[step][0]}</h1>
        <p className="mt-2 text-center text-[var(--text-secondary)]">{stepCopy[step][1]}</p>

        {complete && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-950"
          >
            Your account request is ready. Check {email} for the confirmation link, then sign in to continue.
          </div>
        )}
        {error && (
          <p role="alert" className="mt-5 text-sm font-bold text-[var(--danger)]">
            {error}
          </p>
        )}

        <div className="mt-7">
          {step === 0 && (
            <div>
              <label htmlFor="signup-email" className="block font-extrabold">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4"
              />
            </div>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="signup-name" className="block font-extrabold">
                  Full name
                </label>
                <input
                  id="signup-name"
                  autoComplete="name"
                  maxLength={60}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4"
                />
              </div>
              <div>
                <label htmlFor="signup-username" className="block font-extrabold">
                  Username
                </label>
                <span className="relative mt-2 flex">
                  <span className="absolute left-4 top-3 font-extrabold text-[var(--fetch-blue-700)]">@</span>
                  <input
                    id="signup-username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) =>
                      setUsername(event.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20))
                    }
                    className="min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] pl-9 pr-4"
                  />
                </span>
                <span className="mt-1 block text-xs text-[var(--text-secondary)]">
                  3-20 letters, numbers, or underscores.
                </span>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <label htmlFor="signup-password" className="block font-extrabold">
                Password
              </label>
              <span className="relative mt-2 block">
                <input
                  id="signup-password"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShow((value) => !value)}
                  className="absolute right-1 top-1 inline-flex size-10 cursor-pointer items-center justify-center rounded-lg"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeSlash /> : <Eye />}
                </button>
              </span>
              <span className="mt-1 block text-xs text-[var(--text-secondary)]">At least 8 characters</span>
            </div>
          )}
          {step === 3 && (
            <div>
              <div className="rounded-xl bg-[var(--surface-subtle)] p-5">
                <div className="flex items-center gap-3">
                  <CheckCircle size={24} weight="fill" className="text-[var(--success)]" />
                  <div>
                    <p className="font-extrabold">{name || "FETCH Student"}</p>
                    <p className="text-sm text-[var(--text-secondary)]">
                      {email} · @{username}
                    </p>
                  </div>
                </div>
              </div>

              {!authConfigured ? (
                <div className="mt-5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-sm">
                  <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                    <span>Browser Demo Mode</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Official Terms and Privacy Policy will be published before public account launch. Continuing enters the fully functional browser-local study demo.
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <div className="flex items-center gap-2 font-bold">
                    <ShieldWarning size={20} className="shrink-0 text-amber-800" />
                    <span>Public Registration Gate</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-amber-900">
                    Approved Terms of Service and Privacy Policy must be published before public self-registration is enabled. You can test your account via the sign-in page or enter the browser demo directly.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            onClick={() => (step === 0 ? router.push("/app") : setStep((value) => value - 1))}
            disabled={loading}
          >
            <ArrowLeft /> Back
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((value) => value + 1)} disabled={!canContinue}>
              Continue <ArrowRight />
            </Button>
          ) : (
            <Button
              onClick={() => void createAccount()}
              disabled={!canContinue || loading || complete}
            >
              {loading
                ? "Creating account…"
                : complete
                  ? "Confirmation sent"
                  : authConfigured
                    ? "Enter development demo"
                    : "Enter development demo"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
