"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  ArrowsOutCardinal,
  CaretDown,
  CaretUp,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "@phosphor-icons/react";
import { useMovablePlayer } from "./use-movable-player";

export type Track = { name: string; url: string };
export type ExternalTrack = {
  id?: string;
  title: string;
  category?: string;
  creator?: string;
  artwork?: string;
  audioUrl?: string;
  embedUrl?: string;
  watchUrl?: string;
};
interface MusicContextType {
  tracks: Track[];
  index: number;
  error: string;
  externalActive: boolean;
  externalTrack: ExternalTrack | null;
  playExternalTrack: (track: ExternalTrack) => void;
  stopExternalTrack: () => void;
  select: (index: number) => void;
  load: (files: FileList) => void;
  pause: () => void;
  playing: boolean;
  togglePlayback: () => void;
  volume: number;
  setVolume: (volume: number) => void;
  currentTime: number;
  duration: number;
  seek: (time: number) => void;
  clear: () => void;
}
const Context = createContext<MusicContextType | null>(null);

function YouTubeDock({
  track,
  stop,
  minimized,
  setMinimized,
  frame,
  sendCommand,
  onLoad,
}: {
  track: ExternalTrack;
  stop: () => void;
  minimized: boolean;
  setMinimized: (value: boolean) => void;
  frame: React.RefObject<HTMLIFrameElement | null>;
  sendCommand: (command: string) => void;
  onLoad: () => void;
}) {
  const { ref: playerRef, style, handle } = useMovablePlayer();
  return (
    <section
      ref={playerRef}
      style={style}
      aria-label="Study stream player"
      className="music-stream-dock"
      data-minimized={minimized}
    >
      <div className="music-dock-heading">
        <button
          {...handle}
          type="button"
          className="music-drag-handle"
          aria-label="Move music player"
          title="Drag to move. Arrow keys move; Home resets position."
        >
          <ArrowsOutCardinal size={18} />
        </button>
        <Link href="/app/music" className="music-dock-title">
          <strong>{track.title}</strong>
          <small>{minimized ? "Paused · YouTube" : "YouTube"}</small>
        </Link>
        <button
          type="button"
          aria-label={
            minimized
              ? "Expand and resume study stream"
              : "Minimize and pause study stream"
          }
          onClick={() => {
            sendCommand(minimized ? "playVideo" : "pauseVideo");
            setMinimized(!minimized);
          }}
        >
          {minimized ? (
            <Play size={18} weight="fill" />
          ) : (
            <CaretDown size={20} />
          )}
        </button>
        <button type="button" onClick={stop} aria-label="Stop study stream">
          <X size={20} />
        </button>
      </div>
      <div className="music-video-viewport" hidden={minimized}>
        <iframe
          ref={frame}
          title={"YouTube player: " + track.title}
          src={
            track.embedUrl!.replace("autoplay=0", "autoplay=1") +
            "&enablejsapi=1&playsinline=1"
          }
          onLoad={onLoad}
          className="min-h-[200px] min-w-[200px] border-0"
          allow="autoplay; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {!minimized && track.watchUrl && (
        <a
          className="music-source-link"
          href={track.watchUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ArrowSquareOut size={14} /> Open on YouTube
        </a>
      )}
    </section>
  );
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [youtubePlaying, setYoutubePlaying] = useState(false);
  const [volume, updateVolume] = useState(80);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [externalTrack, setExternalTrack] = useState<ExternalTrack | null>(
    null,
  );
  const [minimized, setMinimized] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const urls = useRef<string[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const shouldPlay = useRef(false);
  const movable = useMovablePlayer();
  const isYouTube = !!externalTrack?.embedUrl && !externalTrack.audioUrl;
  const nativeSource =
    externalTrack?.audioUrl ?? (isYouTube ? undefined : tracks[index]?.url);
  const nativeTitle = externalTrack?.audioUrl
    ? externalTrack.title
    : tracks[index]?.name;

  useEffect(
    () => () => urls.current.forEach((url) => URL.revokeObjectURL(url)),
    [],
  );

  function sendCommand(command: string, args: unknown[] = []) {
    const target = frame.current;
    if (target)
      target.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: command, args }),
        new URL(target.src).origin,
      );
  }

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        ![
          "https://www.youtube.com",
          "https://www.youtube-nocookie.com",
        ].includes(event.origin)
      )
        return;
      try {
        const data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        const state =
          data.event === "onStateChange" ? data.info : data.info?.playerState;
        if (typeof state === "number") setYoutubePlaying(state === 1);
        if (data.event === "onError") {
          setYoutubePlaying(false);
          setError(
            "This video cannot play here. Open it on YouTube or choose another item.",
          );
        }
      } catch {
        /* Ignore unrelated player messages. */
      }
    };
    const onVisibility = () => {
      if (document.hidden) sendCommand("pauseVideo");
    };
    window.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  function playNative() {
    void audio.current?.play().catch((error: unknown) => {
      // Switching or stopping a source may cancel a pending play request.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError(
        "Playback could not start. Press play again or choose another source.",
      );
    });
  }
  function clear() {
    audio.current?.pause();
    shouldPlay.current = false;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    setTracks([]);
    setIndex(0);
    setError("");
  }
  function load(files: FileList) {
    const valid = Array.from(files).filter(
      (file) =>
        file.type.startsWith("audio/") ||
        /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name),
    );
    if (!valid.length) {
      setError("Choose a supported audio file, such as MP3, WAV, or OGG.");
      return;
    }
    clear();
    stopExternalTrack();
    const next = valid.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    urls.current = next.map((track) => track.url);
    setTracks(next);
    setControlsExpanded(false);
    setError(
      valid.length < files.length ? "Some non-audio files were skipped." : "",
    );
  }
  function select(next: number) {
    if (!tracks[next]) return;
    audio.current?.pause();
    sendCommand("stopVideo");
    setExternalTrack(null);
    setYoutubePlaying(false);
    setIndex(next);
    setError("");
    shouldPlay.current = true;
    if (next === index && !externalTrack) playNative();
  }
  function playExternalTrack(track: ExternalTrack) {
    if (!track.audioUrl && !track.embedUrl) return;
    audio.current?.pause();
    shouldPlay.current = !!track.audioUrl;
    setExternalTrack(track);
    setMinimized(false);
    setYoutubePlaying(false);
    setError("");
    setControlsExpanded(false);
  }
  function stopExternalTrack() {
    if (externalTrack?.audioUrl) audio.current?.pause();
    sendCommand("stopVideo");
    shouldPlay.current = false;
    setExternalTrack(null);
    setYoutubePlaying(false);
    setError("");
  }
  function pause() {
    if (isYouTube) sendCommand("pauseVideo");
    else audio.current?.pause();
  }
  function togglePlayback() {
    if (isYouTube) {
      if (minimized) setMinimized(false);
      sendCommand(youtubePlaying ? "pauseVideo" : "playVideo");
    } else if (audio.current?.paused) playNative();
    else audio.current?.pause();
  }
  function setVolume(value: number) {
    const next = Math.max(0, Math.min(100, value));
    updateVolume(next);
    if (audio.current) audio.current.volume = next / 100;
    if (isYouTube) sendCommand("setVolume", [next]);
  }

  return (
    <Context.Provider
      value={{
        tracks,
        index,
        error,
        externalActive: !!externalTrack,
        externalTrack,
        playExternalTrack,
        stopExternalTrack,
        load,
        select,
        pause,
        playing: isYouTube ? youtubePlaying : playing,
        togglePlayback,
        volume,
        setVolume,
        currentTime,
        duration,
        seek: (time) => {
          if (audio.current && duration)
            audio.current.currentTime = Math.max(0, Math.min(time, duration));
        },
        clear,
      }}
    >
      <div
        className={
          externalTrack || tracks.length
            ? "music-workspace-with-player"
            : undefined
        }
      >
        {children}
      </div>
      {/* This single audio element stays mounted through route and source changes. */}
      <section
        ref={movable.ref}
        style={movable.style}
        aria-label={
          externalTrack?.audioUrl ? "Study audio player" : "Now playing"
        }
        className="music-local-dock"
        hidden={!nativeSource}
        data-expanded={controlsExpanded}
      >
        <div className="music-dock-heading">
          <button
            {...movable.handle}
            type="button"
            className="music-drag-handle"
            aria-label="Move audio player"
            title="Drag to move. Arrow keys move; Home resets position."
          >
            <ArrowsOutCardinal size={18} />
          </button>
          <Link href="/app/music" className="music-dock-title">
            <strong>{nativeTitle}</strong>
            <small>
              {externalTrack?.audioUrl
                ? (externalTrack.creator ?? "Audio stream") +
                  (playing ? " · Playing" : " · Paused")
                : "Local device audio"}
            </small>
          </Link>
          <button
            type="button"
            aria-label={playing ? "Pause dock audio" : "Play dock audio"}
            onClick={togglePlayback}
          >
            {playing ? (
              <Pause weight="fill" size={20} />
            ) : (
              <Play weight="fill" size={20} />
            )}
          </button>
          <button
            type="button"
            aria-label={
              controlsExpanded ? "Hide player controls" : "Show player controls"
            }
            aria-expanded={controlsExpanded}
            onClick={() => setControlsExpanded(!controlsExpanded)}
          >
            {controlsExpanded ? <CaretDown size={20} /> : <CaretUp size={20} />}
          </button>
          <button
            type="button"
            onClick={externalTrack?.audioUrl ? stopExternalTrack : clear}
            aria-label={
              externalTrack?.audioUrl
                ? "Stop study stream"
                : "Clear local playlist"
            }
          >
            <X size={20} />
          </button>
        </div>
        <div className="music-native-controls" hidden={!controlsExpanded}>
          {!externalTrack && (
            <>
              <button
                aria-label="Previous track"
                onClick={() =>
                  select((index - 1 + tracks.length) % tracks.length)
                }
              >
                <SkipBack size={20} />
              </button>
              <button
                aria-label="Next track"
                onClick={() => select((index + 1) % tracks.length)}
              >
                <SkipForward size={20} />
              </button>
            </>
          )}
          <audio
            ref={audio}
            src={nativeSource}
            controls
            preload="metadata"
            onPlay={() => {
              setPlaying(true);
              setError("");
            }}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) =>
              setCurrentTime(event.currentTarget.currentTime)
            }
            onVolumeChange={(event) =>
              updateVolume(Math.round(event.currentTarget.volume * 100))
            }
            onLoadedMetadata={(event) => {
              setDuration(
                Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : 0,
              );
              event.currentTarget.volume = volume / 100;
            }}
            onCanPlay={() => {
              if (shouldPlay.current) {
                shouldPlay.current = false;
                playNative();
              }
            }}
            onEmptied={() => {
              setCurrentTime(0);
              setDuration(0);
              setPlaying(false);
            }}
            onError={() => {
              shouldPlay.current = false;
              setError(
                "This audio source is unavailable. Try another item or open the publisher's page.",
              );
            }}
            onEnded={() => {
              if (!externalTrack && index + 1 < tracks.length)
                select(index + 1);
            }}
          />
        </div>
        {error && !isYouTube && (
          <p role="alert" className="music-dock-error">
            {error}{" "}
            {externalTrack?.watchUrl && (
              <a href={externalTrack.watchUrl} target="_blank" rel="noreferrer">
                Open source
              </a>
            )}
          </p>
        )}
      </section>
      {isYouTube && (
        <YouTubeDock
          track={externalTrack!}
          stop={stopExternalTrack}
          minimized={minimized}
          setMinimized={setMinimized}
          frame={frame}
          sendCommand={sendCommand}
          onLoad={() => {
            const target = frame.current;
            if (target)
              target.contentWindow?.postMessage(
                JSON.stringify({
                  event: "listening",
                  id: "fetch-study-player",
                }),
                new URL(target.src).origin,
              );
            sendCommand("addEventListener", ["onStateChange"]);
            sendCommand("addEventListener", ["onError"]);
            if (minimized) sendCommand("pauseVideo");
          }}
        />
      )}
      {isYouTube && error && (
        <p role="alert" className="notice mx-4">
          {error}
        </p>
      )}
    </Context.Provider>
  );
}
export function useMusic() {
  const context = useContext(Context);
  if (!context) throw new Error("Music provider missing");
  return context;
}
