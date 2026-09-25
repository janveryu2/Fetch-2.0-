"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { StudentPreferences } from "@/lib/student-preferences";
import { DEFAULT_STUDENT_PREFERENCES } from "@/lib/student-preferences";

export type StudentPreferencesContextValue = {
  preferences: StudentPreferences;
  loading: boolean;
  error: string | null;
  setPreferences: (prefs: StudentPreferences) => void;
  reloadPreferences: () => Promise<void>;
};

const StudentPreferencesContext = createContext<StudentPreferencesContextValue | null>(null);

export function StudentPreferencesProvider({
  children,
  initialPreferences = DEFAULT_STUDENT_PREFERENCES,
  mode = "account",
}: {
  children: React.ReactNode;
  initialPreferences?: StudentPreferences;
  mode?: "demo" | "account";
}) {
  const [preferences, setPreferences] = useState<StudentPreferences>(initialPreferences);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadPreferences = useCallback(async () => {
    if (mode === "demo") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/study-preferences", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Failed to load study preferences");
      }
      const data = await res.json();
      if (data?.preferences) {
        setPreferences(data.preferences);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load study preferences");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const value = useMemo(
    () => ({
      preferences,
      loading,
      error,
      setPreferences,
      reloadPreferences,
    }),
    [preferences, loading, error, reloadPreferences]
  );

  return (
    <StudentPreferencesContext.Provider value={value}>
      {children}
    </StudentPreferencesContext.Provider>
  );
}

const DEFAULT_CONTEXT_VALUE: StudentPreferencesContextValue = {
  preferences: DEFAULT_STUDENT_PREFERENCES,
  loading: false,
  error: null,
  setPreferences: () => {},
  reloadPreferences: async () => {},
};

export function useStudentPreferences() {
  const ctx = useContext(StudentPreferencesContext);
  return ctx ?? DEFAULT_CONTEXT_VALUE;
}
