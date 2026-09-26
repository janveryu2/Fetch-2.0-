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
import { Timer } from "@phosphor-icons/react";
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
  isNotificationSupported,
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
  const [timer, setTimer] = useState<FocusTimer>(() => createInitialTimer(preferredFocusMinutes));
  const [ready, setReady] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const queuedFocusMinutesRef = useRef<number | null>(null);
  const initialMountRef = useRef(true);
  const hasAnnouncedCompletionRef = useRef(false);

  const storageKey = mode === "account" && userId ? `fetch-focus-v1:${userId}` : "fetch-focus-v1:demo";

  useEffect(() => {
    try {
      const storedSound = localStorage.getItem("fetch-timer-sound");
      if (storedSound !== null) setSoundEnabledState(storedSound === "true");
      const storedNotif = localStorage.getItem("fetch-timer-notifications");
      if (storedNotif !== null) setNotificationsEnabledState(storedNotif === "true");
    } catch {}
  }, []);

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
    if (timer.completed && !hasAnnouncedCompletionRef.current) {
      hasAnnouncedCompletionRef.current = true;
      const sessionToken = `completion-${timer.mode}-${Date.now()}`;
      if (soundEnabled) {
        playStudySound("complete-alarm", sessionToken, { soundEnabled });
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
    } else if (!timer.completed) {
      hasAnnouncedCompletionRef.current = false;
    }
  }, [timer.completed, timer.mode, soundEnabled, notificationsEnabled]);

  const startTimer = () => {
    setTimer((t) => {
      const nextTimer = {
        ...t,
        endAt: Date.now() + t.remaining * 1000,
        completed: false,
      };
      if (soundEnabled) {
        const sessionToken = `start-${t.mode}-${Date.now()}`;
        playStudySound("start-bark", sessionToken, { soundEnabled });
      }
      return nextTimer;
    });
  };

  const pauseTimer = () => {
    setTimer((t) => (t.endAt ? { ...tickTimer(t, Date.now()), endAt: null } : t));
  };

  const resetTimer = (newMode?: TimerMode) => {
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
      {(timer.endAt !== null || timer.completed) && (
        <div className="timer-mini fixed bottom-[84px] right-4 z-30 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-4 py-2 shadow-sm lg:bottom-4">
          <Link
            href="/app/pomodoro"
            className="flex min-h-9 items-center gap-2 text-sm font-extrabold"
          >
            <Timer size={20} />
            {timer.completed
              ? "Session complete"
              : `${timer.mode} · ${timerText(timer.remaining)}`}
          </Link>
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
