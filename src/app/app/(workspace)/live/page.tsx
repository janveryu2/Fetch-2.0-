"use client";

import Image from "next/image";
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
} from "@phosphor-icons/react";
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default function LivePage() {
  const { mode, packs } = useDemo();
  const [code, setCode] = useState("");
  const [createdLocal, setCreatedLocal] = useState("");
  const [status, setStatus] = useState("");
  const [selectedPackId, setSelectedPackId] = useState(packs[0]?.id || "");

  // Real room state for account mode
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<LiveRoomState | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Poll room state while in an active or lobby room
  const fetchRoomState = useCallback(async (roomId: string) => {
    try {
      const res = await fetch(`/api/live/rooms/${roomId}`);
      if (res.ok) {
        const data = await res.json();
        setRoomState(data);
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
        body: JSON.stringify({ packId: selectedPackId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create room.");
      }
      const data = await res.json();
      setActiveRoomId(data.roomId);
      setStatus(`Room created! Share code ${data.joinCode} with friends.`);
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

    setLoading(true);
    setStatus("");
    try {
      const res = await fetch("/api/live/rooms/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinCode: code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to join room.");
      }
      const data = await res.json();
      setActiveRoomId(data.roomId);
      setStatus("Joined room successfully!");
      await fetchRoomState(data.roomId);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to join room.");
    } finally {
      setLoading(false);
    }
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

  return (
    <div className="workspace !max-w-[1080px]">
      <header className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">
              Study together.
              <br />
              Challenge each other.
            </h1>
          </div>
          <p className="page-description">
            Turn practice into a friendly live challenge with your study buddies.
          </p>
        </div>
        <Image
          src="/assets/mascot/fetch-active.png"
          alt="FETCH ready for a challenge"
          width={140}
          height={140}
          className="pixel-art hidden sm:block"
        />
      </header>

      {mode !== "account" && (
        <p className="notice mt-6">
          Local room preview · Sign in to host or join real-time multiplayer competitions with friends.
        </p>
      )}

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
                onClick={() => {
                  setActiveRoomId(null);
                  setRoomState(null);
                }}
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
                        <div className="size-7 rounded-lg bg-[var(--fetch-blue-100)] text-[var(--fetch-blue-700)] font-bold flex items-center justify-center text-xs">
                          {m.displayName[0]?.toUpperCase() || "P"}
                        </div>
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
                          ? "bg-amber-50 border border-amber-200 font-bold"
                          : "bg-[var(--surface-subtle)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{idx === 0 ? "👑" : `${idx + 1}.`}</span>
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
                onClick={() => {
                  setActiveRoomId(null);
                  setRoomState(null);
                }}
              >
                Back to Live Home
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Create & Join Grid */
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {/* Create Room Section */}
          <section className="surface-card flex min-h-80 flex-col p-6">
            <RocketLaunch size={30} className="text-[var(--fetch-blue-700)]" />
            <h2 className="font-display mt-5 text-2xl font-semibold">
              Create a room
            </h2>
            <p className="mt-2 text-[var(--text-secondary)] text-sm">
              {mode === "account"
                ? "Select a StudyPack and challenge your friends in real-time."
                : "Try generating and copying a local room code in demo mode."}
            </p>

            {mode === "account" ? (
              <div className="mt-4 flex flex-col gap-3 flex-1 justify-between">
                <div>
                  <label className="field-label">
                    Select StudyPack
                    <select
                      className="field mt-1.5"
                      value={selectedPackId}
                      onChange={(e) => setSelectedPackId(e.target.value)}
                    >
                      {packs.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Button
                  className="mt-4 self-start"
                  onClick={handleCreateRoom}
                  disabled={loading || packs.length === 0}
                >
                  Create Live Room
                </Button>
              </div>
            ) : createdLocal ? (
              <div className="mt-6 rounded-xl bg-[var(--surface-subtle)] p-4">
                <p className="text-xs font-bold text-[var(--text-secondary)]">
                  LOCAL ROOM CODE
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="select-all font-display text-3xl tracking-widest">
                    {createdLocal}
                  </span>
                  <button
                    aria-label="Copy room code"
                    className="flex size-11 items-center justify-center"
                    onClick={() => copyCode(createdLocal)}
                  >
                    <Copy size={23} />
                  </button>
                </div>
                <Button
                  className="mt-4"
                  variant="quiet"
                  onClick={() => {
                    setCreatedLocal("");
                    setStatus("Local room closed.");
                  }}
                >
                  Close local room
                </Button>
              </div>
            ) : (
              <Button
                className="mt-auto self-start"
                onClick={() => {
                  setCreatedLocal(
                    Array.from(
                      crypto.getRandomValues(new Uint8Array(6)),
                      (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 31],
                    ).join("")
                  );
                  setStatus("Local code created. Sign in to enable multiplayer connection.");
                }}
              >
                Create a room
              </Button>
            )}
          </section>

          {/* Join Room Section */}
          <section className="surface-card p-6">
            <UsersThree size={30} className="text-[var(--fetch-blue-700)]" />
            <h2 className="font-display mt-5 text-2xl font-semibold">
              Join a room
            </h2>
            <p className="mt-2 text-[var(--text-secondary)] text-sm">
              Enter the 6-character code provided by your study buddy.
            </p>
            <form onSubmit={mode === "account" ? handleJoinRoom : (e) => {
              e.preventDefault();
              setStatus(
                code === createdLocal && createdLocal
                  ? "Local preview code matched. Sign in for live multiplayer."
                  : "Code not found in local preview."
              );
            }}>
              <label className="field-label mt-5">
                Room code
                <input
                  className="field text-center text-xl font-extrabold tracking-widest"
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6)
                    )
                  }
                  maxLength={6}
                  placeholder="ABC123"
                />
              </label>
              <Button
                className="mt-5"
                type="submit"
                disabled={code.length !== 6 || loading}
              >
                <SignIn />
                Join Room
              </Button>
            </form>
          </section>
        </div>
      )}

      {status && (
        <p
          role="status"
          className="mt-4 min-h-6 text-sm font-bold text-[var(--text-secondary)]"
        >
          {status}
        </p>
      )}

      <section className="mt-7 border-t border-[var(--border-subtle)] pt-6">
        <h2 className="font-display text-xl font-semibold">
          Synchronized Practice & Live Leaderboard
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Real-time rooms evaluate responses on the server clock, prevent answer tampering, and stream synchronized results to all participants.
        </p>
      </section>
    </div>
  );
}
