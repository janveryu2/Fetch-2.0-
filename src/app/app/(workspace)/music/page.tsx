"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOut,
  Headphones,
  MusicNotes,
  Play,
  Stop,
  Timer,
  UploadSimple,
  Brain,
  CloudRain,
  Guitar,
  Heart,
  Leaf,
  Playlist,
  Sparkle,
} from "@phosphor-icons/react";
import { useMusic } from "@/components/tools/music-provider";
import { Button } from "@/components/ui/button";
import { youtubeEmbed } from "@/lib/youtube";
import { CURATED_TRACKS } from "@/lib/music/curated-tracks";

export default function MusicPage() {
  const music = useMusic();
  const [tab, setTab] = useState("Local files");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [mood, setMood] = useState("All");
  const nowPlaying = music.externalTrack?.title ?? music.tracks[music.index]?.name;
  const visibleTracks = mood === "All" ? CURATED_TRACKS : CURATED_TRACKS.filter((track) => track.category.toLowerCase() === mood.toLowerCase());

  function toggleCuratedTrack(track: (typeof CURATED_TRACKS)[number]) {
    if (music.externalTrack?.id === track.id) music.stopExternalTrack();
    else music.playExternalTrack({ id: track.id, title: track.title, category: track.category, embedUrl: track.embedUrl, watchUrl: track.watchUrl });
  }
  function selectSource(nextTab: string) {
    setTab(nextTab);
    setError("");
    const target = nextTab === "Local files" ? "music-local" : nextTab === "YouTube audio" ? "music-youtube" : "music-curated";
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="workspace workspace--wide music-refresh">
      <div className="music-hero flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Your space to tune in.</h1>
          <p className="page-description">
            Study with music. Find your focus. Keep the good vibes going.
          </p>
          <div className="music-benefits mt-5 grid gap-3 sm:grid-cols-3">
            <div><Headphones size={25} /><span><strong>Boost focus</strong><small>Music that helps you concentrate</small></span></div>
            <div><Brain size={25} /><span><strong>Reduce stress</strong><small>Calming sounds for study time</small></span></div>
            <div><Heart size={25} /><span><strong>Make it yours</strong><small>Play your favorites, your way</small></span></div>
          </div>
        </div>
        <Image src="/assets/illustrations/fetch-study-companion.png" alt="FETCH listening to study music" width={330} height={220} className="music-hero-mascot" />
        <Button asChild variant="secondary">
          <Link href="/app/pomodoro">
            <Timer />
            Pomodoro Timer
          </Link>
        </Button>
      </div>

      {/* Active Stream Banner if external track is playing */}
      {music.externalTrack && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--fetch-blue-600)] text-white shadow-sm">
              <Headphones size={22} />
            </span>
            <div className="min-w-0">
              <span className="inline-block text-xs font-extrabold uppercase tracking-wider text-[var(--fetch-blue-700)]">
                Active Study Stream · {music.externalTrack.category || "Online"}
              </span>
              <h3 className="truncate text-base font-bold text-[var(--fetch-blue-950)]">
                {music.externalTrack.title}
              </h3>
              <p className="text-xs text-[var(--fetch-blue-800)]">
                Continuous playback is active and stays on while you navigate FETCH.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {music.externalTrack.watchUrl && (
              <Button asChild variant="secondary" size="sm">
                <a
                  href={music.externalTrack.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5"
                >
                  <ArrowSquareOut size={16} />
                  <span>Open on YouTube</span>
                </a>
              </Button>
            )}
            <Button
              variant="quiet"
              size="sm"
              onClick={music.stopExternalTrack}
              className="flex items-center gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Stop size={16} />
              <span>Stop Stream</span>
            </Button>
          </div>
        </div>
      )}

      <div className="music-toolbar mt-5 flex flex-wrap items-center justify-between gap-3">
      <div className="segment music-tabs w-fit">
        {["Local files", "YouTube audio", "Curated music"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => selectSource(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="music-background-note flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold"><Headphones size={20} /> Audio continues while you study across FETCH</p>
      </div>

      <div className="music-main mt-4 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(260px,.9fr)]">
        <section className="surface-card music-player p-5">
          <Image src="/assets/illustrations/focus-lake.png" alt="Mountain lake at sunset album artwork" width={260} height={260} className="music-album-art" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-tertiary)]">NOW PLAYING</p>
            <h2 className="font-display mt-1 line-clamp-2 text-2xl font-semibold">{nowPlaying ?? "Your focus soundtrack"}</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{music.externalTrack?.category ?? (music.tracks.length ? "Your local playlist" : "Choose a stream or add your own music")}</p>
            <div className="mt-3 flex flex-wrap gap-2"><span className="music-tag">Focus</span><span className="music-tag">Study</span><span className="music-tag">Audio</span></div>
            <div className="music-waveform mt-7" aria-hidden="true">{Array.from({ length: 48 }, (_, index) => <i key={index} style={{ height: 8 + ((index * 19) % 30) + "px" }} />)}</div>
            <p className="mt-4 text-xs text-[var(--text-secondary)]">{music.externalTrack ? "Use the YouTube player dock to control this stream." : music.tracks.length ? "Use the player dock to play, pause, seek, and adjust volume." : "Playback starts when you choose a track."}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {music.externalTrack ? <Button variant="secondary" onClick={music.stopExternalTrack}><Stop /> Stop stream</Button> : <Button asChild><a href="#music-library"><Play /> Explore music</a></Button>}
              {music.externalTrack?.watchUrl && <a href={music.externalTrack.watchUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-[var(--fetch-blue-700)]">Open on YouTube <ArrowSquareOut size={16} /></a>}
            </div>
          </div>
        </section>
        <section className="surface-card music-queue p-5">
          <h2 className="font-display flex items-center gap-2 text-xl font-semibold"><Playlist size={22} className="text-[var(--fetch-blue-700)]" /> Up next</h2>
          <div className="mt-3 space-y-1">
            {CURATED_TRACKS.map((track) => <button key={track.id} onClick={() => toggleCuratedTrack(track)} className={"music-queue-row flex w-full items-center gap-3 rounded-xl p-2 text-left " + (music.externalTrack?.id === track.id ? "is-active" : "")}><Image src="/assets/illustrations/focus-lake.png" alt="" width={46} height={46} className="size-11 rounded-lg object-cover" /><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{track.title}</strong><small className="text-[var(--text-secondary)]">{track.category}</small></span><Play size={17} /></button>)}
            {music.tracks.map((track, index) => <button key={track.url} onClick={() => music.select(index)} className={"music-queue-row flex w-full items-center gap-3 rounded-xl p-2 text-left " + (music.index === index && !music.externalTrack ? "is-active" : "")}><span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[var(--fetch-blue-100)]"><MusicNotes size={20} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{track.name}</strong><small className="text-[var(--text-secondary)]">Local file</small></span><Play size={17} /></button>)}
          </div>
        </section>
      </div>

      <section className="music-moods mt-5"><h2 className="font-display text-xl font-semibold">Study moods <span className="ml-2 text-sm font-normal text-[var(--text-secondary)]">Pick a vibe and get in the zone.</span></h2><div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">{[{label:"All",icon:Sparkle},{label:"Focus",icon:Brain},{label:"Lo-Fi",icon:Headphones},{label:"Classical",icon:MusicNotes},{label:"Ambient",icon:Leaf},{label:"Rain Sounds",icon:CloudRain},{label:"Instrumental",icon:Guitar}].map(({label,icon:Icon}) => <button key={label} onClick={() => { setMood(label); selectSource("Curated music"); }} aria-pressed={mood === label} className="music-mood"><Icon size={22} /><span>{label}</span></button>)}</div></section>

      <div id="music-library" className="mt-5" />
      <div className="music-source-grid grid gap-4 lg:grid-cols-3">
      {(
        <section id="music-curated" className={"surface-card music-source-card music-curated-card p-5 " + (tab === "Curated music" ? "is-selected" : "")}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold">
                Curated study streams
              </h2>
              <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
                Hand-picked classical and focus streams for uninterrupted study sessions. Playback persists seamlessly as you switch between your library, flashcards, and tutor.
              </p>
            </div>
            <p className="rounded-full bg-[var(--surface-subtle)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
              {visibleTracks.length} available
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTracks.map((track) => {
              const isSelected = music.externalTrack?.id === track.id;
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
                        if (isSelected) {
                          music.stopExternalTrack();
                        } else {
                          music.playExternalTrack({
                            id: track.id,
                            title: track.title,
                            category: track.category,
                            embedUrl: track.embedUrl,
                            watchUrl: track.watchUrl,
                          });
                        }
                      }}
                    >
                      {isSelected ? (
                        <>
                          <Stop />
                          Stop stream
                        </>
                      ) : (
                        <>
                          <Play />
                          Play stream
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {!visibleTracks.length && <p className="mt-5 text-sm text-[var(--text-secondary)]">No streams in this mood yet. Try Focus or Classical.</p>}
          <p className="notice mt-6">
            Study streams connect to official public YouTube players. Compliant persistent playback keeps audio playing while navigating FETCH without downloading or ripping video media.
          </p>
        </section>
      )}

      {(
        <section id="music-local" className={"surface-card music-source-card music-local-card p-5 " + (tab === "Local files" ? "is-selected" : "")}>
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
            Use the player dock for play, pause, seeking, and volume. Selecting
            another track stops the current one; press play when you’re ready.
          </p>
        </section>
      )}

      {(
        <section id="music-youtube" className={"surface-card music-source-card music-youtube-card p-5 " + (tab === "YouTube audio" ? "is-selected" : "")}>
          <h2 className="font-display text-2xl font-semibold">
            Play through YouTube
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Paste a video or playlist URL. Playback connects to YouTube and persists in the study dock across your entire study session.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = youtubeEmbed(url);
              if (!parsed) {
                setError("Enter a valid HTTPS YouTube video or playlist URL.");
                return;
              }
              music.playExternalTrack({
                title: "Custom YouTube Stream",
                category: "YouTube",
                embedUrl: parsed.src,
                watchUrl: parsed.watch,
              });
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
              Load in Study Player
            </Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
              {error}
            </p>
          )}

          <p className="notice mt-6">
            Continuous background study playback will dock at the bottom of your workspace. YouTube controls, ads, and platform restrictions apply.
          </p>
        </section>
      )}
      </div>
    </div>
  );
}
