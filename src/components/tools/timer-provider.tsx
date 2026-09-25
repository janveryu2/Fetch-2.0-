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
} from "@/lib/focus-timer";
import { useDemo } from "@/components/app/demo-provider";

const Context = createContext<{
  timer: FocusTimer;
  setTimer: Dispatch<SetStateAction<FocusTimer>>;
  ready: boolean;
} | null>(null);

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
  const queuedFocusMinutesRef = useRef<number | null>(null);
  const initialMountRef = useRef(true);

  const storageKey = mode === "account" && userId ? `fetch-focus-v1:${userId}` : "fetch-focus-v1:demo";

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

  return (
    <Context.Provider value={{ timer, setTimer, ready }}>
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
