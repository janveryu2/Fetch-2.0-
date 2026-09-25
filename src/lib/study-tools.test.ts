import { describe, it, expect } from "vitest";
import { initialTimer, restoreTimer, tickTimer } from "./focus-timer";
import { addDays, localDate, studyStreak } from "./study-stats";
import { youtubeEmbed } from "./youtube";
import { eventLanes } from "./calendar-layout";
import type { StudyAttempt, CalendarEvent } from "./demo-types";
const attempt = (date: Date): StudyAttempt => ({
  id: localDate(date),
  packId: "p",
  packTitle: "Test",
  score: 80,
  correct: 4,
  total: 5,
  completedAt: date.toISOString(),
});
describe("focus clock", () => {
  it("uses the deadline after delayed ticks and completes once", () => {
    const running = { ...initialTimer, endAt: 61000, remaining: 60 };
    expect(tickTimer(running, 31050).remaining).toBe(30);
    const done = tickTimer(running, 65000);
    expect(done).toMatchObject({ remaining: 0, endAt: null, completed: true });
    expect(tickTimer(done, 99999)).toBe(done);
  });
  it("restores expired sessions and rejects corrupted data", () => {
    expect(restoreTimer({ ...initialTimer, endAt: 1000 }, 2000).completed).toBe(
      true,
    );
    expect(restoreTimer({ mode: "x" }, 2000)).toEqual(initialTimer);
    expect(restoreTimer({ ...initialTimer, remaining: -1 }, 2000)).toEqual(
      initialTimer,
    );
  });
});
describe("local calendar days and streaks", () => {
  it("counts distinct consecutive days and allows yesterday", () => {
    const now = new Date(2026, 8, 23, 12);
    expect(
      studyStreak(
        [
          attempt(now),
          attempt(now),
          attempt(addDays(now, -1)),
          attempt(addDays(now, -2)),
        ],
        now,
      ),
    ).toBe(3);
    expect(studyStreak([attempt(addDays(now, -1))], now)).toBe(1);
    expect(studyStreak([attempt(addDays(now, -2))], now)).toBe(0);
  });
  it("crosses months without UTC shifts", () =>
    expect(localDate(addDays(new Date(2026, 0, 31, 12), 1))).toBe(
      "2026-02-01",
    ));
  it("allocates non-colliding lanes for chained overlaps", () => {
    const event = (id: string, start: string, end: string): CalendarEvent => ({
      id,
      start,
      end,
      title: id,
      type: "study",
      date: "2026-09-23",
    });
    const lanes = eventLanes([
      event("a", "08:00", "10:00"),
      event("b", "09:00", "11:00"),
      event("c", "10:00", "12:00"),
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, columns: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, columns: 2 });
    expect(lanes.get("c")).toEqual({ lane: 0, columns: 2 });
  });
});
describe("YouTube URLs", () => {
  it("accepts canonical videos and playlists without autoplay", () => {
    expect(youtubeEmbed("https://youtu.be/M7lc1UVf-VE")?.src).toContain(
      "autoplay=0",
    );
    expect(
      youtubeEmbed("https://www.youtube.com/playlist?list=PL1234567890")?.src,
    ).toContain("videoseries");
  });
  it("rejects foreign origins and unsafe protocols", () => {
    expect(
      youtubeEmbed("https://youtube.com.evil.test/watch?v=M7lc1UVf-VE"),
    ).toBeNull();
    expect(youtubeEmbed("javascript:alert(1)")).toBeNull();
    expect(youtubeEmbed("https://youtube.com/watch?v=bad")).toBeNull();
  });
});
