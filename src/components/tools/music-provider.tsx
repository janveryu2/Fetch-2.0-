"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SkipBack, SkipForward, X } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";
type Track = { name: string; url: string };
const Context = createContext<{
  tracks: Track[];
  index: number;
  error: string;
  externalActive: boolean;
  setExternalActive: (active: boolean) => void;
  select: (index: number) => void;
  load: (files: FileList) => void;
  pause: () => void;
  clear: () => void;
} | null>(null);
export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]),
    [index, setIndex] = useState(0),
    [error, setError] = useState("");
  const [externalActive, setExternalActive] = useState(false);
  const urls = useRef<string[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  const pathname = usePathname();
  useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  function clear() {
    audio.current?.pause();
    if (audio.current) {
      audio.current.removeAttribute("src");
      audio.current.load();
    }
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    setTracks([]);
    setIndex(0);
    setError("");
  }
  function load(files: FileList) {
    const valid = Array.from(files).filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(f.name),
    );
    if (!valid.length) {
      setError("Choose a supported audio file, such as MP3, WAV, or OGG.");
      return;
    }
    clear();
    const next = valid.map((f) => ({
      name: f.name,
      url: URL.createObjectURL(f),
    }));
    urls.current = next.map((t) => t.url);
    setTracks(next);
    setError(
      valid.length < files.length ? "Some non-audio files were skipped." : "",
    );
  }
  function select(next: number) {
    setExternalActive(false);
    audio.current?.pause();
    setIndex(next);
    setError("");
  }
  return (
    <Context.Provider
      value={{
        tracks,
        index,
        error,
        externalActive,
        setExternalActive,
        load,
        select,
        pause: () => audio.current?.pause(),
        clear,
      }}
    >
      <div className={tracks.length ? "pb-48" : undefined}>{children}</div>
      {tracks[index] && (
        <section
          aria-label="Now playing"
          className="fixed bottom-20 left-3 right-3 z-40 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-card)] p-3 shadow-[var(--shadow-soft)] lg:bottom-4 lg:left-[280px] lg:right-8"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link
                href="/app/music"
                className="text-xs font-extrabold text-[var(--fetch-blue-700)]"
              >
                Now playing · Local device audio
              </Link>
              <p className="truncate text-sm font-bold">{tracks[index].name}</p>
            </div>
            <button
              onClick={clear}
              aria-label="Clear local playlist"
              className="flex size-11 shrink-0 items-center justify-center"
            >
              <X size={21} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              style={{ scrollMarginBlock: "120px" }}
              aria-label="Previous track"
              onClick={() =>
                select((index - 1 + tracks.length) % tracks.length)
              }
              className="flex size-11 items-center justify-center"
            >
              <SkipBack size={22} />
            </button>
            <button
              style={{ scrollMarginBlock: "120px" }}
              aria-label="Next track"
              onClick={() => select((index + 1) % tracks.length)}
              className="flex size-11 items-center justify-center"
            >
              <SkipForward size={22} />
            </button>
            <audio
              onPlay={() => setExternalActive(false)}
              ref={audio}
              src={tracks[index].url}
              controls
              preload="metadata"
              className="min-w-0 flex-1 basis-60"
              onError={() =>
                setError(
                  "This file cannot be played by your browser. Try another audio format.",
                )
              }
              onEnded={() => {
                if (index + 1 < tracks.length) select(index + 1);
              }}
            />
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          {pathname !== "/app/music" && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Your playlist stays available while you study.
            </p>
          )}
        </section>
      )}
    </Context.Provider>
  );
}
export function useMusic() {
  const c = useContext(Context);
  if (!c) throw new Error("Music provider missing");
  return c;
}
