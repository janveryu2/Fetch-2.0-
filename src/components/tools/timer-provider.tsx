"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import Link from "next/link";
import { Timer } from "@phosphor-icons/react";
import {
  initialTimer,
  restoreTimer,
  tickTimer,
  timerText,
  type FocusTimer,
} from "@/lib/focus-timer";
const Context = createContext<{
  timer: FocusTimer;
  setTimer: Dispatch<SetStateAction<FocusTimer>>;
  ready: boolean;
} | null>(null);
export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timer, setTimer] = useState(initialTimer),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setTimer(
          restoreTimer(
            JSON.parse(localStorage.getItem("fetch-focus-v1") || "null"),
            Date.now(),
          ),
        );
      } catch {}
      setReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem("fetch-focus-v1", JSON.stringify(timer));
      } catch {}
  }, [timer, ready]);
  useEffect(() => {
    const update = () => setTimer((t) => tickTimer(t, Date.now()));
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
