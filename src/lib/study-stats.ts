import type { StudyAttempt } from "./demo-types";
export function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export function studyStreak(attempts: StudyAttempt[], now = new Date()) {
  const dates = new Set(
    attempts.map((a) => localDate(new Date(a.completedAt))),
  );
  let day = new Date(now);
  let count = 0;
  if (!dates.has(localDate(day))) day = addDays(day, -1);
  while (dates.has(localDate(day))) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}
