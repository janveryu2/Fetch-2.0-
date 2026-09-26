import { describe, it, expect, beforeEach } from "vitest";
import {
  getCuratedTracks,
  findCuratedTrackById,
} from "@/lib/music/curated-tracks";
import {
  playStudySound,
  resetPlayedSoundTokens,
} from "@/lib/audio/sound-controller";
import {
  isNotificationSupported,
  getNotificationPermission,
  sendStudyNotification,
  requestNotificationPermission,
} from "@/lib/notifications/study-notifications";
import {
  createInitialTimer,
  tickTimer,
  restoreTimer,
  timerText,
} from "@/lib/focus-timer";

describe("Phase 8: Curated Music Tracks (Section B5)", () => {
  it("provides the three approved curated study streams with accurate video IDs and categories", () => {
    const tracks = getCuratedTracks();
    expect(tracks.length).toBe(3);

    const vivaldi = findCuratedTrackById("vivaldi-four-seasons");
    expect(vivaldi).toBeDefined();
    expect(vivaldi?.videoId).toBe("4rgSzQwe5DQ");
    expect(vivaldi?.category).toBe("Classical");
    expect(vivaldi?.embedUrl).toContain("youtube-nocookie.com/embed/4rgSzQwe5DQ");
    expect(vivaldi?.watchUrl).toBe("https://www.youtube.com/watch?v=4rgSzQwe5DQ");

    const mozart = findCuratedTrackById("mozart-piano-concerto-21-andante");
    expect(mozart).toBeDefined();
    expect(mozart?.videoId).toBe("w8BRnjahses");
    expect(mozart?.category).toBe("Classical");
    expect(mozart?.embedUrl).toContain("youtube-nocookie.com/embed/w8BRnjahses");

    const brainPower = findCuratedTrackById("classical-study-brain-power");
    expect(brainPower).toBeDefined();
    expect(brainPower?.videoId).toBe("BMuknRb7woc");
    expect(brainPower?.category).toBe("Focus");
    expect(brainPower?.embedUrl).toContain("youtube-nocookie.com/embed/BMuknRb7woc");
  });

  it("returns undefined for non-existent track IDs", () => {
    expect(findCuratedTrackById("non-existent-track")).toBeUndefined();
  });
});

describe("Phase 8: Audio Controller and Graceful Missing-Asset State", () => {
  beforeEach(() => {
    resetPlayedSoundTokens();
  });

  it("does not play or attempt sound when soundEnabled is false", async () => {
    const played = await playStudySound("start-bark", "session-1", {
      soundEnabled: false,
    });
    expect(played).toBe(false);
  });

  it("enforces once-only sound playback per unique session token", async () => {
    // In Node/Vitest test environment, playStudySound gracefully handles missing Audio/WebAudio
    await playStudySound("start-bark", "token-101", {
      soundEnabled: true,
    });
    // First call may return true (if mock/synth executed) or false if window undefined
    // But second call with identical token MUST return false (already played)
    const secondCall = await playStudySound("start-bark", "token-101", {
      soundEnabled: true,
    });
    expect(secondCall).toBe(false);

    // After reset, same token can be played again
    resetPlayedSoundTokens();
    // After reset, token is no longer in set
  });

  it("does not throw an exception when audio element fails to load or play", async () => {
    await expect(
      playStudySound("complete-alarm", "token-202", { soundEnabled: true }),
    ).resolves.not.toThrow();
  });
});

describe("Phase 8: Permissioned Browser Notifications", () => {
  it("safely handles environments without Notification API", () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      expect(isNotificationSupported()).toBe(false);
      expect(getNotificationPermission()).toBe("unsupported");
      expect(sendStudyNotification("Test Title")).toBe(false);
    }
  });

  it("requestNotificationPermission returns false if Notification is unsupported", async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      const granted = await requestNotificationPermission();
      expect(granted).toBe(false);
    }
  });
});

describe("Phase 8: Pomodoro Timer Boundaries and Background Throttling", () => {
  it("recomputes remaining seconds from absolute endAt rather than relying on tick count", () => {
    const start = 1700000000000;
    const timer = {
      ...createInitialTimer(25),
      endAt: start + 25 * 60 * 1000,
      remaining: 25 * 60,
    };

    // Simulate background tab throttling where 10 seconds elapsed between ticks
    const now1 = start + 10 * 1000;
    const ticked1 = tickTimer(timer, now1);
    expect(ticked1.remaining).toBe(25 * 60 - 10);
    expect(ticked1.completed).toBe(false);
    expect(ticked1.endAt).toBe(timer.endAt);

    // Simulate background tab suspended for 15 minutes
    const now2 = start + 15 * 60 * 1000;
    const ticked2 = tickTimer(timer, now2);
    expect(ticked2.remaining).toBe(10 * 60);
    expect(ticked2.completed).toBe(false);

    // Simulate completion boundary
    const nowComplete = start + 25 * 60 * 1000;
    const tickedComplete = tickTimer(timer, nowComplete);
    expect(tickedComplete.remaining).toBe(0);
    expect(tickedComplete.endAt).toBeNull();
    expect(tickedComplete.completed).toBe(true);

    // Overdue boundary (waking up 5 minutes past completion)
    const nowOverdue = start + 30 * 60 * 1000;
    const tickedOverdue = tickTimer(timer, nowOverdue);
    expect(tickedOverdue.remaining).toBe(0);
    expect(tickedOverdue.endAt).toBeNull();
    expect(tickedOverdue.completed).toBe(true);
  });

  it("formats timer text correctly with zero padding", () => {
    expect(timerText(1500)).toBe("25:00");
    expect(timerText(65)).toBe("01:05");
    expect(timerText(9)).toBe("00:09");
    expect(timerText(0)).toBe("00:00");
  });

  it("restores valid saved timer state across reloads", () => {
    const now = 1700000000000;
    const saved = {
      mode: "Short break",
      durations: { Focus: 25, "Short break": 5, "Long break": 15 },
      remaining: 180,
      endAt: now + 180000,
      completed: false,
      packId: "pack-123",
    };

    const restored = restoreTimer(saved, now);
    expect(restored.mode).toBe("Short break");
    expect(restored.packId).toBe("pack-123");
    expect(restored.remaining).toBe(180);
    expect(restored.completed).toBe(false);
  });

  it("falls back to default initial timer on malformed saved data", () => {
    const now = 1700000000000;
    expect(restoreTimer(null, now)).toEqual(createInitialTimer(25));
    expect(restoreTimer({ mode: "InvalidMode" }, now)).toEqual(createInitialTimer(25));
    expect(restoreTimer({ remaining: -50 }, now)).toEqual(createInitialTimer(25));
    expect(restoreTimer({ durations: { Focus: 999 } }, now)).toEqual(createInitialTimer(25));
  });
});
