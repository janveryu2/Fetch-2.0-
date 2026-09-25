export type TimerMode = "Focus" | "Short break" | "Long break";
export type FocusTimer = {
  mode: TimerMode;
  durations: Record<TimerMode, number>;
  remaining: number;
  endAt: number | null;
  completed: boolean;
  packId: string;
};
export function createInitialTimer(focusMinutes = 25): FocusTimer {
  const mins = Number.isFinite(focusMinutes) && focusMinutes >= 1 && focusMinutes <= 120 ? focusMinutes : 25;
  return {
    mode: "Focus",
    durations: { Focus: mins, "Short break": 5, "Long break": 15 },
    remaining: mins * 60,
    endAt: null,
    completed: false,
    packId: "",
  };
}

export const initialTimer: FocusTimer = createInitialTimer(25);
export function tickTimer(timer: FocusTimer, now: number): FocusTimer {
  if (timer.endAt === null) return timer;
  const remaining = Math.max(0, Math.ceil((timer.endAt - now) / 1000));
  return remaining === 0
    ? { ...timer, remaining: 0, endAt: null, completed: true }
    : { ...timer, remaining };
}
export function restoreTimer(raw: unknown, now: number): FocusTimer {
  if (!raw || typeof raw !== "object") return initialTimer;
  const t = raw as FocusTimer;
  if (
    !["Focus", "Short break", "Long break"].includes(t.mode) ||
    !t.durations ||
    Object.values(t.durations).length !== 3 ||
    Object.values(t.durations).some(
      (n) => typeof n !== "number" || !Number.isFinite(n) || n < 1 || n > 120,
    ) ||
    !["Focus", "Short break", "Long break"].every((k) => k in t.durations) ||
    typeof t.remaining !== "number" ||
    !Number.isFinite(t.remaining) ||
    t.remaining < 0 ||
    t.remaining > 7200 ||
    (t.endAt !== null &&
      (typeof t.endAt !== "number" || !Number.isFinite(t.endAt))) ||
    typeof t.packId !== "string"
  )
    return initialTimer;
  return tickTimer(t, now);
}
export function timerText(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
