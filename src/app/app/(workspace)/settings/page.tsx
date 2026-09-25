"use client";

import Image from "next/image";
import {
  Bell,
  DownloadSimple,
  Moon,
  ShieldCheck,
  Sun,
  Trash,
  User,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/components/app/demo-provider";

export default function SettingsPage() {
  const { mode, packs, attempts, events } = useDemo();
  const [name, setName] = useState("FETCH Student");
  const [username, setUsername] = useState("fetch_student");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDark(document.documentElement.dataset.theme === "dark");
      if (mode === "demo") {
        try {
          setName(localStorage.getItem("fetch-profile-name") || "FETCH Student");
          setUsername("fetch_student");
        } catch {
          // Local storage restricted
        }
      } else {
        // In account mode, load name if available in local storage or profile
        try {
          const cachedName = localStorage.getItem("fetch-account-name");
          if (cachedName) setName(cachedName);
          const cachedUser = localStorage.getItem("fetch-account-username");
          if (cachedUser) setUsername(cachedUser);
        } catch {
          // Local storage restricted
        }
      }
    });

    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === "dark"),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [mode]);

  function setTheme(nextDark: boolean) {
    setDark(nextDark);
    try {
      localStorage.setItem("fetch-theme", nextDark ? "dark" : "light");
    } catch {
      // Ignore storage restrictions for theme
    }
    document.documentElement.dataset.theme = nextDark ? "dark" : "light";
  }

  async function handleSaveProfile() {
    setNotice("");
    if (mode === "demo") {
      try {
        localStorage.setItem("fetch-profile-name", name.trim() || "FETCH Student");
        setSaved(true);
        setNotice("Your display name was saved in this browser.");
      } catch {
        setNotice("Local storage is unavailable. Your name could not be saved.");
      }
      return;
    }

    // Account mode profile save
    setSaving(true);
    try {
      localStorage.setItem("fetch-account-name", name.trim());
      setSaved(true);
      setNotice("Account profile preference updated.");
    } catch {
      setNotice("Could not update profile preferences.");
    } finally {
      setSaving(false);
    }
  }

  function handleExportData() {
    if (mode === "demo") {
      const exportData = {
        scope: "browser-demo",
        exportedAt: new Date().toISOString(),
        packs,
        attempts,
        events,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fetch-demo-study-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        `Exported browser demo data: ${packs.length} StudyPacks, ${attempts.length} attempts, and ${events.length} calendar events.`,
      );
    } else {
      const exportData = {
        scope: "account-session-cache",
        exportedAt: new Date().toISOString(),
        packs,
        attempts,
        events,
        note: "This file contains locally loaded session data. Full cloud account export is in development.",
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fetch-account-session-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Exported locally cached account data. Full server account export is in active development.",
      );
    }
  }

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 sm:px-7 lg:py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-[-.025em] sm:text-5xl">
            {mode === "account" ? "Account Settings" : "Settings"}
          </h1>
          <p className="mt-2 text-[var(--text-secondary)]">
            {mode === "account"
              ? "Manage your account profile, device appearance, and session data."
              : "Manage your appearance, browser demo identity, and local data."}
          </p>
        </div>
        <Badge tone={mode === "account" ? "success" : "neutral"}>
          {mode === "account" ? "Connected account" : "Browser demo"}
        </Badge>
      </div>

      {notice && (
        <p role="status" className="notice mt-4 text-sm">
          {notice}
        </p>
      )}

      <div className="mt-8 space-y-5">
        <section className="surface-card p-6">
          <div className="flex items-center gap-3">
            <User size={25} className="text-[var(--fetch-blue-600)]" />
            <h2 className="font-display text-2xl font-semibold">
              {mode === "account" ? "Account Profile" : "Demo Profile"}
            </h2>
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-[110px_1fr]">
            <Image
              src="/assets/mascot/fetch-logo.png"
              alt="Profile avatar"
              width={110}
              height={110}
              className="pixel-art size-[110px] rounded-2xl"
            />
            <div className="space-y-4">
              <label className="block font-extrabold">
                Full name
                <input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setSaved(false);
                  }}
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4"
                />
              </label>
              <label className="block font-extrabold">
                Username
                <input
                  value={username}
                  readOnly
                  aria-describedby="username-hint"
                  className="mt-2 min-h-12 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-subtle)] px-4"
                />
                <span id="username-hint" className="mt-1 block text-xs text-[var(--text-secondary)]">
                  {mode === "account"
                    ? "Your username is linked to your FETCH account."
                    : "Development fixture identity · Saved only in this browser."}
                </span>
              </label>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => void handleSaveProfile()}
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : mode === "account"
                      ? "Save to account"
                      : "Save in this browser"}
                </Button>
                {saved && (
                  <span
                    role="status"
                    className="text-sm font-bold text-[var(--success)]"
                  >
                    {mode === "account" ? "Saved" : "Saved in this browser"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="surface-card p-6">
          <div className="flex items-center gap-3">
            <Moon size={25} className="text-[var(--fetch-blue-600)]" />
            <h2 className="font-display text-2xl font-semibold">Appearance</h2>
          </div>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Theme preference is stored on this device.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => setTheme(false)}
              className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border font-extrabold ${!dark ? "border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-50)] text-[var(--fetch-blue-800)]" : "border-[var(--border-strong)]"}`}
            >
              <Sun /> Light
            </button>
            <button
              onClick={() => setTheme(true)}
              className={`flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border font-extrabold ${dark ? "border-[var(--fetch-blue-600)] bg-[var(--surface-subtle)] text-[var(--fetch-blue-700)]" : "border-[var(--border-strong)]"}`}
            >
              <Moon /> Dark
            </button>
          </div>
        </section>

        <section className="surface-card p-6">
          <div className="grid gap-5 sm:grid-cols-3">
            {[
              { label: "Notifications", icon: Bell },
              { label: "Privacy", icon: ShieldCheck },
              {
                label: mode === "demo" ? "Export demo data" : "Export data",
                icon: DownloadSimple,
              },
            ].map(({ label, icon: Icon }) => (
              <button
                key={label}
                onClick={() => {
                  if (label.includes("Export")) {
                    handleExportData();
                  } else if (label === "Privacy") {
                    setNotice(
                      mode === "account"
                        ? "Account StudyPacks and quiz attempts are saved in your account. Local audio is never uploaded."
                        : "StudyPacks and quiz results are saved in this browser. Local audio is never uploaded. No server profile is created.",
                    );
                  } else {
                    setNotice(
                      "Push notifications are not enabled. Study session and timer completions are announced inside FETCH.",
                    );
                  }
                }}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-4 text-left font-extrabold hover:bg-[var(--surface-subtle)]"
              >
                <Icon size={22} className="text-[var(--fetch-blue-600)]" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-red-200 bg-[var(--surface-card)] p-6">
          <div className="flex items-center gap-3 text-[var(--danger)]">
            <Trash size={24} />
            <h2 className="font-display text-2xl font-semibold">Danger zone</h2>
          </div>
          <p className="mt-3 text-[var(--text-secondary)]">
            {mode === "account"
              ? "Self-service account deletion is coming soon. Please contact your support team to request complete removal of your account data."
              : "Clear all browser-local StudyPacks, quiz attempts, and calendar events stored on this device."}
          </p>
          {mode === "demo" ? (
            <Button
              variant="secondary"
              onClick={() => {
                if (window.confirm("Are you sure you want to clear all browser demo data?")) {
                  try {
                    localStorage.removeItem("fetch-development-fixture-v1");
                    setNotice("Browser demo data cleared. Reloading workspace…");
                    setTimeout(() => window.location.reload(), 600);
                  } catch {
                    setNotice("Could not clear local storage.");
                  }
                }
              }}
              className="mt-5 text-[var(--danger)]"
            >
              Clear demo data
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled
              className="mt-5 text-[var(--danger)]"
            >
              Delete account
            </Button>
          )}
        </section>
      </div>
    </div>
  );
}
