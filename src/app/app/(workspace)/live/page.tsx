"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Copy,
  RocketLaunch,
  SignIn,
  UsersThree,
  Play,
  ArrowRight,
  Trophy,
  CheckCircle,
  XCircle,
  Globe,
  Lock,
  Lightbulb,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useDemo } from "@/components/app/demo-provider";

interface RoomMember {
  userId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  score: number;
  isHost: boolean;
  isMe: boolean;
}

interface RoomQuestion {
  index: number;
  prompt: string;
  options: string[];
  myAnswer?: {
    selectedIndex: number;
    isCorrect: boolean;
    pointsAwarded: number;
  } | null;
  correctIndex?: number | null;
  explanation?: string | null;
}

interface LiveRoomState {
  roomId: string;
  hostId: string;
  isHost: boolean;
  packId: string;
  packTitle: string;
  joinCode: string;
  status: "lobby" | "active" | "complete";
  currentQuestionIndex: number;
  questionCount: number;
  version: number;
  members: RoomMember[];
  currentQuestion?: RoomQuestion | null;
}

interface LiveHome {
  rooms: { roomId: string; packTitle: string; status: "lobby" | "active"; visibility: "public" | "private"; maxPlayers: number; playerCount: number; isMember: boolean }[];
  leaderboard: { userId: string; displayName: string; avatarUrl: string | null; score: number; roomsPlayed: number; accuracy: number }[];
}

export default function LivePage() {
  const { mode, packs } = useDemo();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [chosenPackId, setChosenPackId] = useState("");
  const eligiblePacks = packs.filter(pack => pack.questions.some(question => question.type === "multiple_choice"));
  const selectedPackId = eligiblePacks.find(pack => pack.id === chosenPackId)?.id ?? eligiblePacks[0]?.id ?? "";
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [period, setPeriod] = useState("week");
  const [overview, setOverview] = useState<LiveHome | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Real room state for account mode
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<LiveRoomState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const roomRef = useRef<string | null>(null);
  const overviewRequest = useRef(0);

  const refreshOverview = useCallback(async () => {
    if (mode !== "account") return;
    const requestId = ++overviewRequest.current;
    setOverviewLoading(true);
    try {
      const response = await fetch(`/api/live/rooms?period=${period}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unable to load live rooms. Try again.");
      const data: LiveHome = await response.json();
      if (requestId !== overviewRequest.current) return;
      setOverview(data);
      setOverviewError("");
    } catch (error) {
      if (requestId === overviewRequest.current) setOverviewError(error instanceof Error ? error.message : "Unable to load live rooms.");
    } finally {
      if (requestId === overviewRequest.current) setOverviewLoading(false);
    }
  }, [mode, period]);

  useEffect(() => {
    const requestCounter = overviewRequest;
    const frame = requestAnimationFrame(() => { void refreshOverview(); });
    const interval = setInterval(() => { void refreshOverview(); }, 15000);
    return () => { cancelAnimationFrame(frame); clearInterval(interval); requestCounter.current++; };
  }, [refreshOverview]);

  // Poll room state while in an active or lobby room
  const fetchRoomState = useCallback(async (roomId: string) => {
    try {
      const res = await fetch(`/api/live/rooms/${roomId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (roomRef.current === roomId) setRoomState(current => current?.roomId === roomId && current.version > data.version ? current : data);
      } else if (roomRef.current === roomId) {
        setStatus("Unable to load this room. Retry or return to Live home.");
      }
    } catch {
      // Ignore polling hiccups
    }
  }, []);

  useEffect(() => {
    if (!activeRoomId || mode !== "account") return;

    let active = true;
    const interval = setInterval(() => {
      if (active) {
        void fetchRoomState(activeRoomId);
      }
    }, 2000);

    const frame = requestAnimationFrame(() => {
      if (active) {
        void fetchRoomState(activeRoomId);
      }
    });

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      clearInterval(interval);
    };
  }, [activeRoomId, mode, fetchRoomState]);

  async function copyCode(codeToCopy: string) {
    try {
      await navigator.clipboard.writeText(codeToCopy);
      setStatus("Room code copied to clipboard.");
    } catch {
      setStatus("Clipboard unavailable. Select and copy the room code manually.");
    }
  }

  // Create real room
  async function handleCreateRoom() {
    if (!selectedPackId) {
      setStatus("Please select a study pack first.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/live/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: selectedPackId, visibility, maxPlayers }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create room.");
      }
      const data = await res.json();
      roomRef.current = data.roomId;
      setActiveRoomId(data.roomId);
      setStatus(`Room created. Share code ${data.joinCode} with friends.`);
      await fetchRoomState(data.roomId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create room.");
    } finally {
      setLoading(false);
    }
  }

  // Join real room
  async function handleJoinRoom(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    await joinRoom({ joinCode: code });
  }

  async function joinRoom(payload: { joinCode: string } | { roomId: string }) {
    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/live/rooms/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to join room.");
      }
      const data = await res.json();
      roomRef.current = data.roomId;
      setActiveRoomId(data.roomId);
      setStatus("Joined room.");
      await fetchRoomState(data.roomId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to join room.");
    } finally {
      setLoading(false);
    }
  }

  async function leaveRoom() {
    if (!activeRoomId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/live/rooms/${activeRoomId}/action`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "leave" }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Unable to leave room. Try again.");
      }
      roomRef.current = null;
      setActiveRoomId(null);
      setRoomState(null);
      setStatus("Left room.");
      void refreshOverview();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to leave room.");
    } finally { setLoading(false); }
  }

  // Host starts game
  async function handleStartGame() {
    if (!activeRoomId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/live/rooms/${activeRoomId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start game.");
      }
      await fetchRoomState(activeRoomId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to start game.");
    } finally {
      setLoading(false);
    }
  }

  // Submit answer
  async function handleSubmitAnswer(selectedIndex: number) {
    if (!activeRoomId || !roomState?.currentQuestion || submitting) return;
    setSubmitting(true);
    setStatus("");
    try {
      const res = await fetch(`/api/live/rooms/${activeRoomId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit_answer",
          questionIndex: roomState.currentQuestion.index,
          selectedIndex,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit answer.");
      }
      await fetchRoomState(activeRoomId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to submit answer.");
    } finally {
      setSubmitting(false);
    }
  }

  // Host advances question
  async function handleAdvanceQuestion() {
    if (!activeRoomId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/live/rooms/${activeRoomId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "advance" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to advance question.");
      }
      await fetchRoomState(activeRoomId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to advance.");
    } finally {
      setLoading(false);
    }
  }

  const [mobileAction, setMobileAction] = useState("create");
  return (
    <div className="workspace workspace--wide live-refresh" data-action={mobileAction}>
      <header className="live-hero">
        <div className="live-hero-copy">
          <h1 className="page-title">Study together.<br /><span>Challenge each other.</span></h1>
          <p className="page-description">Turn practice into a friendly live challenge with your study buddies.</p>
          <div className="live-benefits">
            <div><UsersThree size={24} /><span><strong>Real-time practice</strong><small>Study together live</small></span></div>
            <div><Trophy size={24} /><span><strong>Friendly competition</strong><small>Stay motivated</small></span></div>
            <div><CheckCircle size={24} /><span><strong>Learn together</strong><small>With friends by your side</small></span></div>
          </div>
        </div>
        <Image src="/assets/mascot/fetch-active.png" alt="FETCH ready for a challenge" width={240} height={240} className="pixel-art live-hero-mascot" />
      </header>
      {mode !== "account" && <p className="notice mt-5">Sign in to create rooms and study live with friends. <Link href="/app/start" className="underline">Sign in</Link></p>}
      {activeRoomId && !roomState && <p role="status" className="notice mt-5">Loading your room… <Button variant="quiet" onClick={() => void fetchRoomState(activeRoomId)}>Retry loading</Button><Button variant="quiet" onClick={leaveRoom} disabled={loading}>Leave Room</Button></p>}

      {/* Active Game or Lobby View */}
      {roomState && activeRoomId ? (
        <div className="mt-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-bold">{roomState.packTitle}</span>
                <Badge tone={roomState.status === "active" ? "success" : "neutral"}>
                  {roomState.status === "lobby"
                    ? "In Lobby"
                    : roomState.status === "active"
                    ? `Question ${roomState.currentQuestionIndex + 1} of ${roomState.questionCount}`
                    : "Game Complete"}
                </Badge>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Room Code: <span className="font-mono font-bold tracking-wider text-[var(--fetch-blue-700)]">{roomState.joinCode}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="quiet"
                onClick={() => copyCode(roomState.joinCode)}
                className="text-xs"
              >
                <Copy size={16} />
                Copy Code
              </Button>
              <Button
                variant="quiet"
                onClick={leaveRoom}
                disabled={loading}
                className="text-xs"
              >
                Leave Room
              </Button>
            </div>
          </div>

          {/* Lobby Screen */}
          {roomState.status === "lobby" && (
            <div className="py-8 text-center max-w-lg mx-auto">
              <h2 className="font-display text-2xl font-bold">Waiting for players...</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Share code <span className="font-mono font-bold text-base text-[var(--fetch-blue-700)]">{roomState.joinCode}</span> with your study buddies.
              </p>

              <div className="mt-6 border border-[var(--border-subtle)] rounded-xl p-4 text-left">
                <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                  Players in Room ({roomState.members.length})
                </h3>
                <div className="flex flex-col gap-2">
                  {roomState.members.map((m) => (
                    <div key={m.userId} className="flex items-center justify-between p-2 rounded-lg bg-[var(--surface-subtle)] text-sm">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          src={m.avatarUrl}
                          alt={m.displayName}
                          size={28}
                          className="size-7 rounded-lg"
                        />
                        <span className="font-medium">{m.displayName}</span>
                        {m.isMe && <span className="text-xs text-[var(--text-secondary)]">(You)</span>}
                      </div>
                      {m.isHost && <Badge tone="warning">Host</Badge>}
                    </div>
                  ))}
                </div>
              </div>

              {roomState.isHost ? (
                <Button
                  className="mt-6 w-full"
                  onClick={handleStartGame}
                  disabled={loading}
                >
                  <Play weight="fill" />
                  Start Competition
                </Button>
              ) : (
                <p className="mt-6 text-sm text-[var(--text-secondary)] italic">
                  Waiting for host to start the competition...
                </p>
              )}
            </div>
          )}

          {/* Active Question Screen */}
          {roomState.status === "active" && roomState.currentQuestion && (
            <div className="py-6 grid gap-6 md:grid-cols-[1fr_260px]">
              <div>
                <span className="text-xs font-bold uppercase text-[var(--text-secondary)] tracking-wider">
                  Question {roomState.currentQuestion.index + 1}
                </span>
                <h2 className="font-display text-xl font-bold mt-1 text-[var(--text-primary)]">
                  {roomState.currentQuestion.prompt}
                </h2>

                {/* Choices */}
                <div className="mt-6 grid gap-3">
                  {roomState.currentQuestion.options.map((opt, idx) => {
                    const myAnswer = roomState.currentQuestion?.myAnswer;
                    const hasAnswered = !!myAnswer;
                    const isSelected = myAnswer?.selectedIndex === idx;
                    const isCorrectChoice = roomState.currentQuestion?.correctIndex === idx;

                    let btnClass = "border border-[var(--border-subtle)] hover:bg-[var(--surface-subtle)]";
                    if (hasAnswered) {
                      if (isCorrectChoice) {
                        btnClass = "border-2 border-[var(--semantic-success-border)] bg-[var(--semantic-success-subtle)] text-[var(--semantic-success-text)] font-semibold";
                      } else if (isSelected) {
                        btnClass = "border-2 border-[var(--semantic-danger-border)] bg-[var(--semantic-danger-subtle)] text-[var(--semantic-danger-text)]";
                      } else {
                        btnClass = "opacity-50 border border-[var(--border-subtle)]";
                      }
                    }

                    return (
                      <button
                        key={idx}
                        disabled={hasAnswered || submitting}
                        onClick={() => handleSubmitAnswer(idx)}
                        className={`flex items-center justify-between p-4 rounded-xl text-left transition-all ${btnClass}`}
                      >
                        <span className="text-sm font-medium">{opt}</span>
                        {hasAnswered && isCorrectChoice && (
                          <CheckCircle size={20} weight="fill" className="text-[var(--semantic-success-text)] shrink-0" />
                        )}
                        {hasAnswered && isSelected && !isCorrectChoice && (
                          <XCircle size={20} weight="fill" className="text-[var(--semantic-danger-text)] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Explanation if answered */}
                {roomState.currentQuestion.explanation && (
                  <div className="mt-4 p-4 rounded-xl bg-[var(--surface-subtle)] text-xs text-[var(--text-secondary)]">
                    <span className="font-bold text-[var(--text-primary)] block mb-1">Explanation:</span>
                    {roomState.currentQuestion.explanation}
                  </div>
                )}

                {/* Host advance button */}
                {roomState.isHost && (
                  <Button
                    className="mt-6"
                    onClick={handleAdvanceQuestion}
                    disabled={loading}
                  >
                    Next Question
                    <ArrowRight />
                  </Button>
                )}
              </div>

              {/* Live Leaderboard Sidebar */}
              <div className="border-t md:border-t-0 md:border-l border-[var(--border-subtle)] pt-4 md:pt-0 md:pl-6">
                <h3 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Trophy size={16} className="text-amber-500" />
                  Live Leaderboard
                </h3>
                <div className="flex flex-col gap-2">
                  {roomState.members.map((m, idx) => (
                    <div
                      key={m.userId}
                      className={`flex items-center justify-between p-2.5 rounded-lg text-sm ${
                        m.isMe ? "bg-[var(--fetch-blue-50)] ring-1 ring-[var(--fetch-blue-200)]" : "bg-[var(--surface-subtle)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-xs font-bold text-[var(--text-tertiary)] w-4">{idx + 1}</span>
                        <UserAvatar
                          src={m.avatarUrl}
                          alt={m.displayName}
                          size={24}
                          className="size-6 rounded-md"
                        />
                        <span className="font-medium truncate">{m.displayName}</span>
                      </div>
                      <span className="font-mono font-bold text-xs text-[var(--fetch-blue-700)] shrink-0">
                        {m.score} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Complete Screen */}
          {roomState.status === "complete" && (
            <div className="py-8 text-center max-w-md mx-auto">
              <Trophy size={48} weight="duotone" className="text-amber-500 mx-auto" />
              <h2 className="font-display text-2xl font-bold mt-3">Competition Finished!</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Final Leaderboard for {roomState.packTitle}
              </p>

              <div className="mt-6 border border-[var(--border-subtle)] rounded-xl p-4 text-left">
                <div className="flex flex-col gap-2">
                  {roomState.members.map((m, idx) => (
                    <div
                      key={m.userId}
                      className={`flex items-center justify-between p-3 rounded-lg text-sm ${
                        idx === 0
                          ? "bg-[var(--surface-subtle)] border border-[var(--border-subtle)] font-bold"
                          : "bg-[var(--surface-subtle)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{idx + 1}</span>
                        <UserAvatar
                          src={m.avatarUrl}
                          alt={m.displayName}
                          size={24}
                          className="size-6 rounded-md"
                        />
                        <span>{m.displayName}</span>
                        {m.isMe && <span className="text-xs text-[var(--text-secondary)]">(You)</span>}
                      </div>
                      <span className="font-mono font-bold text-sm text-[var(--fetch-blue-700)]">
                        {m.score} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                className="mt-6 w-full"
                onClick={leaveRoom}
                disabled={loading}
              >
                Back to Live Home
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
        <div className="live-mobile-actions segment" aria-label="Room action">
          <button type="button" aria-pressed={mobileAction === "create"} onClick={() => setMobileAction("create")}>Create a room</button>
          <button type="button" aria-pressed={mobileAction === "join"} onClick={() => setMobileAction("join")}>Join a room</button>
        </div>
        <div className="live-actions">
          <section className="surface-card live-panel live-create-panel">
            <div className="live-panel-heading"><span className="live-icon"><RocketLaunch size={28} /></span><div><h2>Create a room</h2><p>Select a StudyPack and set up your live study session.</p></div></div>
            <label className="field-label live-pack-label">Select StudyPack
              <select className="field mt-2" value={selectedPackId} onChange={e => setChosenPackId(e.target.value)} disabled={mode !== "account" || !eligiblePacks.length}>
                {!eligiblePacks.length && <option value="">No eligible quizzes yet</option>}
                {eligiblePacks.map(pack => <option key={pack.id} value={pack.id}>{pack.title}</option>)}
              </select>
            </label>
            {!eligiblePacks.length && <p className="live-help">Live rooms need a quiz with multiple-choice questions. <Link href="/app/home" className="underline">Create a quiz</Link> to get started.</p>}
            <div className="live-settings">
              <fieldset><legend>Room privacy</legend><div className="live-choice-group">
                {(["public", "private"] as const).map(value => <label key={value} className="live-choice" data-selected={visibility === value}>
                  <input type="radio" name="visibility" value={value} checked={visibility === value} onChange={() => setVisibility(value)} />
                  {value === "public" ? <Globe size={22} /> : <Lock size={22} />}<span><strong>{value === "public" ? "Public" : "Private"}</strong><small>{value === "public" ? "Anyone can join" : "Code invitation only"}</small></span>
                </label>)}
              </div></fieldset>
              <fieldset><legend>Max players</legend><div className="live-choice-group">
                {[2, 4, 6].map(value => <label key={value} className="live-choice live-capacity" data-selected={maxPlayers === value}>
                  <input type="radio" name="maxPlayers" value={value} checked={maxPlayers === value} onChange={() => setMaxPlayers(value)} aria-label={`${value} players`} /><UsersThree size={18} /><strong>{value}</strong>
                </label>)}
              </div></fieldset>
            </div>
            <Button onClick={handleCreateRoom} disabled={mode !== "account" || loading || !!activeRoomId || !selectedPackId} className="live-create-button"><RocketLaunch />{loading ? "Connecting…" : "Create Live Room"}</Button>
          </section>
          <section className="surface-card live-panel live-join-panel">
            <div className="live-panel-heading"><span className="live-icon"><UsersThree size={28} /></span><div><h2>Join a room</h2><p>Enter the 6-character code provided by your study buddy.</p></div></div>
            <form onSubmit={handleJoinRoom} className="live-join-form">
              <label className="field-label">Room code<input className="field live-code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} maxLength={6} placeholder="ABC123" autoCapitalize="characters" autoComplete="off" spellCheck={false} /></label>
              <Button type="submit" disabled={mode !== "account" || code.length !== 6 || loading || !!activeRoomId}><SignIn />Join Room</Button>
            </form>
            <p className="live-help">Public rooms appear below. Private rooms are available to invited players with the room code.</p>
          </section>
        </div>
        </>
      )}

      {status && (
        <p
          role="status"
          className="mt-4 min-h-6 text-sm font-bold text-[var(--text-secondary)]"
        >
          {status}
        </p>
      )}

      {!activeRoomId && <>
        {overviewError && <p role="status" className="notice mt-4">{overviewError} <Button variant="quiet" onClick={() => void refreshOverview()}>Retry</Button></p>}
        <div className="live-bottom-grid" aria-busy={overviewLoading}>
          <section className="surface-card live-panel">
            <div className="live-section-heading"><Trophy size={24} /><div><h2>Live Leaderboard</h2><p>Completed public sessions</p></div><label className="sr-only" htmlFor="live-period">Leaderboard period</label><select id="live-period" className="field live-period" value={period} onChange={e => setPeriod(e.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="all">All time</option></select></div>
            {overview?.leaderboard.length ? <ol className="live-leaderboard">{overview.leaderboard.map((entry, index) => <li key={entry.userId}>
              <span className="live-rank">{index + 1}</span><UserAvatar src={entry.avatarUrl} alt="" size={34} className="size-9 rounded-full" /><div className="live-row-copy"><strong>{entry.displayName}</strong><small>{entry.roomsPlayed} {entry.roomsPlayed === 1 ? "room" : "rooms"} · {entry.accuracy}% accuracy</small><div className="live-score-bar"><span style={{ width: `${Math.max(2, entry.score / Math.max(1, overview.leaderboard[0].score) * 100)}%` }} /></div></div><strong>{entry.score} pts</strong>
            </li>)}</ol> : <p className="live-empty">{mode !== "account" ? "Sign in to see public session scores." : overviewLoading && !overview ? "Loading leaderboard…" : overviewError ? "Leaderboard unavailable." : "No completed public sessions in this period. Finish a public session to appear here."}</p>}
          </section>
          <section className="surface-card live-panel">
            <div className="live-section-heading"><UsersThree size={24} /><div><h2>Active Study Rooms</h2><p>Join a room and study together</p></div><button type="button" className="live-refresh-button" aria-label="Refresh active rooms" onClick={() => void refreshOverview()} disabled={mode !== "account" || overviewLoading}><ArrowClockwise size={20} /></button></div>
            {overview?.rooms.length ? <ul className="live-room-list">{overview.rooms.map(room => <li key={room.roomId}>
              <span className="live-icon">{room.visibility === "private" ? <Lock size={22} /> : <UsersThree size={22} />}</span><div className="live-row-copy"><strong>{room.packTitle}</strong><small>{room.playerCount}/{room.maxPlayers} players · {room.visibility === "private" ? "Private" : "Public"}</small><Badge tone={room.status === "active" ? "success" : "neutral"}>{room.status === "active" ? "In progress" : room.playerCount >= room.maxPlayers ? "Full" : "Waiting for players"}</Badge></div>
              <Button size="sm" disabled={loading || (!room.isMember && (room.status !== "lobby" || room.playerCount >= room.maxPlayers))} onClick={() => { if (room.isMember) { roomRef.current = room.roomId; setActiveRoomId(room.roomId); void fetchRoomState(room.roomId); } else { void joinRoom({ roomId: room.roomId }); } }}>{room.isMember ? "Resume" : "Join"}</Button>
            </li>)}</ul> : <p className="live-empty">{mode !== "account" ? "Sign in to discover public study rooms." : overviewLoading && !overview ? "Loading rooms…" : overviewError ? "Room directory unavailable." : "No open rooms yet. Create a public room or join a friend's code."}</p>}
          </section>
          <section className="surface-card live-panel live-how-to">
            <div className="live-section-heading"><Lightbulb size={24} /><div><h2>How it works</h2><p>Practice together. Track your progress.</p></div></div>
            <ol>{[["Create or join a room", "Pick a quiz and invite friends, join a public room, or enter a room code."], ["Practice together live", "The host starts the session. Everyone answers the same questions."], ["See results", "Compare your scores at the end. Public sessions contribute to the leaderboard."]].map(([title, description], index) => <li key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{description}</p></div></li>)}</ol>
          </section>
        </div>
      </>}
    </div>
  );
}
