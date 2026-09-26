"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChatCircleDots,
  UserCheck,
  UserPlus,
  GraduationCap,
  BookOpen,
  Bookmarks,
  ArrowLeft,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface FriendProfileData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  friendshipStatus: "self" | "friend" | "outgoing_request" | "incoming_request" | "none";
  canMessage: boolean;
  allowDirectMessages: boolean;
  education: string | null;
  program: string | null;
  subject: string | null;
}

interface PageProps {
  params: Promise<{ username: string }>;
}

export default function UserProfilePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [profile, setProfile] = useState<FriendProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [messaging, setMessaging] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchProfile() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(resolvedParams.username)}`);
        if (!res.ok) {
          if (res.status === 404) {
            throw new Error(`Learner @${resolvedParams.username} was not found.`);
          }
          throw new Error("Unable to load profile.");
        }
        const data = await res.json();
        if (active) {
          setProfile(data.profile);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Error loading profile.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchProfile();

    return () => {
      active = false;
    };
  }, [resolvedParams.username]);

  async function handleStartChat() {
    if (!profile?.id || !profile.canMessage) return;
    setMessaging(true);
    try {
      const res = await fetch("/api/messages/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId: profile.id }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Could not start chat.");
      }

      const data = await res.json();
      router.push(`/app/messages?conversationId=${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open conversation.");
      setMessaging(false);
    }
  }

  async function handleSendFriendRequest() {
    if (!profile?.id) return;
    try {
      const res = await fetch("/api/friends/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: profile.id }),
      });
      if (res.ok) {
        setProfile((prev) => (prev ? { ...prev, friendshipStatus: "outgoing_request" } : null));
      }
    } catch {
      // Ignored
    }
  }

  return (
    <div className="workspace !max-w-[700px] space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/app/friends"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--fetch-blue-700)] hover:underline"
        >
          <ArrowLeft size={16} /> Back to Friends
        </Link>
      </div>

      {loading && (
        <div className="surface-card p-10 text-center text-sm text-[var(--text-secondary)]">
          Loading profile...
        </div>
      )}

      {error && !loading && (
        <div className="surface-card flex items-center gap-3 p-6 text-sm text-red-700 bg-red-50/50 border border-red-200">
          <WarningCircle size={22} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {profile && !loading && (
        <div className="surface-card overflow-hidden">
          {/* Profile Header Banner */}
          <div className="h-28 bg-gradient-to-r from-[var(--fetch-blue-500)] to-[var(--fetch-blue-700)]" />

          <div className="px-6 pb-6 pt-0">
            {/* Avatar & Action Button Bar */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-12 mb-4">
              <div className="relative h-24 w-24 rounded-2xl border-4 border-[var(--surface-canvas)] bg-[var(--surface-subtle)] overflow-hidden shadow-md flex items-center justify-center font-display text-2xl font-bold text-[var(--fetch-blue-700)]">
                {profile.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    fill
                    className="object-cover"
                  />
                ) : (
                  profile.displayName.slice(0, 2).toUpperCase()
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {profile.canMessage && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={messaging}
                    onClick={handleStartChat}
                    className="flex items-center gap-1.5"
                  >
                    <ChatCircleDots size={16} />
                    <span>{messaging ? "Opening chat..." : "Send Message"}</span>
                  </Button>
                )}

                {profile.friendshipStatus === "none" && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleSendFriendRequest}
                    className="flex items-center gap-1.5"
                  >
                    <UserPlus size={16} />
                    <span>Add Friend</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Profile Identity Details */}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
                  {profile.displayName}
                </h1>
                {profile.friendshipStatus === "friend" && (
                  <Badge tone="success" className="flex items-center gap-1">
                    <UserCheck size={12} /> Friend
                  </Badge>
                )}
                {profile.friendshipStatus === "outgoing_request" && (
                  <Badge tone="neutral">Request sent</Badge>
                )}
                {profile.friendshipStatus === "incoming_request" && (
                  <Badge tone="blue">Requested to connect</Badge>
                )}
                {profile.friendshipStatus === "self" && (
                  <Badge tone="neutral">You</Badge>
                )}
              </div>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                @{profile.username}
              </p>
            </div>

            {/* Privacy note if DMs are disabled */}
            {!profile.allowDirectMessages && profile.friendshipStatus !== "self" && (
              <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 text-xs text-[var(--text-secondary)]">
                Direct messages are disabled by this user.
              </div>
            )}

            {/* Public-Safe Academic Details (Only when enabled by owner) */}
            <div className="mt-6 border-t border-[var(--border-subtle)] pt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
                Study Information
              </h3>

              {profile.education || profile.program || profile.subject ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {profile.education && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--surface-subtle)]">
                      <GraduationCap size={20} className="text-[var(--fetch-blue-600)]" />
                      <div>
                        <p className="text-[10px] font-semibold text-[var(--text-secondary)]">Education</p>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{profile.education}</p>
                      </div>
                    </div>
                  )}

                  {profile.program && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--surface-subtle)]">
                      <BookOpen size={20} className="text-[var(--fetch-blue-600)]" />
                      <div>
                        <p className="text-[10px] font-semibold text-[var(--text-secondary)]">Program</p>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{profile.program}</p>
                      </div>
                    </div>
                  )}

                  {profile.subject && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border-subtle)] p-3 bg-[var(--surface-subtle)]">
                      <Bookmarks size={20} className="text-[var(--fetch-blue-600)]" />
                      <div>
                        <p className="text-[10px] font-semibold text-[var(--text-secondary)]">Primary Subject</p>
                        <p className="text-xs font-bold text-[var(--text-primary)]">{profile.subject}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)] italic">
                  No public study details shared.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
