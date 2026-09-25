"use client";

import Image from "next/image";
import {
  ArrowRight,
  Check,
  Copy,
  LinkSimple,
  MagnifyingGlass,
  UserCheck,
  UserMinus,
  UserPlus,
  X,
} from "@phosphor-icons/react";
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDemo } from "@/components/app/demo-provider";

interface FriendUser {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  friendedAt?: string;
}

interface FriendRequestItem {
  requestId: string;
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface SearchResultItem {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  friendshipStatus: "friend" | "outgoing_request" | "incoming_request" | "none";
}

export default function FriendsPage() {
  const { mode } = useDemo();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [userProfile, setUserProfile] = useState<{ username?: string | null } | null>(null);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(mode === "account");

  const loadSocialData = useCallback(async () => {
    if (mode !== "account") return;
    try {
      const [friendsRes, requestsRes, profileRes] = await Promise.all([
        fetch("/api/friends"),
        fetch("/api/friends/requests"),
        fetch("/api/account/profile"),
      ]);

      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends || []);
      }
      if (requestsRes.ok) {
        const data = await requestsRes.json();
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      }
      if (profileRes.ok) {
        const data = await profileRes.json();
        setUserProfile(data.profile || null);
      }
    } catch {
      setStatus("Could not load social data.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    let active = true;
    const frame = requestAnimationFrame(() => {
      if (active) {
        void loadSocialData();
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [loadSocialData]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    if (mode !== "account") {
      setStatus(
        "Friend discovery is an interface preview in demo mode. Sign in to search for study buddies."
      );
      return;
    }

    setSearching(true);
    setStatus("");
    try {
      const res = await fetch(`/api/friends/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) throw new Error("Search failed.");
      const data = await res.json();
      setSearchResults(data.results || []);
      if ((data.results || []).length === 0) {
        setStatus("No users found matching that username or name.");
      }
    } catch {
      setStatus("Search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(recipientId: string) {
    setStatus("");
    try {
      const res = await fetch("/api/friends/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send request.");

      if (data.status === "accepted") {
        setStatus("You are now study buddies!");
      } else {
        setStatus("Friend request sent.");
      }

      await loadSocialData();
      if (searchResults) {
        setSearchResults((prev) =>
          (prev || []).map((u) =>
            u.id === recipientId
              ? {
                  ...u,
                  friendshipStatus: data.status === "accepted" ? "friend" : "outgoing_request",
                }
              : u
          )
        );
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to send request.");
    }
  }

  async function respondRequest(requestId: string, action: "accept" | "decline") {
    setStatus("");
    try {
      const res = await fetch(`/api/friends/requests/${requestId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process request.");
      setStatus(action === "accept" ? "Friend request accepted!" : "Friend request declined.");
      await loadSocialData();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to process request.");
    }
  }

  async function cancelRequest(requestId: string) {
    setStatus("");
    try {
      const res = await fetch(`/api/friends/requests/${requestId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to cancel request.");
      setStatus("Friend request cancelled.");
      await loadSocialData();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to cancel request.");
    }
  }

  async function removeFriend(friendId: string) {
    if (!confirm("Are you sure you want to remove this friend?")) return;
    setStatus("");
    try {
      const res = await fetch(`/api/friends/${friendId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove friend.");
      setStatus("Friend removed.");
      await loadSocialData();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to remove friend.");
    }
  }

  async function copy() {
    const username = userProfile?.username ? `@${userProfile.username}` : "@fetch_student";
    try {
      await navigator.clipboard.writeText(username);
      setStatus(`Username copied: ${username}`);
    } catch {
      setStatus(`Clipboard unavailable. Select ${username} and copy it manually.`);
    }
  }

  return (
    <div className="workspace">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Better with study buddies.</h1>
          <p className="page-description">
            Find friends, share the small wins, and keep each other going.
          </p>
        </div>
        <Badge tone={mode === "account" ? "success" : "neutral"}>
          {mode === "account" ? "Connected account" : "Local preview"}
        </Badge>
      </div>

      {mode !== "account" && (
        <div role="note" className="notice mt-4">
          Social preview · Sign in to search for students, send friend requests, and study together.
        </div>
      )}

      {/* Incoming Requests Banner */}
      {incoming.length > 0 && (
        <section className="mt-6 rounded-2xl border border-[var(--fetch-blue-300)] bg-[var(--fetch-blue-50)] p-5">
          <h2 className="font-extrabold text-[var(--fetch-blue-900)]">
            Incoming friend requests ({incoming.length})
          </h2>
          <div className="mt-3 divide-y divide-[var(--fetch-blue-200)]">
            {incoming.map((req) => (
              <div
                key={req.requestId}
                className="flex items-center justify-between py-3 gap-3"
              >
                <div>
                  <p className="font-bold text-[var(--fetch-blue-950)]">
                    {req.displayName}
                  </p>
                  {req.username && (
                    <p className="text-xs text-[var(--fetch-blue-700)]">
                      @{req.username}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => respondRequest(req.requestId, "accept")}
                  >
                    <Check size={16} /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => respondRequest(req.requestId, "decline")}
                  >
                    <X size={16} /> Decline
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <form onSubmit={handleSearch} className="flex items-end gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search by username or name</span>
              <MagnifyingGlass
                size={20}
                className="absolute left-3 top-5 text-[var(--text-tertiary)]"
              />
              <input
                className="field pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by @username or name"
              />
            </label>
            <Button
              type="submit"
              aria-label="Search friends"
              disabled={!query.trim() || searching}
            >
              <ArrowRight />
            </Button>
          </form>

          {/* Search Results */}
          {searchResults && (
            <section className="surface-card mt-4 p-5">
              <h3 className="font-extrabold text-sm text-[var(--text-secondary)]">
                Search Results ({searchResults.length})
              </h3>
              <div className="mt-3 divide-y divide-[var(--border-subtle)]">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between py-3 gap-3"
                  >
                    <div>
                      <p className="font-bold">{user.displayName}</p>
                      {user.username && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          @{user.username}
                        </p>
                      )}
                    </div>
                    <div>
                      {user.friendshipStatus === "friend" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                          <UserCheck size={14} /> Friends
                        </span>
                      ) : user.friendshipStatus === "outgoing_request" ? (
                        <span className="text-xs font-bold text-[var(--text-tertiary)] bg-[var(--surface-subtle)] px-2 py-1 rounded">
                          Pending
                        </span>
                      ) : user.friendshipStatus === "incoming_request" ? (
                        <span className="text-xs font-bold text-[var(--fetch-blue-700)] bg-[var(--fetch-blue-50)] px-2 py-1 rounded">
                          Sent you a request
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => sendRequest(user.id)}
                        >
                          <UserPlus size={16} /> Add Friend
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Friends List */}
          <section className="surface-card mt-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
              <h2 className="font-display text-2xl font-semibold">
                Your friends ({friends.length})
              </h2>
            </div>

            {loading ? (
              <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
                Loading friends…
              </p>
            ) : friends.length === 0 ? (
              <div className="py-7 text-center">
                <Image
                  src="/assets/mascot/fetch-wave.png"
                  alt="FETCH waving to a future study buddy"
                  width={150}
                  height={150}
                  className="pixel-art mx-auto"
                />
                <h3 className="font-display mt-4 text-xl font-semibold">
                  Your study circle starts here
                </h3>
                <p className="mx-auto mt-2 max-w-md text-[var(--text-secondary)]">
                  {mode === "account"
                    ? "Search for classmates by username to add them as study buddies."
                    : "Friend discovery and invitations will be available when accounts are connected."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {friends.map((friend) => (
                  <div
                    key={friend.id}
                    className="flex items-center justify-between py-4 gap-4"
                  >
                    <div>
                      <h4 className="font-bold text-base">{friend.displayName}</h4>
                      {friend.username && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          @{friend.username}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="quiet"
                      onClick={() => removeFriend(friend.id)}
                      title="Remove friend"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      <UserMinus size={18} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Outgoing Requests */}
          {outgoing.length > 0 && (
            <section className="surface-card mt-5 p-6">
              <h3 className="font-bold text-sm text-[var(--text-secondary)]">
                Sent requests ({outgoing.length})
              </h3>
              <div className="mt-3 divide-y divide-[var(--border-subtle)]">
                {outgoing.map((req) => (
                  <div
                    key={req.requestId}
                    className="flex items-center justify-between py-3 gap-3"
                  >
                    <div>
                      <p className="font-bold">{req.displayName}</p>
                      {req.username && (
                        <p className="text-xs text-[var(--text-secondary)]">
                          @{req.username}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => cancelRequest(req.requestId)}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          <section className="surface-card p-5">
            <h2 className="text-sm font-extrabold text-[var(--text-secondary)]">
              Your global username
            </h2>
            <p className="mt-3 select-all break-all font-display text-2xl font-semibold text-[var(--fetch-blue-700)]">
              {userProfile?.username ? `@${userProfile.username}` : "@fetch_student"}
            </p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              {mode === "account"
                ? "Registered account profile"
                : "Demo identity · Not a registered profile"}
            </p>
            <button
              onClick={copy}
              className="mt-4 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-extrabold text-[var(--fetch-blue-700)]"
            >
              <Copy />
              Copy username
            </button>
            <button
              disabled={mode !== "account"}
              title={mode === "account" ? "Share your profile" : "Profile links require a connected account"}
              className={`mt-1 flex min-h-11 items-center gap-2 text-sm font-extrabold ${
                mode === "account"
                  ? "text-[var(--fetch-blue-700)] cursor-pointer"
                  : "text-[var(--text-tertiary)] opacity-60"
              }`}
            >
              <LinkSimple />
              Share profile link {mode !== "account" && "(Account feature)"}
            </button>
          </section>

          <section className="surface-card p-5">
            <h2 className="font-display text-xl font-semibold">Your study circle</h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              {friends.length === 1
                ? "You have 1 study buddy."
                : `You have ${friends.length} study buddies.`}
            </p>
          </section>
        </aside>
      </div>

      {status && (
        <p
          role="status"
          className="mt-4 min-h-6 text-sm font-bold text-[var(--text-secondary)]"
        >
          {status}
        </p>
      )}
    </div>
  );
}
