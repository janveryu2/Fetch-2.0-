"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CalendarEvent, StudyAttempt, StudyPack } from "@/lib/demo-types";

export type WorkspaceStatus = "loading" | "ready" | "error";

export type DemoState = {
  mode: "demo" | "account";
  ready: boolean;
  status: WorkspaceStatus;
  syncError: string;
  storageWarning: string;
  tutorAvailable: boolean;
  userId?: string;
  packs: StudyPack[];
  attempts: StudyAttempt[];
  events: CalendarEvent[];
  retryLoad: () => void;
  syncPack: (packId: string) => Promise<StudyPack>;
  addPack: (pack: StudyPack) => void;
  addAttempt: (attempt: StudyAttempt) => void;
  addEvent: (event: CalendarEvent) => void;
  removeEvent: (id: string) => void;
};

const DemoContext = createContext<DemoState | null>(null);
const storageKey = "fetch-development-fixture-v1";

export function DemoProvider({
  children,
  mode,
  userId,
  tutorAvailable = false,
}: {
  children: React.ReactNode;
  mode: "demo" | "account";
  userId?: string;
  tutorAvailable?: boolean;
}) {
  const [packs, setPacks] = useState<StudyPack[]>([]);
  const [attempts, setAttempts] = useState<StudyAttempt[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [status, setStatus] = useState<WorkspaceStatus>("loading");
  const [syncError, setSyncError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [reloadTrigger, setReloadTrigger] = useState(0);
  const packVersion = useRef(0);
  const packUpdates = useRef(new Map<string, number>());

  const retryLoad = useCallback(() => {
    setStatus("loading");
    setSyncError("");
    setReloadTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    let active = true;
    if (mode === "account") {
      const readVersion = packVersion.current;
      void fetch("/api/workspace", { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json()) as {
            error?: string;
            packs?: StudyPack[];
            attempts?: StudyAttempt[];
            events?: CalendarEvent[];
          };
          if (!response.ok) throw new Error(data.error || "Your account data could not be loaded.");
          if (!active) return;
          // Retain only mutations newer than this read; explicit reloads can still
          // remove records no longer present on the server.
          const updatedIds = new Set([...packUpdates.current].filter(([, version]) => version > readVersion).map(([id]) => id));
          setPacks((current) => [
            ...current.filter((pack) => updatedIds.has(pack.id)),
            ...(data.packs ?? []).filter((pack) => !updatedIds.has(pack.id)),
          ]);
          setAttempts(data.attempts ?? []);
          setEvents(data.events ?? []);
          setSyncError("");
          setStatus("ready");
        })
        .catch((error: unknown) => {
          if (active) {
            setSyncError(error instanceof Error ? error.message : "Your account data could not be loaded.");
            setStatus("error");
          }
        });
      return () => {
        active = false;
      };
    }

    // Demo mode: read from localStorage
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Pick<
              DemoState,
              "packs" | "attempts" | "events"
            >;
            if (active) {
              setPacks(Array.isArray(parsed.packs) ? parsed.packs : []);
              setAttempts(Array.isArray(parsed.attempts) ? parsed.attempts : []);
              setEvents(Array.isArray(parsed.events) ? parsed.events : []);
            }
          } catch {
            // Do not delete corrupted data; preserve memory state and warn
            if (active) {
              setStorageWarning("Browser study data could not be fully parsed. Working in memory for this session.");
            }
          }
        }
      } catch {
        if (active) {
          setStorageWarning("Browser storage is disabled or blocked. Sessions will not persist across reloads.");
        }
      } finally {
        if (active) {
          setStatus("ready");
        }
      }
    });

    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [mode, reloadTrigger]);

  useEffect(() => {
    if (status === "ready" && mode === "demo") {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ packs, attempts, events }),
        );
      } catch {
        const frame = requestAnimationFrame(() => {
          setStorageWarning("Browser storage is full or unavailable. New changes might not survive a reload.");
        });
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [attempts, events, mode, packs, status]);

  const addPack = useCallback(
    (pack: StudyPack) => {
      packUpdates.current.set(pack.id, ++packVersion.current);
      setPacks((current) => [pack, ...current.filter((item) => item.id !== pack.id)]);
    },
    [],
  );
  const syncPack = useCallback(async (packId: string) => {
    const response = await fetch(`/api/workspace?packId=${encodeURIComponent(packId)}`, { cache: "no-store" });
    const data = await response.json() as { error?: string; packs?: StudyPack[] };
    if (!response.ok) throw new Error(data.error || "Your saved StudyPack could not be loaded.");
    const pack = data.packs?.find((item) => item.id === packId);
    if (!pack) throw new Error("Your StudyPack is not available yet. Try loading it again.");
    addPack(pack);
    return pack;
  }, [addPack]);
  const addAttempt = useCallback(
    (attempt: StudyAttempt) => setAttempts((current) => [attempt, ...current]),
    [],
  );
  const addEvent = useCallback(
    (event: CalendarEvent) =>
      setEvents((current) => [
        event,
        ...current.filter((item) => item.id !== event.id),
      ]),
    [],
  );
  const removeEvent = useCallback(
    (id: string) =>
      setEvents((current) => current.filter((event) => event.id !== id)),
    [],
  );

  const value = useMemo(
    () => ({
      mode,
      ready: status === "ready",
      status,
      syncError,
      storageWarning,
      tutorAvailable,
      userId,
      packs,
      attempts,
      events,
      retryLoad,
      syncPack,
      addPack,
      addAttempt,
      addEvent,
      removeEvent,
    }),
    [
      mode,
      status,
      syncError,
      storageWarning,
      tutorAvailable,
      userId,
      packs,
      attempts,
      events,
      retryLoad,
      syncPack,
      addPack,
      addAttempt,
      addEvent,
      removeEvent,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("useDemo must be used inside DemoProvider");
  return context;
}
