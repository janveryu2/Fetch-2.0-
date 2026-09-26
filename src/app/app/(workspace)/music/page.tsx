"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOut,
  Headphones,
  MusicNotes,
  Play,
  Timer,
  UploadSimple,
} from "@phosphor-icons/react";
import { useMusic } from "@/components/tools/music-provider";
import { Button } from "@/components/ui/button";
import { youtubeEmbed } from "@/lib/youtube";
import { CURATED_TRACKS, type CuratedTrack } from "@/lib/music/curated-tracks";
export default function MusicPage() {
  const music = useMusic();
  const [tab, setTab] = useState("Local files"),
    [url, setUrl] = useState("");
  const [embed, setEmbed] = useState<ReturnType<typeof youtubeEmbed>>(null),
    [error, setError] = useState("");
  const [curatedTrack, setCuratedTrack] = useState<CuratedTrack | null>(null);
  return (
    <div className="workspace">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Your space to tune in.</h1>
          <p className="page-description">
            A soundtrack for the way you study.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/app/pomodoro">
            <Timer />
            Pomodoro Timer
          </Link>
        </Button>
      </div>
      <div className="my-7 flex items-center gap-5 rounded-2xl bg-[var(--fetch-blue-100)] p-6">
        <Headphones
          size={48}
          className="shrink-0 text-[var(--fetch-blue-700)]"
        />
        <div>
          <h2 className="font-display text-2xl font-semibold">Music Studio</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Bring your favorites. Find your focus. Playback always starts with
            you.
          </p>
        </div>
      </div>
      <div className="segment w-fit">
        {["Local files", "YouTube", "Curated music"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setEmbed(null);
              setCuratedTrack(null);
              setError("");
              if (t === "YouTube" || t === "Curated music") music.pause();
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Local files" && (
        <section className="surface-card mt-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold">
                Your local playlist
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
                Files stay on your device and are never uploaded. Select them
                again after refreshing or closing this workspace.
              </p>
            </div>
            <label className="relative inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[var(--action-bg)] px-5 py-3 font-extrabold text-white">
              <UploadSimple />
              Choose audio files
              <input
                aria-label="Choose audio files"
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                multiple
                className="absolute inset-0 w-full cursor-pointer opacity-0"
                onChange={(e) => {
                  if (e.target.files) music.load(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {music.error && (
            <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
              {music.error}
            </p>
          )}
          {music.tracks.length ? (
            <div className="mt-6 divide-y divide-[var(--border-subtle)]">
              {music.tracks.map((t, i) => (
                <button
                  key={t.url}
                  aria-pressed={music.index === i}
                  onClick={() => music.select(i)}
                  className={`flex min-h-16 w-full items-center gap-3 rounded-lg px-3 text-left ${music.index === i ? "bg-[var(--surface-subtle)]" : ""}`}
                >
                  <MusicNotes className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">
                    {t.name}
                  </span>
                  <span className="text-xs">
                    {music.index === i ? "Selected" : "Select"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <MusicNotes
                size={38}
                className="mx-auto text-[var(--fetch-blue-700)]"
              />
              <h3 className="font-display mt-3 text-xl font-semibold">
                Bring a little atmosphere
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Choose MP3, WAV, OGG, or another browser-supported audio file.
              </p>
            </div>
          )}
          <p className="notice mt-5">
            Use the player below for play, pause, seeking, and volume. Selecting
            another track stops the current one; press play when you’re ready.
          </p>
        </section>
      )}
      {tab === "YouTube" && (
        <section className="surface-card mt-5 p-6">
          <h2 className="font-display text-2xl font-semibold">
            Play through YouTube
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Paste a video or playlist URL you’re allowed to play. Loading the
            player connects to YouTube; its controls, ads, and restrictions
            apply.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = youtubeEmbed(url);
              if (!parsed) {
                setError("Enter a valid HTTPS YouTube video or playlist URL.");
                return;
              }
              music.pause();
              music.setExternalActive(true);
              setEmbed(parsed);
              setError("");
            }}
            className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <label className="field-label min-w-0 flex-1">
              YouTube URL
              <input
                className="field"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </label>
            <Button type="submit" disabled={!url.trim()}>
              Load player
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}
          {embed && music.externalActive && (
            <div className="mt-5">
              <iframe
                title="YouTube music player"
                src={embed.src}
                className="aspect-video min-h-[220px] w-full rounded-xl border-0"
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                If embedding is blocked or playback is unavailable,{" "}
                <a
                  href={embed.watch}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  open on YouTube
                </a>{" "}
                or try another video.
              </p>
              <Button
                variant="quiet"
                onClick={() => setEmbed(null)}
                className="mt-2"
              >
                Close player
              </Button>
            </div>
          )}
        </section>
      )}
      {tab === "Curated music" && (
        <section className="surface-card mt-5 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold">
                Curated study streams
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
                Hand-picked classical and focus streams for uninterrupted study sessions. Playback connects to YouTube’s privacy-enhanced player; video terms and restrictions apply.
              </p>
            </div>
            <p className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
              {CURATED_TRACKS.length} curated tracks
            </p>
          </div>

          {curatedTrack && music.externalActive && (
            <div className="mt-6 rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-subtle)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-[var(--fetch-blue-700)]">
                    Now Streaming · {curatedTrack.category}
                  </span>
                  <h3 className="truncate text-base font-bold text-[var(--text-primary)]">
                    {curatedTrack.title}
                  </h3>
                </div>
                <Button
                  variant="quiet"
                  onClick={() => {
                    setCuratedTrack(null);
                    music.setExternalActive(false);
                  }}
                  className="shrink-0"
                >
                  Close stream
                </Button>
              </div>

              <iframe
                title={`YouTube player: ${curatedTrack.title}`}
                src={curatedTrack.embedUrl}
                className="aspect-video min-h-[220px] w-full rounded-xl border-0"
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />

              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                If embedding is blocked or playback is unavailable on your device,{" "}
                <a
                  href={curatedTrack.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold underline"
                >
                  open on YouTube
                  <ArrowSquareOut size={16} />
                </a>.
              </p>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CURATED_TRACKS.map((track) => {
              const isSelected = curatedTrack?.id === track.id && music.externalActive;
              return (
                <div
                  key={track.id}
                  className={`flex flex-col justify-between rounded-xl border p-5 transition-shadow ${
                    isSelected
                      ? "border-[var(--fetch-blue-500)] bg-[var(--fetch-blue-50)] shadow-sm"
                      : "border-[var(--border-subtle)] bg-[var(--surface-card)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-bold text-[var(--fetch-blue-700)]">
                        {track.category}
                      </span>
                      <a
                        href={track.watchUrl}
                        target="_blank"
                        rel="noreferrer"
                        title="Open directly on YouTube"
                        className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                        aria-label={`Open ${track.title} on YouTube`}
                      >
                        <ArrowSquareOut size={18} />
                      </a>
                    </div>
                    <h3 className="mt-3 text-sm font-bold leading-snug text-[var(--text-primary)]">
                      {track.title}
                    </h3>
                  </div>

                  <div className="mt-5 pt-3">
                    <Button
                      variant={isSelected ? "primary" : "secondary"}
                      className="w-full"
                      onClick={() => {
                        music.pause();
                        music.setExternalActive(true);
                        setCuratedTrack(track);
                        setEmbed(null);
                      }}
                    >
                      <Play />
                      {isSelected ? "Now Playing" : "Play stream"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="notice mt-6">
            Track titles are requester-provided labels. Displayed streams link to their official public YouTube players. No video or audio files are downloaded or hosted by FETCH.
          </p>
        </section>
      )}
    </div>
  );
}
