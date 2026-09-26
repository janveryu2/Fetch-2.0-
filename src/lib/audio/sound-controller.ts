/**
 * sound-controller.ts
 *
 * Client-side sound manager for study timer and interactions.
 * Safely handles missing audio assets, browser autoplay policies,
 * and once-only playback guarantees per timer session.
 */

export type SoundEffect = "start-bark" | "complete-alarm" | "complete-bark";

export interface SoundControllerOptions {
  soundEnabled: boolean;
  volume?: number; // 0 to 1
}

const SOUND_ASSETS: Record<SoundEffect, string> = {
  "start-bark": "/assets/audio/bark.mp3",
  "complete-alarm": "/assets/audio/alarm.mp3",
  "complete-bark": "/assets/audio/bark.mp3",
};

// Keeps track of played session events to prevent multiple firings on background ticks
const playedSessionTokens = new Set<string>();

/**
 * Reset tracked sound session tokens (e.g. when timer resets or completes)
 */
export function resetPlayedSoundTokens(): void {
  playedSessionTokens.clear();
}

/**
 * Play a gentle Web Audio synthesized chime when static audio files are not present.
 */
function playSynthChime(effect: SoundEffect, volume: number): void {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const now = ctx.currentTime;
    const boundedVolume = Math.max(0, Math.min(1, volume));

    if (effect === "start-bark") {
      // Gentle ascending two-tone focus alert
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.15);
      gain.gain.setValueAtTime(boundedVolume * 0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } else {
      // Celebratory completion chord/chime
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.15); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.3); // G5
      gain.gain.setValueAtTime(boundedVolume * 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.55);
    }

    setTimeout(() => {
      try {
        ctx.close();
      } catch {}
    }, 600);
  } catch {
    // Web audio blocked or unsupported, fail silently
  }
}

/**
 * Play a study sound effect once per unique session token.
 * Returns true if sound attempted/played, false if disabled, already played, or blocked.
 */
export async function playStudySound(
  effect: SoundEffect,
  sessionToken?: string,
  options: SoundControllerOptions = { soundEnabled: true, volume: 0.5 },
): Promise<boolean> {
  if (!options.soundEnabled) return false;
  if (typeof window === "undefined") return false;

  if (sessionToken) {
    const key = `${effect}:${sessionToken}`;
    if (playedSessionTokens.has(key)) {
      return false; // Already played for this session
    }
    playedSessionTokens.add(key);
  }

  const assetSrc = SOUND_ASSETS[effect];
  const vol = options.volume ?? 0.5;

  try {
    const audio = new Audio(assetSrc);
    audio.volume = Math.max(0, Math.min(1, vol));

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      await playPromise;
      return true;
    }
    return true;
  } catch {
    // Missing MP3 asset or autoplay policy blocked:
    // Graceful fallback to gentle synthesizer chime without throwing
    playSynthChime(effect, vol);
    return true;
  }
}
