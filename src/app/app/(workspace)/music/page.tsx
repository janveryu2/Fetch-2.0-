"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowSquareOut,
  Brain,
  CloudRain,
  Guitar,
  Headphones,
  Leaf,
  Lightning,
  MusicNotes,
  Pause,
  Play,
  Playlist,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  Timer,
  UploadSimple,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { useMusic } from "@/components/tools/music-provider";
import { MusicArtwork } from "@/components/tools/music-artwork";
import { Button } from "@/components/ui/button";
import { youtubeEmbed } from "@/lib/youtube";
import {
  CURATED_TRACKS,
  STUDY_MOODS,
  trackDuration,
  tracksForMood,
  type CuratedTrack,
  type StudyMood,
} from "@/lib/music/curated-tracks";
import { cn } from "@/lib/cn";

const moodIcons = [
  Brain,
  Headphones,
  MusicNotes,
  Leaf,
  CloudRain,
  Guitar,
  Lightning,
];
type Source = "Curated music" | "Local files" | "YouTube";

function MusicTrackRow({
  track,
  selected,
  playing,
  onPlay,
}: {
  track: CuratedTrack;
  selected: boolean;
  playing: boolean;
  onPlay: (track: CuratedTrack) => void;
}) {
  return (
    <div className="music-track-row" data-active={selected}>
      <button
        type="button"
        onClick={() => onPlay(track)}
        aria-label={(selected && playing ? "Pause " : "Play ") + track.title}
        className="music-track-main"
      >
        <MusicArtwork src={track.artwork} sizes="56px" />
        <span>
          <strong>{track.title}</strong>
          <small>
            {track.creator} · {trackDuration(track)}
          </small>
        </span>
        {selected && playing ? (
          <Pause size={18} weight="fill" />
        ) : (
          <Play size={18} weight="fill" />
        )}
      </button>
      <a
        href={track.sourceUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={"Open source for " + track.title}
        className="music-track-source"
      >
        <ArrowSquareOut size={18} />
      </a>
    </div>
  );
}

export default function MusicPage() {
  const music = useMusic();
  const [tab, setTab] = useState<Source>("Curated music");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [mood, setMood] = useState<StudyMood | "All">("All");
  const [dragging, setDragging] = useState(false);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const moodTracks = tracksForMood(mood);
  const visibleTracks = moodTracks.filter((track) =>
    (track.title + " " + track.creator)
      .toLowerCase()
      .includes(search.toLowerCase().trim()),
  );
  const displayedTracks = showAll ? visibleTracks : visibleTracks.slice(0, 6);
  const active = music.externalTrack;
  const local = !active && music.tracks[music.index];
  const activeTitle = active?.title ?? (local ? local.name : undefined);
  const current = moodTracks.findIndex((track) => track.id === active?.id);
  const nextTracks =
    current < 0
      ? moodTracks.slice(0, 5)
      : [
          ...moodTracks.slice(current + 1),
          ...moodTracks.slice(0, current),
        ].slice(0, 5);
  const hasMedia = !!active || !!local;

  function playTrack(track: CuratedTrack) {
    if (active?.id === track.id) music.togglePlayback();
    else music.playExternalTrack(track);
  }
  function moveTrack(offset: number) {
    if (local)
      music.select(
        (music.index + offset + music.tracks.length) % music.tracks.length,
      );
    else {
      const pool = current >= 0 ? moodTracks : CURATED_TRACKS;
      const index = pool.findIndex((track) => track.id === active?.id);
      playTrack(pool[(index + offset + pool.length) % pool.length]);
    }
  }
  function selectMood(next: StudyMood | "All") {
    setMood(next);
    setShowAll(false);
    setSearch("");
    setTab("Curated music");
  }
  const seekable = hasMedia && !active?.embedUrl && music.duration > 0;
  const time = (seconds: number) =>
    Math.floor(seconds / 60) +
    ":" +
    String(Math.floor(seconds % 60)).padStart(2, "0");

  return (
    <div className="workspace workspace--wide music-refresh" data-source={tab}>
      <header className="music-hero relative overflow-hidden rounded-3xl">
        <div>
          <h1 className="page-title">Your space to tune in.</h1>
          <p className="page-description">
            Music and quiet sounds for your next study session.
          </p>
        </div>
        <div className="music-hero-art" aria-hidden="true">
          <Image
            src="/assets/backgrounds/music-studio-top.webp"
            alt=""
            width={2172}
            height={724}
            sizes="(max-width: 767px) 100vw, 1px"
          />
        </div>
        <Button asChild variant="secondary">
          <Link href="/app/pomodoro">
            <Timer /> Pomodoro Timer
          </Link>
        </Button>
      </header>

      <div className="music-toolbar">
        <div className="segment" aria-label="Music sources">
          {(["Curated music", "Local files", "YouTube"] as Source[]).map(
            (source, index) => {
              const Icon = [MusicNotes, UploadSimple, YoutubeLogo][index];
              return (
                <button
                  key={source}
                  type="button"
                  aria-pressed={tab === source}
                  onClick={() => setTab(source)}
                >
                  <Icon size={18} />
                  {source}
                </button>
              );
            },
          )}
        </div>
      </div>

      <div className="music-main">
        <section
          aria-label="Music controls"
          className="surface-card music-player"
        >
          <MusicArtwork
            src={active?.artwork}
            className="music-now-art"
            sizes="(max-width: 767px) 104px, 200px"
          />
          <div className="music-player-controls">
            <span className="music-player-label">
              {hasMedia ? "Now playing" : "Your study soundtrack"}
            </span>
            <h2 className="font-display">
              {activeTitle ?? "Choose your study music"}
            </h2>
            <p>
              {active?.creator ??
                (local
                  ? "Local device audio"
                  : "Browse a mood below or add your own audio.")}
            </p>
            {seekable && (
              <div className="music-seek">
                <input
                  type="range"
                  aria-label="Track position"
                  min={0}
                  max={music.duration}
                  step={0.1}
                  value={Math.min(music.currentTime, music.duration)}
                  onChange={(event) => music.seek(Number(event.target.value))}
                />
                <div>
                  <span>{time(music.currentTime)}</span>
                  <span>{time(music.duration)}</span>
                </div>
              </div>
            )}
            <div className="music-transport">
              <button
                type="button"
                aria-label="Previous track"
                onClick={() => moveTrack(-1)}
              >
                <SkipBack size={21} weight="fill" />
              </button>
              <button
                type="button"
                aria-label={music.playing ? "Pause music" : "Play music"}
                className="music-play-button"
                onClick={() =>
                  hasMedia ? music.togglePlayback() : playTrack(moodTracks[0])
                }
              >
                {music.playing ? (
                  <Pause size={24} weight="fill" />
                ) : (
                  <Play size={24} weight="fill" />
                )}
              </button>
              <button
                type="button"
                aria-label="Next track"
                onClick={() => moveTrack(1)}
              >
                <SkipForward size={21} weight="fill" />
              </button>
            </div>
            <label className="music-volume">
              <SpeakerHigh size={19} aria-hidden="true" />
              <span className="sr-only">Volume level</span>
              <input
                aria-label="Volume level"
                type="range"
                min={0}
                max={100}
                value={music.volume}
                onChange={(event) =>
                  music.setVolume(Number(event.target.value))
                }
              />
            </label>
            {music.error && (
              <p role="alert" className="music-error">
                {music.error}
              </p>
            )}
          </div>
        </section>
        <section className="surface-card music-queue">
          <div className="music-section-heading">
            <h2>
              <Playlist size={22} />
              {hasMedia ? "Up next" : "Try a study stream"}
            </h2>
            {local && (
              <button type="button" onClick={music.clear}>
                Clear playlist
              </button>
            )}
          </div>
          <div className="music-queue-list">
            {local
              ? music.tracks
                  .filter((_, index) => index !== music.index)
                  .map((track) => (
                    <button
                      key={track.url}
                      type="button"
                      className="music-local-track"
                      onClick={() => music.select(music.tracks.indexOf(track))}
                    >
                      <MusicNotes size={22} />
                      <span>{track.name}</span>
                      <Play size={18} />
                    </button>
                  ))
              : nextTracks.map((track) => (
                  <MusicTrackRow
                    key={track.id}
                    track={track}
                    selected={active?.id === track.id}
                    playing={music.playing}
                    onPlay={playTrack}
                  />
                ))}
            {local && music.tracks.length === 1 && (
              <p className="notice">
                Add another audio file to continue your playlist.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="music-moods" aria-label="Study moods">
        <div className="music-section-heading">
          <h2>
            <Headphones size={22} />
            Study moods
          </h2>
          <button
            type="button"
            aria-pressed={mood === "All"}
            onClick={() => selectMood("All")}
          >
            All music
          </button>
        </div>
        <div className="music-mood-grid">
          {STUDY_MOODS.map((label, index) => {
            const Icon = moodIcons[index];
            return (
              <button
                key={label}
                type="button"
                className="music-mood"
                aria-label={label}
                aria-describedby={`music-mood-${index}-count`}
                aria-pressed={mood === label}
                onClick={() => selectMood(label)}
              >
                <Icon size={20} />
                <span>
                  {label}
                  <small id={`music-mood-${index}-count`}>
                    {tracksForMood(label).length} items
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="music-source-grid">
        <section id="music-curated" className="surface-card">
          <div className="music-section-heading">
            <h2>
              <MusicNotes size={22} />
              {mood === "All" ? "Curated study music" : mood}
            </h2>
            <span>{visibleTracks.length} items</span>
          </div>
          <label className="music-library-search">
            <span className="sr-only">Search study music</span>
            <input
              className="field"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setShowAll(true);
              }}
              placeholder="Search tracks or creators"
            />
          </label>
          <div className="music-media-grid">
            {displayedTracks.map((track) => {
              const selected = active?.id === track.id;
              return (
                <article
                  key={track.id}
                  className="music-media-card"
                  data-active={selected}
                >
                  <button
                    type="button"
                    className="music-media-play"
                    aria-label={
                      (selected && music.playing ? "Pause " : "Play ") +
                      track.title
                    }
                    onClick={() => playTrack(track)}
                  >
                    <MusicArtwork
                      src={track.artwork}
                      sizes="(max-width: 767px) 45vw, (max-width: 1279px) 26vw, 280px"
                    />
                    <span className="music-media-copy">
                      <strong>{track.title}</strong>
                      <small>{track.creator}</small>
                      <span>
                        {trackDuration(track)} ·{" "}
                        {track.source === "radio" ? "Audio only" : "YouTube"}
                      </span>
                    </span>
                    <span className="music-media-action">
                      {selected && music.playing ? (
                        <Pause weight="fill" size={20} />
                      ) : (
                        <Play weight="fill" size={20} />
                      )}
                    </span>
                  </button>
                  <a
                    href={track.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="music-media-source"
                  >
                    <ArrowSquareOut size={15} />
                    Publisher
                  </a>
                </article>
              );
            })}
          </div>
          {visibleTracks.length === 0 && (
            <p className="notice">
              No matching music. Try another title or creator.
            </p>
          )}
          {visibleTracks.length > 6 && (
            <button
              type="button"
              className="music-show-all"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll
                ? "Show fewer items"
                : "View all " + visibleTracks.length + " items"}
            </button>
          )}
          <p className="music-library-note">
            Native audio streams keep playing while you study. YouTube keeps a
            small video view; minimizing pauses it.
          </p>
        </section>
        <section
          id="music-local"
          className={cn("surface-card", dragging && "music-drop-active")}
        >
          <div className="music-section-heading">
            <h2>
              <UploadSimple size={22} />
              Your own audio
            </h2>
          </div>
          <p>Add MP3, WAV, OGG, or other audio files.</p>
          <div
            className="music-dropzone"
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              music.load(event.dataTransfer.files);
            }}
          >
            <UploadSimple size={30} />
            <p>Drop audio files here</p>
            <label className="music-file-button">
              Choose audio files
              <input
                aria-label="Choose audio files"
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                multiple
                onChange={(event) => {
                  if (event.target.files) music.load(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {music.tracks.length > 0 && (
            <div className="music-local-list">
              {music.tracks.map((track, index) => (
                <button
                  type="button"
                  key={track.url}
                  aria-pressed={!active && index === music.index}
                  onClick={() => music.select(index)}
                >
                  <MusicNotes size={20} />
                  <span>{track.name}</span>
                  <Play size={18} />
                </button>
              ))}
            </div>
          )}
          <p className="music-library-note">
            Files stay on your device and are never uploaded.
          </p>
        </section>
        <section id="music-youtube" className="surface-card">
          <div className="music-section-heading">
            <h2>
              <YoutubeLogo size={22} />
              YouTube study stream
            </h2>
          </div>
          <p>Play a video or playlist from its original source.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed = youtubeEmbed(url);
              if (!parsed) {
                setError("Enter a valid HTTPS YouTube video or playlist URL.");
                return;
              }
              const videoId = new URL(parsed.watch).searchParams.get("v");
              music.playExternalTrack({
                title: "Your YouTube stream",
                category: "YouTube",
                embedUrl: parsed.src,
                watchUrl: parsed.watch,
                artwork: videoId
                  ? "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg"
                  : undefined,
              });
              setError("");
            }}
          >
            <label className="field-label">
              YouTube link
              <input
                aria-label="YouTube video URL"
                className="field"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
              />
            </label>
            <Button type="submit" disabled={!url.trim()}>
              <Play weight="fill" /> Play stream
            </Button>
            {error && (
              <p role="alert" className="music-error">
                {error}
              </p>
            )}
          </form>
          <p className="music-library-note">
            Move the small player using its handle. Minimize to pause; expand to
            resume.
          </p>
        </section>
      </div>
    </div>
  );
}
