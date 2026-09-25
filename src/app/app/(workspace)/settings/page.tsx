"use client";

import Image from "next/image";
import {
  Bell,
  CheckCircle,
  DownloadSimple,
  Moon,
  ShieldCheck,
  Sun,
  Trash,
  User,
  Warning,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/components/app/demo-provider";

export default function SettingsPage() {
  const router = useRouter();
  const { mode, packs, attempts, events } = useDemo();
  const [name, setName] = useState("FETCH Student");
  const [username, setUsername] = useState("fetch_student");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [dark, setDark] = useState(false);

  // Account Preferences State
  const [discoverable, setDiscoverable] = useState(true);
  const [allowDirectMessages, setAllowDirectMessages] = useState(true);
  const [studyReminders, setStudyReminders] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsSaved, setPrefsSaved] = useState(false);

  // Export State
  const [exporting, setExporting] = useState(false);

  // Deletion State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
        // In account mode, check setup params and fetch real profile from API
        try {
          const params = new URLSearchParams(window.location.search);
          if (params.get("auth") === "setup-username") {
            setNotice("Welcome to FETCH! Please set a unique @username for your account.");
          } else if (params.get("auth") === "username-taken") {
            setNotice("Your previous requested username was already claimed. Please choose a new unique @username.");
          }
        } catch {
          // Ignore location parse errors
        }

        fetch("/api/account/profile")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.profile) {
              setName(data.profile.displayName || "FETCH Student");
              setUsername(data.profile.username || "");
            }
          })
          .catch(() => {});

        fetch("/api/account/preferences")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.preferences) {
              setDiscoverable(data.preferences.discoverable ?? true);
              setAllowDirectMessages(data.preferences.allow_direct_messages ?? true);
              setStudyReminders(data.preferences.study_reminders ?? true);
            }
          })
          .catch(() => {});
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
    setErrorMessage("");
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

    // Account mode profile save via PATCH /api/account/profile
    setSaving(true);
    try {
      const payload: { displayName?: string; username?: string } = {
        displayName: name.trim() || "FETCH Student",
      };
      if (username.trim()) {
        payload.username = username.toLowerCase().trim();
      }
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const resJson = await res.json();
      if (!res.ok) {
        if (resJson.code === "USERNAME_TAKEN") {
          setErrorMessage("That username is already taken. Please choose another.");
        } else if (resJson.code === "INVALID_USERNAME_FORMAT") {
          setErrorMessage("Username must be 3-24 characters using lowercase letters, numbers, or underscores.");
        } else {
          setErrorMessage(resJson.error || "Could not update profile.");
        }
        return;
      }

      if (resJson.profile) {
        setName(resJson.profile.displayName);
        setUsername(resJson.profile.username || "");
      }
      setSaved(true);
      setNotice("Account profile updated successfully.");
    } catch {
      setErrorMessage("Could not update profile preferences.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePreferences() {
    setSavingPrefs(true);
    setPrefsSaved(false);
    setErrorMessage("");
    try {
      const res = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discoverable,
          allowDirectMessages,
          studyReminders,
        }),
      });
      const resJson = await res.json();
      if (!res.ok) {
        throw new Error(resJson.error || "Failed to update preferences.");
      }
      setPrefsSaved(true);
      setNotice("Account preferences updated successfully.");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to update preferences.");
    } finally {
      setSavingPrefs(false);
    }
  }

  async function handleExportData() {
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
      setExporting(true);
      setNotice("");
      setErrorMessage("");
      try {
        const res = await fetch("/api/account/export");
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Failed to export account data.");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const dateStr = new Date().toISOString().slice(0, 10);
        link.download = `fetch-account-data-${dateStr}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("Full account data exported successfully.");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Failed to export account data.");
      } finally {
        setExporting(false);
      }
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmInput.trim().toUpperCase() !== "DELETE") {
      setDeleteError("Confirmation must be 'DELETE' to permanently delete your account.");
      return;
    }

    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Failed to permanently delete account.");
      }

      try {
        const { createClient } = await import("@/lib/supabase/client");
        await createClient().auth.signOut();
      } catch {
        // Signout best effort
      }
      router.replace("/auth?message=account-deleted");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to permanently delete account.");
      setDeleting(false);
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
              ? "Manage your account profile, preferences, data export, and security."
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

      {errorMessage && (
        <p role="alert" className="mt-4 text-sm font-bold text-[var(--danger)]">
          {errorMessage}
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
                <span className="relative mt-2 flex">
                  <span className="absolute left-4 top-3 font-extrabold text-[var(--fetch-blue-700)]">@</span>
                  <input
                    value={username}
                    readOnly={mode === "demo"}
                    placeholder={mode === "account" ? "choose_username" : "fetch_student"}
                    onChange={(event) => {
                      if (mode === "account") {
                        setUsername(
                          event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24)
                        );
                        setSaved(false);
                        setErrorMessage("");
                      }
                    }}
                    aria-describedby="username-hint"
                    className={`min-h-12 w-full rounded-xl border border-[var(--border-strong)] ${
                      mode === "demo" ? "bg-[var(--surface-subtle)]" : "bg-[var(--surface-card)]"
                    } pl-9 pr-4`}
                  />
                </span>
                <span id="username-hint" className="mt-1 block text-xs text-[var(--text-secondary)]">
                  {mode === "account"
                    ? "3-24 characters (lowercase letters, numbers, underscores). Unique across FETCH."
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

        {mode === "account" && (
          <section className="surface-card p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck size={25} className="text-[var(--fetch-blue-600)]" />
              <h2 className="font-display text-2xl font-semibold">Account Preferences</h2>
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Control your privacy, social discovery, and notification settings across devices.
            </p>
            <div className="mt-6 space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-4 hover:bg-[var(--surface-subtle)]">
                <input
                  type="checkbox"
                  checked={discoverable}
                  onChange={(e) => {
                    setDiscoverable(e.target.checked);
                    setPrefsSaved(false);
                  }}
                  className="mt-1 size-5 rounded border-[var(--border-strong)] accent-[var(--fetch-blue-600)]"
                />
                <div>
                  <div className="font-bold text-[var(--text-primary)]">Public Discovery</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Allow other students to discover your profile and send friend requests via your @username.
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-4 hover:bg-[var(--surface-subtle)]">
                <input
                  type="checkbox"
                  checked={allowDirectMessages}
                  onChange={(e) => {
                    setAllowDirectMessages(e.target.checked);
                    setPrefsSaved(false);
                  }}
                  className="mt-1 size-5 rounded border-[var(--border-strong)] accent-[var(--fetch-blue-600)]"
                />
                <div>
                  <div className="font-bold text-[var(--text-primary)]">Direct Messages</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Allow accepted friends to start 1-on-1 direct message conversations with you.
                  </div>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-subtle)] p-4 hover:bg-[var(--surface-subtle)]">
                <input
                  type="checkbox"
                  checked={studyReminders}
                  onChange={(e) => {
                    setStudyReminders(e.target.checked);
                    setPrefsSaved(false);
                  }}
                  className="mt-1 size-5 rounded border-[var(--border-strong)] accent-[var(--fetch-blue-600)]"
                />
                <div>
                  <div className="font-bold text-[var(--text-primary)]">Study Reminders</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Receive session announcements, schedule reminders, and progress milestones.
                  </div>
                </div>
              </label>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={() => void handleSavePreferences()}
                  disabled={savingPrefs}
                >
                  {savingPrefs ? "Saving preferences…" : "Save preferences"}
                </Button>
                {prefsSaved && (
                  <span role="status" className="flex items-center gap-1 text-sm font-bold text-[var(--success)]">
                    <CheckCircle size={18} /> Preferences saved
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

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
                label: exporting
                  ? "Exporting…"
                  : mode === "demo"
                    ? "Export demo data"
                    : "Export account data",
                icon: DownloadSimple,
              },
            ].map(({ label, icon: Icon }) => (
              <button
                key={label}
                disabled={exporting}
                onClick={() => {
                  if (label.includes("Export")) {
                    void handleExportData();
                  } else if (label === "Privacy") {
                    setNotice(
                      mode === "account"
                        ? "Account StudyPacks and quiz attempts are saved securely in your cloud account. Local audio is never uploaded."
                        : "StudyPacks and quiz results are saved in this browser. Local audio is never uploaded. No server profile is created.",
                    );
                  } else {
                    setNotice(
                      mode === "account"
                        ? "Session completions and study timers are announced inside the workspace. Push notifications can be configured in preferences."
                        : "Push notifications are not enabled. Study session and timer completions are announced inside FETCH.",
                    );
                  }
                }}
                className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-[var(--border-subtle)] px-4 text-left font-extrabold hover:bg-[var(--surface-subtle)] disabled:opacity-50"
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
              ? "Permanently delete your account and all associated StudyPacks, quiz attempts, study history, calendar events, and private files."
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
          ) : !showDeleteConfirm ? (
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(true)}
              className="mt-5 text-[var(--danger)] hover:bg-red-50"
            >
              Delete account
            </Button>
          ) : (
            <div className="mt-5 space-y-4 rounded-xl border border-red-300 bg-red-50/50 p-4">
              <div className="flex items-start gap-2 text-sm text-[var(--danger)]">
                <Warning size={20} className="shrink-0" />
                <p>
                  <strong>Warning:</strong> This action is irreversible. All of your StudyPacks, answer histories, PDF uploads, calendar events, and friendships will be deleted immediately.
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-[var(--text-primary)]">
                  To confirm, type <span className="font-mono text-red-600">DELETE</span> below:
                  <input
                    value={deleteConfirmInput}
                    onChange={(e) => {
                      setDeleteConfirmInput(e.target.value);
                      setDeleteError("");
                    }}
                    placeholder="DELETE"
                    className="mt-2 min-h-11 w-full rounded-xl border border-red-300 bg-[var(--surface-card)] px-3 font-mono text-sm"
                  />
                </label>
              </div>

              {deleteError && (
                <p role="alert" className="text-sm font-bold text-[var(--danger)]">
                  {deleteError}
                </p>
              )}

              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  disabled={deleteConfirmInput.trim().toUpperCase() !== "DELETE" || deleting}
                  onClick={() => void handleDeleteAccount()}
                  className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {deleting ? "Deleting account…" : "Permanently delete account"}
                </Button>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmInput("");
                    setDeleteError("");
                  }}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
