/**
 * curated-tracks.ts
 *
 * Typed editorial seed records for curated study streams (Section B5).
 * Uses supported privacy-enhanced YouTube embed URLs with direct open-on-YouTube fallbacks.
 */

export interface CuratedTrack {
  id: string;
  title: string;
  videoId: string;
  category: "Classical" | "Focus" | "Ambient" | "Lo-Fi";
  watchUrl: string;
  embedUrl: string;
  creator?: string;
  duration?: string;
}

export const CURATED_TRACKS: readonly CuratedTrack[] = [
  {
    id: "vivaldi-four-seasons",
    title: "Antonio Vivaldi - The Four Seasons",
    videoId: "4rgSzQwe5DQ",
    category: "Classical",
    watchUrl: "https://www.youtube.com/watch?v=4rgSzQwe5DQ",
    embedUrl: "https://www.youtube-nocookie.com/embed/4rgSzQwe5DQ?autoplay=0",
  },
  {
    id: "mozart-piano-concerto-21-andante",
    title: "W.A. Mozart - Piano Concerto No.21 in C Major K.467 II. Andante",
    videoId: "w8BRnjahses",
    category: "Classical",
    watchUrl: "https://www.youtube.com/watch?v=w8BRnjahses",
    embedUrl: "https://www.youtube-nocookie.com/embed/w8BRnjahses?autoplay=0",
  },
  {
    id: "classical-study-brain-power",
    title: "Classical Music for Studying & Brain Power | Mozart, Vivaldi, Tchaikovsky...",
    videoId: "BMuknRb7woc",
    category: "Focus",
    watchUrl: "https://www.youtube.com/watch?v=BMuknRb7woc",
    embedUrl: "https://www.youtube-nocookie.com/embed/BMuknRb7woc?autoplay=0",
  },
] as const;

export function getCuratedTracks(): readonly CuratedTrack[] {
  return CURATED_TRACKS;
}

export function findCuratedTrackById(id: string): CuratedTrack | undefined {
  return CURATED_TRACKS.find((track) => track.id === id);
}
