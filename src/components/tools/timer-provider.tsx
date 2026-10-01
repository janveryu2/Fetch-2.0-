"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { Timer, X } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
import {
  createInitialTimer,
  restoreTimer,
  tickTimer,
  timerText,
  type FocusTimer,
  type TimerMode,
} from "@/lib/focus-timer";
import { useDemo } from "@/components/app/demo-provider";
import { playStudySound } from "@/lib/audio/sound-controller";
import {
  sendStudyNotification,
  requestNotificationPermission,
} from "@/lib/notifications/study-notifications";

export interface TimerContextValue {
  timer: FocusTimer;
  setTimer: Dispatch<SetStateAction<FocusTimer>>;
  ready: boolean;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
  requestNotifications: () => Promise<boolean>;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: (mode?: TimerMode) => void;
}

const Context = createContext<TimerContextValue | null>(null);

export function TimerProvider({
  children,
  preferredFocusMinutes = 25,
}: {
  children: React.ReactNode;
  preferredFocusMinutes?: number;
}) {
  const { userId, mode } = useDemo();
  const pathname = usePathname();
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const [timer, setTimer] = useState<FocusTimer>(() => createInitialTimer(preferredFocusMinutes));
  const [ready, setReady] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const queuedFocusMinutesRef = useRef<number | null>(null);
  const initialMountRef = useRef(true);
  const hasAnnouncedCompletionRef = useRef(false);

  const storageKey = mode === "account" && userId ? `fetch-focus-v1:${userId}` : "fetch-focus-v1:demo";

  const setSoundEnabled = (val: boolean) => {
    setSoundEnabledState(val);
    try {
      localStorage.setItem("fetch-timer-sound", String(val));
    } catch {}
  };

  const setNotificationsEnabled = (val: boolean) => {
    setNotificationsEnabledState(val);
    try {
      localStorage.setItem("fetch-timer-notifications", String(val));
    } catch {}
  };

  const requestNotifications = async (): Promise<boolean> => {
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotificationsEnabled(true);
    }
    return granted;
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        // Read browser preferences after hydration so saved switches match SSR.
        const sound = localStorage.getItem("fetch-timer-sound");
        const notifications = localStorage.getItem("fetch-timer-notifications");
        if (sound !== null) setSoundEnabledState(sound === "true");
        if (notifications !== null) setNotificationsEnabledState(notifications === "true");
        let loaded: FocusTimer | null = null;
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          loaded = restoreTimer(JSON.parse(raw), Date.now());
        } else if (mode === "demo") {
          // One-time legacy migration for demo mode only
          const legacy = localStorage.getItem("fetch-focus-v1");
          if (legacy) {
            loaded = restoreTimer(JSON.parse(legacy), Date.now());
          }
        }

        if (loaded) {
          // If loaded timer is an idle, unstarted Focus session and preferredFocusMinutes is different,
          // update Focus duration to preferredFocusMinutes
          const isIdleUnstartedFocus =
            loaded.mode === "Focus" &&
            loaded.endAt === null &&
            !loaded.completed &&
            loaded.remaining === loaded.durations.Focus * 60;

          if (isIdleUnstartedFocus && loaded.durations.Focus !== preferredFocusMinutes) {
            loaded = {
              ...loaded,
              durations: { ...loaded.durations, Focus: preferredFocusMinutes },
              remaining: preferredFocusMinutes * 60,
            };
          }
          setTimer(loaded);
        } else {
          setTimer(createInitialTimer(preferredFocusMinutes));
        }
      } catch {
        setTimer(createInitialTimer(preferredFocusMinutes));
      }
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey, mode, preferredFocusMinutes]);

  // When preferredFocusMinutes updates at runtime (e.g. Settings Save)
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }

    setTimer((current) => {
      const isRunningOrPaused =
        current.endAt !== null ||
        (current.mode === "Focus" && current.remaining < current.durations.Focus * 60);

      if (isRunningOrPaused) {
        // Queue new default without mutating running countdown
        queuedFocusMinutesRef.current = preferredFocusMinutes;
        return current;
      }

      // Idle Focus timer: apply immediately
      if (current.mode === "Focus") {
        return {
          ...current,
          durations: { ...current.durations, Focus: preferredFocusMinutes },
          remaining: preferredFocusMinutes * 60,
        };
      }

      return {
        ...current,
        durations: { ...current.durations, Focus: preferredFocusMinutes },
      };
    });
  }, [preferredFocusMinutes]);

  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(timer));
      } catch {}
    }
  }, [timer, ready, storageKey]);

  useEffect(() => {
    const update = () => {
      setTimer((t) => {
        const ticked = tickTimer(t, Date.now());
        // If session finished and queued focus minutes exist, apply for next session preparation
        if (ticked.completed && queuedFocusMinutesRef.current) {
          const queued = queuedFocusMinutesRef.current;
          queuedFocusMinutesRef.current = null;
          return {
            ...ticked,
            durations: { ...ticked.durations, Focus: queued },
          };
        }
        return ticked;
      });
    };
    const id = setInterval(update, 500);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  // Trigger sound & notification once upon session completion
  useEffect(() => {
    if (timer.completed) {
      if (hasAnnouncedCompletionRef.current) return;
      hasAnnouncedCompletionRef.current = true;

      // Stable token across tabs & reloads using mode, duration, and session start
      const sessionToken = `completion-${timer.mode}-${timer.durations[timer.mode]}-${timer.packId || "general"}`;

      // Check cross-tab deduplication
      try {
        const lastAnnounced = localStorage.getItem("fetch-timer-last-announced");
        if (lastAnnounced === sessionToken) {
          return;
        }
        localStorage.setItem("fetch-timer-last-announced", sessionToken);
      } catch {}

      if (soundEnabled) {
        void playStudySound("complete-alarm", sessionToken, { soundEnabled });
        void playStudySound("complete-bark", `${sessionToken}-bark`, { soundEnabled });
      }
      if (notificationsEnabled) {
        sendStudyNotification(`${timer.mode} session complete!`, {
          body:
            timer.mode === "Focus"
              ? "Great work! Take a short break or start your next session."
              : "Break is over. Ready to focus again?",
          tag: `fetch-timer-${timer.mode.toLowerCase()}`,
        });
      }
    } else {
      hasAnnouncedCompletionRef.current = false;
      try {
        localStorage.removeItem("fetch-timer-last-announced");
      } catch {}
    }
  }, [timer.completed, timer.mode, timer.durations, timer.packId, soundEnabled, notificationsEnabled]);

  const startTimer = () => {
    setCompletionDismissed(false);
    if (soundEnabled) {
      const sessionToken = `start-${timer.mode}-${Date.now()}`;
      void playStudySound("start-bark", sessionToken, { soundEnabled });
    }
    setTimer((t) => ({
      ...t,
      endAt: Date.now() + t.remaining * 1000,
      completed: false,
    }));
  };

  const pauseTimer = () => {
    setTimer((t) => (t.endAt ? { ...tickTimer(t, Date.now()), endAt: null } : t));
  };

  const resetTimer = (newMode?: TimerMode) => {
    setCompletionDismissed(false);
    setTimer((t) => {
      const targetMode = newMode || t.mode;
      return {
        ...t,
        mode: targetMode,
        remaining: t.durations[targetMode] * 60,
        endAt: null,
        completed: false,
      };
    });
  };

  return (
    <Context.Provider
      value={{
        timer,
        setTimer,
        ready,
        soundEnabled,
        setSoundEnabled,
        notificationsEnabled,
        setNotificationsEnabled,
        requestNotifications,
        startTimer,
        pauseTimer,
        resetTimer,
      }}
    >
      {children}
      {pathname !== "/app/pomodoro" && (timer.endAt !== null || (timer.completed && !completionDismissed)) && (
        <div className="timer-mini fixed bottom-[84px] right-4 z-30 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-1 shadow-sm lg:bottom-4" data-completed={timer.completed}>
          <Link
            href="/app/pomodoro"
            className="flex min-h-11 items-center gap-2 text-xs font-extrabold"
          >
            <Timer size={20} />
            {timer.completed
              ? "Session complete"
              : `${timer.mode} · ${timerText(timer.remaining)}`}
          </Link>
          {timer.completed && <button type="button" aria-label="Dismiss timer completion" onClick={() => setCompletionDismissed(true)} className="flex size-11 items-center justify-center"><X size={16} /></button>}
          <span role="status" className="sr-only">
            {timer.completed ? "Your timer session is complete." : ""}
          </span>
        </div>
      )}
    </Context.Provider>
  );
}

export function useTimer() {
  const c = useContext(Context);
  if (!c) throw new Error("Timer provider missing");
  return c;
}
