"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Headphones,
  MusicNotes,
  Timer,
  UploadSimple,
} from "@phosphor-icons/react";
import { useMusic } from "@/components/tools/music-provider";
import { Button } from "@/components/ui/button";
import { youtubeEmbed } from "@/lib/youtube";
export default function MusicPage() {
  const music = useMusic();
  const [tab, setTab] = useState("Local files"),
    [url, setUrl] = useState("");
  const [embed, setEmbed] = useState<ReturnType<typeof youtubeEmbed>>(null),
    [error, setError] = useState("");
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
              setError("");
              if (t === "YouTube") music.pause();
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
          <div className="py-12 text-center">
            <Headphones
              size={48}
              className="mx-auto text-[var(--fetch-blue-700)]"
            />
            <h2 className="font-display mt-4 text-2xl font-semibold">
              Curated study streams are on the way
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-secondary)]">
              Licensed study channels (Lo-Fi, Ambient, Classical, Nature) are planned for an upcoming release. In the meantime, play your own local music files or paste any study stream from YouTube.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button
                variant="secondary"
                onClick={() => setTab("Local files")}
              >
                Choose local music
              </Button>
              <Button
                variant="quiet"
                onClick={() => setTab("YouTube")}
              >
                Use YouTube player
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
