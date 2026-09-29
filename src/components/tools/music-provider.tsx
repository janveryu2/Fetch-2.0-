"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowSquareOut, Headphones, MusicNotes, SkipBack, SkipForward, X } from "@phosphor-icons/react";
import { usePathname } from "next/navigation";

export type Track = { name: string; url: string };

export type ExternalTrack = {
  id?: string;
  title: string;
  category?: string;
  embedUrl: string;
  watchUrl?: string;
};

interface MusicContextType {
  tracks: Track[];
  index: number;
  error: string;
  externalActive: boolean;
  setExternalActive: (active: boolean) => void;
  externalTrack: ExternalTrack | null;
  playExternalTrack: (track: ExternalTrack) => void;
  stopExternalTrack: () => void;
  select: (index: number) => void;
  load: (files: FileList) => void;
  pause: () => void;
  clear: () => void;
}

const Context = createContext<MusicContextType | null>(null);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [externalActive, setExternalActive] = useState(false);
  const [externalTrack, setExternalTrack] = useState<ExternalTrack | null>(null);
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
    setExternalTrack(null);
    audio.current?.pause();
    setIndex(next);
    setError("");
  }

  function playExternalTrack(track: ExternalTrack) {
    audio.current?.pause();
    setExternalActive(true);
    setExternalTrack(track);
  }

  function stopExternalTrack() {
    setExternalActive(false);
    setExternalTrack(null);
  }

  return (
    <Context.Provider
      value={{
        tracks,
        index,
        error,
        externalActive,
        setExternalActive,
        externalTrack,
        playExternalTrack,
        stopExternalTrack,
        load,
        select,
        pause: () => audio.current?.pause(),
        clear,
      }}
    >
      <div className={tracks.length || externalTrack ? "pb-48" : undefined}>{children}</div>

      {/* Local files player dock */}
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
              onPlay={() => {
                setExternalActive(false);
                setExternalTrack(null);
              }}
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

      {/* Persistent External YouTube Player Mini-Dock */}
      {externalTrack && (
        <section
          aria-label="Study stream player"
          className="fixed bottom-20 right-3 z-40 max-w-[calc(100vw-24px)] rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-card)] p-3 shadow-2xl backdrop-blur-md transition-all lg:bottom-6 lg:right-6 sm:w-[380px]"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-700)]">
                <Headphones size={16} />
              </span>
              <div className="min-w-0">
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[var(--fetch-blue-700)]">
                  {externalTrack.category ? `${externalTrack.category} Stream` : "Study Stream"}
                </span>
                <p className="truncate text-xs font-bold text-[var(--text-primary)]" title={externalTrack.title}>
                  {externalTrack.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {pathname !== "/app/music" && (
                <Link
                  href="/app/music"
                  className="flex size-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  title="Open Music Studio"
                  aria-label="Open Music Studio"
                >
                  <MusicNotes size={16} />
                </Link>
              )}
              {externalTrack.watchUrl && (
                <a
                  href={externalTrack.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
                  title="Open directly on YouTube"
                  aria-label="Open on YouTube"
                >
                  <ArrowSquareOut size={16} />
                </a>
              )}
              <button
                type="button"
                onClick={stopExternalTrack}
                aria-label="Stop study stream"
                className="flex size-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-red-600"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Compliant YouTube Viewport: strictly >= 200px width and >= 200px height per YouTube ToS */}
          <div className="relative aspect-video w-full min-h-[200px] min-w-[200px] overflow-hidden rounded-xl bg-black">
            <iframe
              title={`YouTube player: ${externalTrack.title}`}
              src={externalTrack.embedUrl.replace("autoplay=0", "autoplay=1")}
              className="h-full w-full min-h-[200px] min-w-[200px] border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
            <span>Continuous background study playback</span>
            {pathname !== "/app/music" && (
              <Link href="/app/music" className="font-semibold text-[var(--fetch-blue-700)] hover:underline">
                Music Studio &rarr;
              </Link>
            )}
          </div>
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
