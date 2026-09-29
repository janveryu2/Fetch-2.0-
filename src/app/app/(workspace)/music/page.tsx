"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOut,
  Headphones,
  MusicNotes,
  Play,
  Pause,
  Stop,
  Timer,
  UploadSimple,
  Brain,
  CloudRain,
  Guitar,
  Heart,
  Leaf,
  Lightning,
  Playlist,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  Sparkle,
  DotsThreeVertical,
  Info,
  LinkSimple,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { useMusic } from "@/components/tools/music-provider";
import { Button } from "@/components/ui/button";
import { youtubeEmbed } from "@/lib/youtube";
import { CURATED_TRACKS, type CuratedTrack } from "@/lib/music/curated-tracks";
import { cn } from "@/lib/cn";

export default function MusicPage() {
  const music = useMusic();
  const [tab, setTab] = useState("Curated music");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [mood, setMood] = useState("All");
  const [liked, setLiked] = useState(false);
  const [volume, setVolume] = useState(80);
  const [dragging, setDragging] = useState(false);
  const [showAllCurated, setShowAllCurated] = useState(false);

  const activeTrackTitle = music.externalTrack?.title ?? music.tracks[music.index]?.name;
  const isPlaying = !!music.externalTrack || music.tracks.length > 0;
  const visibleTracks = mood === "All"
    ? CURATED_TRACKS
    : CURATED_TRACKS.filter((track) => track.category.toLowerCase() === mood.toLowerCase());

  function toggleCuratedTrack(track: CuratedTrack) {
    if (music.externalTrack?.id === track.id) {
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
  }

  function handleMainPlayToggle() {
    if (music.externalTrack) {
      music.stopExternalTrack();
    } else if (music.tracks.length > 0) {
      music.pause();
    } else if (CURATED_TRACKS.length > 0) {
      toggleCuratedTrack(CURATED_TRACKS[0]);
    }
  }

  function handleNextTrack() {
    if (music.tracks.length > 1) {
      music.select((music.index + 1) % music.tracks.length);
    } else if (CURATED_TRACKS.length > 0) {
      const currentIdx = CURATED_TRACKS.findIndex((t) => t.id === music.externalTrack?.id);
      const nextIdx = (currentIdx + 1) % CURATED_TRACKS.length;
      toggleCuratedTrack(CURATED_TRACKS[nextIdx]);
    }
  }

  function handlePrevTrack() {
    if (music.tracks.length > 1) {
      music.select((music.index - 1 + music.tracks.length) % music.tracks.length);
    } else if (CURATED_TRACKS.length > 0) {
      const currentIdx = CURATED_TRACKS.findIndex((t) => t.id === music.externalTrack?.id);
      const prevIdx = (currentIdx - 1 + CURATED_TRACKS.length) % CURATED_TRACKS.length;
      toggleCuratedTrack(CURATED_TRACKS[prevIdx]);
    }
  }

  function selectSource(nextTab: string) {
    setTab(nextTab);
    setError("");
    const target =
      nextTab === "Local files"
        ? "music-local"
        : nextTab === "YouTube audio"
          ? "music-youtube"
          : "music-curated";
    requestAnimationFrame(() =>
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <div className="workspace workspace--wide music-refresh">
      {/* Hero Banner with Mascot Artwork & Benefits */}
      <div className="music-hero relative flex flex-wrap items-start justify-between gap-6 overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-gradient-to-r from-[#F0F7FF] via-[#E4EFFF] to-[#CDE2FD] p-6 sm:p-8 shadow-xs">
        <div className="relative z-10 max-w-[620px]">
          <h1 className="page-title font-display text-3xl sm:text-4xl font-black tracking-tight text-[#0F264A] dark:text-white">
            Your space to tune in. 🎵
          </h1>
          <p className="page-description mt-2 text-sm sm:text-base text-[#38557D] dark:text-blue-100">
            Study with music. Find your focus. Keep the good vibes going.
          </p>

          <div className="music-benefits mt-6 grid gap-3 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/80 dark:bg-[var(--surface-card)] dark:border-[var(--border-subtle)] p-3 shadow-xs backdrop-blur-xs">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-[#1068E9]">
                <Headphones size={22} weight="bold" />
              </span>
              <div>
                <strong className="block text-xs font-black text-[var(--text-primary)]">Boost focus</strong>
                <small className="block text-[11px] text-[var(--text-secondary)]">Music that helps you concentrate</small>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/80 dark:bg-[var(--surface-card)] dark:border-[var(--border-subtle)] p-3 shadow-xs backdrop-blur-xs">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                <Brain size={22} weight="bold" />
              </span>
              <div>
                <strong className="block text-xs font-black text-[var(--text-primary)]">Reduce stress</strong>
                <small className="block text-[11px] text-[var(--text-secondary)]">Calming sounds for study time</small>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/80 dark:bg-[var(--surface-card)] dark:border-[var(--border-subtle)] p-3 shadow-xs backdrop-blur-xs">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-500">
                <Heart size={22} weight="bold" />
              </span>
              <div>
                <strong className="block text-xs font-black text-[var(--text-primary)]">Make it yours</strong>
                <small className="block text-[11px] text-[var(--text-secondary)]">Play your favorites, your way</small>
              </div>
            </div>
          </div>
        </div>

        <Image
          src="/assets/illustrations/fetch-study-companion.png"
          alt="FETCH listening to study music"
          width={340}
          height={230}
          className="music-hero-mascot select-none pointer-events-none"
          priority
        />

        <Button asChild variant="secondary" className="relative z-10 rounded-xl font-bold shadow-xs">
          <Link href="/app/pomodoro">
            <Timer weight="bold" />
            Pomodoro Timer &rarr;
          </Link>
        </Button>
      </div>

      {/* Active Stream Alert Banner if external track is playing */}
      {music.externalTrack && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-4 sm:p-5 shadow-xs">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--fetch-blue-600)] text-white shadow-sm">
              <Headphones size={22} weight="bold" />
            </span>
            <div className="min-w-0">
              <span className="inline-block text-[10px] font-black uppercase tracking-wider text-[var(--fetch-blue-700)]">
                Active Study Stream · {music.externalTrack.category || "Online"}
              </span>
              <h3 className="truncate text-base font-extrabold text-[var(--fetch-blue-950)]">
                {music.externalTrack.title}
              </h3>
              <p className="text-xs text-[var(--fetch-blue-800)]">
                Continuous playback is docked below and continues while you study across FETCH.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {music.externalTrack.watchUrl && (
              <Button asChild variant="secondary" size="sm" className="rounded-xl text-xs font-bold">
                <a
                  href={music.externalTrack.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5"
                >
                  <ArrowSquareOut size={15} />
                  <span>Open on YouTube</span>
                </a>
              </Button>
            )}
            <Button
              variant="quiet"
              size="sm"
              onClick={music.stopExternalTrack}
              className="flex items-center gap-1 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold"
            >
              <Stop size={15} weight="bold" />
              <span>Stop Stream</span>
            </Button>
          </div>
        </div>
      )}

      {/* Source Navigation Tabs & Background Play Notice */}
      <div className="music-toolbar mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-2xl bg-[var(--surface-subtle)] p-1 border border-[var(--border-subtle)]">
          {[
            { id: "Local files", icon: UploadSimple },
            { id: "YouTube audio", icon: Play },
            { id: "Curated music", icon: Sparkle },
          ].map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => selectSource(id)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-all cursor-pointer",
                tab === id
                  ? "bg-[#1068E9] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:bg-[var(--surface-card)] hover:text-[var(--text-primary)]",
              )}
            >
              <Icon size={16} weight="bold" />
              {id}
            </button>
          ))}
        </div>

        <p className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold text-emerald-800">
          <Headphones size={16} weight="bold" />
          <span>Audio-only mode · Keep studying — music continues in the background.</span>
        </p>
      </div>

      {/* Main Now Playing Panel & Up Next Queue */}
      <div className="music-main mt-4 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
        {/* Left: Now Playing Stage */}
        <section className="surface-card music-player rounded-3xl border border-[var(--border-subtle)] p-6 shadow-xs flex flex-col md:flex-row items-center gap-6">
          <div className="relative shrink-0">
            <Image
              src="/assets/illustrations/focus-lake.png"
              alt="Mountain lake at sunset album artwork"
              width={240}
              height={240}
              className="size-48 sm:size-56 rounded-2xl object-cover shadow-sm"
              priority
            />
          </div>

          <div className="min-w-0 flex-1 w-full">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-tertiary)]">
                NOW PLAYING
              </span>
              <button
                type="button"
                onClick={() => setLiked(!liked)}
                aria-label={liked ? "Unlike track" : "Like track"}
                className="text-[var(--text-tertiary)] hover:text-rose-500 transition-colors cursor-pointer"
              >
                <Heart size={20} weight={liked ? "fill" : "regular"} className={liked ? "text-rose-500" : ""} />
              </button>
            </div>

            <h2 className="font-display mt-1 line-clamp-1 text-2xl font-black text-[var(--text-primary)]">
              {activeTrackTitle ?? "Focus Flow"}
            </h2>
            <p className="mt-0.5 text-xs font-bold text-[var(--text-secondary)]">
              {music.externalTrack?.category ?? (music.tracks.length ? "Local Playlist" : "Chillhop Essentials")}
            </p>

            {/* Vibe Tags */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-[var(--fetch-blue-50)] px-3 py-0.5 text-[11px] font-extrabold text-[var(--fetch-blue-700)]">
                Lo-fi
              </span>
              <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-0.5 text-[11px] font-extrabold text-[var(--text-secondary)]">
                Focus
              </span>
              <span className="rounded-full bg-[var(--surface-subtle)] px-3 py-0.5 text-[11px] font-extrabold text-[var(--text-secondary)]">
                Instrumental
              </span>
            </div>

            {/* Decorative Waveform Graphic */}
            <div className="mt-5">
              <div
                className="music-waveform flex h-10 items-center gap-1 overflow-hidden"
                aria-hidden="true"
              >
                {Array.from({ length: 42 }, (_, index) => {
                  const heights = [12, 18, 26, 32, 20, 14, 28, 36, 24, 16, 30, 22];
                  const barH = heights[index % heights.length];
                  return (
                    <i
                      key={index}
                      className={cn(
                        "w-1 rounded-full transition-all",
                        index < 18 ? "bg-[#1068E9]" : "bg-[var(--border-strong)]",
                      )}
                      style={{ height: `${barH}px` }}
                    />
                  );
                })}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] font-mono font-bold text-[var(--text-tertiary)]">
                <span>1:42</span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-sans">
                  Decorative visualizer · Audio via dock
                </span>
                <span>3:56</span>
              </div>
            </div>

            {/* Audio Controls Bar */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label="Shuffle"
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Shuffle size={18} weight="bold" />
                </button>
                <button
                  type="button"
                  onClick={handlePrevTrack}
                  aria-label="Previous track"
                  className="text-[var(--text-primary)] hover:text-[#1068E9] transition-colors cursor-pointer"
                >
                  <SkipBack size={20} weight="fill" />
                </button>
                <button
                  type="button"
                  onClick={handleMainPlayToggle}
                  aria-label={isPlaying ? "Pause music" : "Play music"}
                  className="flex size-11 items-center justify-center rounded-full bg-[#1068E9] text-white shadow-md hover:bg-[#0D57C5] transition-transform active:scale-95 cursor-pointer"
                >
                  {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" className="ml-0.5" />}
                </button>
                <button
                  type="button"
                  onClick={handleNextTrack}
                  aria-label="Next track"
                  className="text-[var(--text-primary)] hover:text-[#1068E9] transition-colors cursor-pointer"
                >
                  <SkipForward size={20} weight="fill" />
                </button>
                <button
                  type="button"
                  aria-label="Repeat"
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <Repeat size={18} weight="bold" />
                </button>
              </div>

              {/* Volume Slider */}
              <div className="flex items-center gap-2">
                <SpeakerHigh size={18} className="text-[var(--text-tertiary)]" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  aria-label="Volume level"
                  className="h-1.5 w-20 sm:w-24 cursor-pointer accent-[#1068E9]"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Right: Up Next Queue */}
        <section className="surface-card music-queue rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 text-base font-bold text-[var(--text-primary)]">
              <Playlist size={20} className="text-[#1068E9]" weight="bold" />
              Up next
            </h2>
            <button
              type="button"
              onClick={() => {
                if (music.tracks.length > 0) music.clear();
                if (music.externalTrack) music.stopExternalTrack();
              }}
              className="text-xs font-bold text-[var(--fetch-blue-700)] hover:underline cursor-pointer"
            >
              Clear all
            </button>
          </div>

          <div className="mt-3.5 space-y-1.5 overflow-y-auto max-h-[300px]">
            {/* Curated Track Rows */}
            {CURATED_TRACKS.map((track, i) => {
              const isActive = music.externalTrack?.id === track.id;
              return (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => toggleCuratedTrack(track)}
                  className={cn(
                    "music-queue-row flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors cursor-pointer",
                    isActive
                      ? "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-900)] font-bold"
                      : "hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  {isActive ? (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#1068E9] text-white">
                      <span className="flex items-end gap-0.5 h-3.5">
                        <i className="w-0.5 bg-white h-2 animate-pulse" />
                        <i className="w-0.5 bg-white h-3.5 animate-pulse" />
                        <i className="w-0.5 bg-white h-2.5 animate-pulse" />
                      </span>
                    </span>
                  ) : (
                    <Image
                      src="/assets/illustrations/focus-lake.png"
                      alt=""
                      width={40}
                      height={40}
                      className="size-10 rounded-xl object-cover"
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs text-[var(--text-primary)]">{track.title}</strong>
                    <small className="text-[11px] text-[var(--text-secondary)]">{track.category}</small>
                  </span>
                  <span className="text-[11px] font-mono text-[var(--text-tertiary)] shrink-0">
                    {i === 0 ? "4:12" : i === 1 ? "3:28" : "3:51"}
                  </span>
                  <DotsThreeVertical size={16} className="text-[var(--text-tertiary)] shrink-0" />
                </button>
              );
            })}

            {/* Local Track Rows */}
            {music.tracks.map((track, index) => {
              const isActive = music.index === index && !music.externalTrack;
              return (
                <button
                  key={track.url}
                  type="button"
                  onClick={() => music.select(index)}
                  className={cn(
                    "music-queue-row flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors cursor-pointer",
                    isActive
                      ? "bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-900)] font-bold"
                      : "hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1068E9]">
                    <MusicNotes size={20} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs text-[var(--text-primary)]">{track.name}</strong>
                    <small className="text-[11px] text-[var(--text-secondary)]">Local file</small>
                  </span>
                  <Play size={15} weight="fill" className="text-[var(--text-tertiary)] shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Study Moods Chips Row */}
      <section className="music-moods mt-6">
        <div className="flex items-center gap-2">
          <MusicNotes size={20} className="text-[#1068E9]" weight="bold" />
          <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">Study moods</h2>
          <span className="text-xs text-[var(--text-secondary)]">Pick a vibe and get in the zone.</span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {[
            { label: "Deep Focus", icon: Brain, bg: "hover:border-blue-300 hover:bg-blue-50/50" },
            { label: "Lo-fi", icon: Headphones, bg: "hover:border-purple-300 hover:bg-purple-50/50" },
            { label: "Classical", icon: MusicNotes, bg: "hover:border-amber-300 hover:bg-amber-50/50" },
            { label: "Ambient", icon: Leaf, bg: "hover:border-emerald-300 hover:bg-emerald-50/50" },
            { label: "Rain Sounds", icon: CloudRain, bg: "hover:border-cyan-300 hover:bg-cyan-50/50" },
            { label: "Instrumental", icon: Guitar, bg: "hover:border-rose-300 hover:bg-rose-50/50" },
            { label: "Brain Boost", icon: Lightning, bg: "hover:border-yellow-300 hover:bg-yellow-50/50" },
          ].map(({ label, icon: Icon, bg }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setMood(label);
                selectSource("Curated music");
              }}
              aria-pressed={mood === label}
              className={cn(
                "music-mood flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-bold transition-all cursor-pointer shadow-2xs",
                mood === label
                  ? "border-[#1068E9] bg-blue-50 text-[#1068E9] ring-2 ring-[#1068E9]/15"
                  : `border-[var(--border-subtle)] bg-[var(--surface-card)] text-[var(--text-primary)] ${bg}`,
              )}
            >
              <Icon size={18} weight="bold" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <div id="music-library" className="mt-6" />
      <div className="music-source-grid grid gap-4 lg:grid-cols-3 items-start">
        {/* Card 1: Upload your own music */}
        <section
          id="music-local"
          className={cn(
            "surface-card rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs flex flex-col justify-between transition-all",
            tab === "Local files" && "ring-2 ring-[#1068E9]/20 border-[#1068E9]",
          )}
        >
          <div>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-[#1068E9]">
                <UploadSimple size={22} weight="bold" />
              </span>
              <div>
                <h2 className="font-display text-base font-extrabold text-[var(--text-primary)]">
                  Upload your own music
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Add MP3, WAV, OGG, or other audio files.
                </p>
              </div>
            </div>

            {/* Dashed dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (e.dataTransfer.files) music.load(e.dataTransfer.files);
              }}
              className={cn(
                "mt-4 flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed p-5 text-center transition-colors",
                dragging
                  ? "border-[#1068E9] bg-blue-50/50"
                  : "border-[var(--border-subtle)] bg-[var(--surface-subtle)]",
              )}
            >
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                <UploadSimple size={20} className="text-[var(--text-tertiary)] shrink-0" />
                <span>Drag and drop audio files here</span>
              </div>
              <span className="text-[11px] font-bold text-[var(--text-tertiary)]">or</span>
              <label className="relative inline-flex cursor-pointer items-center justify-center rounded-xl bg-[#1068E9] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#0D57C5] transition-colors">
                <span>Choose audio files</span>
                <input
                  aria-label="Choose audio files"
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                  multiple
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => {
                    if (e.target.files) music.load(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {music.error && (
              <p role="alert" className="mt-3 text-xs font-bold text-[var(--danger)]">
                {music.error}
              </p>
            )}

            {music.tracks.length > 0 && (
              <div className="mt-3 max-h-36 overflow-y-auto space-y-1 divide-y divide-[var(--border-subtle)]">
                {music.tracks.map((t, i) => (
                  <button
                    key={t.url}
                    aria-pressed={music.index === i && !music.externalTrack}
                    onClick={() => music.select(i)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-xl p-2 text-left text-xs transition-colors",
                      music.index === i && !music.externalTrack
                        ? "bg-blue-50 font-bold text-[#1068E9]"
                        : "hover:bg-[var(--surface-subtle)]",
                    )}
                  >
                    <span className="truncate">{t.name}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                      {music.index === i && !music.externalTrack ? "Playing" : "Play"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="mt-4 text-[11px] text-[var(--text-tertiary)]">
            Files stay on your device and are never uploaded. Playback persists via the docked study player.
          </p>
        </section>

        {/* Card 2: Extract audio from YouTube */}
        <section
          id="music-youtube"
          className={cn(
            "surface-card rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs flex flex-col justify-between transition-all",
            tab === "YouTube audio" && "ring-2 ring-[#1068E9]/20 border-[#1068E9]",
          )}
        >
          <div>
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                <YoutubeLogo size={22} weight="fill" />
              </span>
              <div>
                <h2 className="font-display text-base font-extrabold text-[var(--text-primary)]">
                  Extract audio from YouTube
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  Paste a YouTube link to extract and play the audio.
                </p>
              </div>
            </div>

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
              className="mt-4 flex flex-col gap-2"
            >
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-1.5 focus-within:border-[#1068E9] focus-within:ring-2 focus-within:ring-[#1068E9]/15">
                <LinkSimple size={18} className="ml-2 text-[var(--text-tertiary)] shrink-0" />
                <input
                  type="url"
                  className="w-full bg-transparent px-2 py-1 text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  aria-label="YouTube video URL"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!url.trim()}
                  className="shrink-0 rounded-xl bg-[#1068E9] text-xs font-bold text-white hover:bg-[#0D57C5]"
                >
                  <span>Extract audio</span>
                  <span>&rarr;</span>
                </Button>
              </div>

              {error && (
                <p role="alert" className="mt-1 text-xs font-bold text-[var(--danger)]">
                  {error}
                </p>
              )}
            </form>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-2 rounded-xl bg-blue-50/60 p-2 text-[11px] text-[#1068E9]">
              <Info size={16} weight="bold" className="shrink-0" />
              <span>Audio-only. No video playback. Perfect for background study.</span>
            </div>
            <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">
              Continuous background playback docks at the bottom of your workspace. YouTube platform terms apply.
            </p>
          </div>
        </section>

        {/* Card 3: Curated playlists */}
        <section
          id="music-curated"
          className={cn(
            "surface-card rounded-3xl border border-[var(--border-subtle)] p-5 shadow-xs flex flex-col justify-between transition-all",
            tab === "Curated music" && "ring-2 ring-[#1068E9]/20 border-[#1068E9]",
          )}
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                  <Sparkle size={22} weight="bold" />
                </span>
                <h2 className="font-display text-base font-extrabold text-[var(--text-primary)]">
                  Curated playlists
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAllCurated((v) => !v);
                }}
                className="text-xs font-bold text-[#1068E9] hover:underline cursor-pointer"
              >
                {showAllCurated ? "Hide all" : "View all"}
              </button>
            </div>

            {/* 3 Playlist Cards with thumbnails */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                {
                  title: "Focus Flow",
                  desc: "Stay in the zone",
                  img: "/assets/illustrations/playlist-focus-flow.png",
                  track: CURATED_TRACKS[2] ?? CURATED_TRACKS[0],
                },
                {
                  title: "Calm Coding",
                  desc: "For deep work",
                  img: "/assets/illustrations/playlist-calm-coding.png",
                  track: CURATED_TRACKS[1],
                },
                {
                  title: "Study Cafe",
                  desc: "Chill beats & coffee",
                  img: "/assets/illustrations/playlist-study-cafe.png",
                  track: CURATED_TRACKS[0],
                },
              ].map((item, idx) => {
                const isSelected = item.track && music.externalTrack?.id === item.track.id;
                return (
                  <div
                    key={idx}
                    onClick={() => item.track && toggleCuratedTrack(item.track)}
                    className="group relative cursor-pointer overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] transition-all hover:shadow-md hover:scale-[1.02]"
                  >
                    <div className="relative aspect-4/3 w-full overflow-hidden">
                      <Image
                        src={item.img}
                        alt={item.title}
                        fill
                        sizes="(max-width: 768px) 100px, 140px"
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-1.5 left-2 right-8">
                        <span className="block truncate text-[11px] font-extrabold text-white leading-tight">
                          {item.title}
                        </span>
                        <span className="block truncate text-[9px] text-white/80">
                          {item.desc}
                        </span>
                      </div>
                      <div className="absolute bottom-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-white text-[#1068E9] shadow-xs">
                        {isSelected ? <Stop size={12} weight="fill" /> : <Play size={12} weight="fill" className="ml-0.5" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {showAllCurated && (
              <div className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3 max-h-40 overflow-y-auto">
                {visibleTracks.map((track) => {
                  const isSelected = music.externalTrack?.id === track.id;
                  return (
                    <div
                      key={track.id}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl p-2 text-xs transition-colors",
                        isSelected ? "bg-blue-50 text-[#1068E9] font-bold" : "hover:bg-[var(--surface-subtle)]",
                      )}
                    >
                      <span className="truncate">{track.title}</span>
                      <Button
                        size="sm"
                        variant={isSelected ? "primary" : "secondary"}
                        className="h-7 px-2.5 text-[11px]"
                        onClick={() => toggleCuratedTrack(track)}
                      >
                        {isSelected ? "Stop" : "Play"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="mt-4 text-[11px] text-[var(--text-tertiary)]">
            Official public study streams. Audio continues seamlessly as you study across FETCH.
          </p>
        </section>
      </div>
    </div>
  );
}
