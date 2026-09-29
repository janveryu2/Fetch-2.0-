"use client";

import Image from "next/image";
import {
  ChatCircleDots,
  MagnifyingGlass,
  PaperPlaneTilt,
  User,
  PlusCircle,
} from "@phosphor-icons/react";
import { useState, useEffect, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useDemo } from "@/components/app/demo-provider";
import { createClient } from "@/lib/supabase/client";
import { MessageThreadSkeleton } from "@/components/ui/domain-skeletons";

interface Participant {
  id: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
}

interface ConversationItem {
  id: string;
  updatedAt: string;
  createdAt: string;
  participant: Participant;
  lastMessage: {
    id: string;
    senderId: string;
    body: string;
    createdAt: string;
    mine: boolean;
  } | null;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  clientMessageId?: string | null;
  mine: boolean;
}

interface FriendItem {
  id: string;
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export default function MessagesPage() {
  const { mode } = useDemo();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationItem | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(mode === "account");
  const [sending, setSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [filterQuery, setFilterQuery] = useState("");

  // Demo fixture messages for preview mode
  const [demoMessages, setDemoMessages] = useState<{ id: string; body: string; mine: boolean }[]>([
    { id: "demo-welcome", body: "Welcome to FETCH direct messaging! In account mode, chats persist to your database with your study buddies.", mine: false },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Load conversations and friends list
  const loadConversations = useCallback(async () => {
    if (mode !== "account") return;
    try {
      const [convRes, friendsRes] = await Promise.all([
        fetch("/api/conversations"),
        fetch("/api/friends"),
      ]);

      if (convRes.ok) {
        const convData = await convRes.json();
        const convList: ConversationItem[] = convData.conversations || [];
        setConversations(convList);
        if (convList.length > 0 && !activeConversation) {
          setActiveConversation(convList[0]);
        }
      }

      if (friendsRes.ok) {
        const friendsData = await friendsRes.json();
        const rawFriends = friendsData.friends || [];
        const normalized: FriendItem[] = rawFriends.map((f: { id?: string; userId?: string; username?: string | null; displayName?: string; avatarUrl?: string | null }) => {
          const friendId = f.id || f.userId || "";
          return {
            id: friendId,
            userId: friendId,
            username: f.username ?? null,
            displayName: f.displayName || "Study Buddy",
            avatarUrl: f.avatarUrl ?? null,
          };
        });
        setFriends(normalized);
      }
    } catch {
      setStatusMessage("Failed to load conversations.");
    } finally {
      setLoading(false);
    }
  }, [mode, activeConversation]);

  useEffect(() => {
    let active = true;
    const frame = requestAnimationFrame(() => {
      if (active) {
        void loadConversations();
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [loadConversations]);

  // Load messages when active conversation changes
  const loadMessages = useCallback(async (conversationId: string) => {
    if (mode !== "account") return;
    try {
      const res = await fetch(`/api/conversations/${conversationId}/messages?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        scrollToBottom();
      }
    } catch {
      setStatusMessage("Failed to load messages.");
    }
  }, [mode, scrollToBottom]);

  useEffect(() => {
    if (!activeConversation || mode !== "account") return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      if (active) {
        void loadMessages(activeConversation.id);
      }
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [activeConversation, mode, loadMessages]);

  // Realtime subscription for incoming messages
  useEffect(() => {
    if (mode !== "account" || !activeConversation) return;

    let supabase: ReturnType<typeof createClient> | null = null;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channelName = `messages:${activeConversation.id}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${activeConversation.id}`,
        },
        (payload) => {
          const newMsg = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at: string;
            client_message_id?: string;
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id || (newMsg.client_message_id && m.clientMessageId === newMsg.client_message_id))) {
              return prev;
            }
            return [
              ...prev,
              {
                id: newMsg.id,
                conversationId: newMsg.conversation_id,
                senderId: newMsg.sender_id,
                body: newMsg.body,
                createdAt: newMsg.created_at,
                clientMessageId: newMsg.client_message_id,
                mine: newMsg.sender_id !== activeConversation.participant.id,
              },
            ];
          });
          scrollToBottom();
        }
      )
      .subscribe();

    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [activeConversation, mode, scrollToBottom]);

  // Start new conversation with a friend
  async function startConversation(friendId: string) {
    if (mode !== "account" || !friendId) return;
    setStatusMessage("");

    // If a conversation with this participant already exists, activate it
    const existing = conversations.find((c) => c.participant?.id === friendId);
    if (existing) {
      setActiveConversation(existing);
      return;
    }

    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId: friendId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to start conversation.");
      }
      const data = await res.json();
      const newConv: ConversationItem = {
        id: data.conversation.id,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        participant: data.conversation.participant,
        lastMessage: null,
      };
      setConversations((prev) => {
        const exists = prev.find((c) => c.id === newConv.id);
        if (exists) return prev;
        return [newConv, ...prev];
      });
      setActiveConversation(newConv);
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Failed to start conversation.");
    }
  }

  // Send message
  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;

    if (mode !== "account") {
      setDemoMessages((items) => [
        ...items,
        { id: crypto.randomUUID(), body: text, mine: true },
      ]);
      setDraft("");
      setAnnouncement(`Message sent: ${text}`);
      return;
    }

    if (!activeConversation) return;

    setSending(true);
    setStatusMessage("");
    const clientMessageId = crypto.randomUUID();

    // Optimistic message
    const optimisticMsg: MessageItem = {
      id: clientMessageId,
      conversationId: activeConversation.id,
      senderId: "me",
      body: text,
      createdAt: new Date().toISOString(),
      clientMessageId,
      mine: true,
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");
    scrollToBottom();

    try {
      const res = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          body: text,
          clientMessageId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to deliver message.");
      }

      const { message } = await res.json();
      setMessages((prev) =>
        prev.map((m) => (m.clientMessageId === clientMessageId ? { ...message, mine: true } : m))
      );
      setAnnouncement(`Message delivered: ${text}`);
      void loadConversations();
    } catch (err) {
      setStatusMessage(err instanceof Error ? err.message : "Message failed to send.");
      // Rollback optimistic message
      setMessages((prev) => prev.filter((m) => m.clientMessageId !== clientMessageId));
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  const filteredConversations = conversations.filter((c) =>
    (c.participant.displayName || "").toLowerCase().includes(filterQuery.toLowerCase()) ||
    (c.participant.username || "").toLowerCase().includes(filterQuery.toLowerCase())
  );

  const friendsWithoutConversation = friends.filter(
    (f) => !conversations.some((c) => c.participant?.id === f.id)
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] max-w-[1200px] flex-col px-3 py-3 sm:px-7 sm:py-6 md:h-[calc(100dvh-6.5rem)] md:max-h-[820px] md:min-h-[500px]">
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-soft)] md:grid-cols-[320px_1fr]">
        {/* Desktop / Tablet Sidebar */}
        <aside className="hidden border-r border-[var(--border-subtle)] p-5 md:flex md:flex-col overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="font-display text-2xl font-semibold">Messages</div>
            <Badge tone={mode === "account" ? "success" : "neutral"}>
              {mode === "account" ? "Direct chats" : "Local preview"}
            </Badge>
          </div>

          {mode === "account" ? (
            <>
              <label className="relative mt-4 block">
                <span className="sr-only">Search conversations</span>
                <MagnifyingGlass
                  size={18}
                  className="absolute left-3 top-3 text-[var(--text-tertiary)]"
                />
                <input
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] pl-10 pr-3 text-sm focus:outline-2 focus:outline-[var(--fetch-blue-600)]"
                  placeholder="Filter conversations"
                />
              </label>

              {/* Conversations list */}
              <div className="mt-4 flex flex-col gap-2">
                {filteredConversations.map((c) => {
                  const isSelected = activeConversation?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setActiveConversation(c)}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors ${
                        isSelected
                          ? "bg-[var(--fetch-blue-50)] text-[var(--fetch-blue-900)] ring-1 ring-[var(--fetch-blue-200)]"
                          : "hover:bg-[var(--surface-subtle)]"
                      }`}
                    >
                      <UserAvatar
                        src={c.participant.avatarUrl}
                        alt={c.participant.displayName}
                        size={40}
                        className="size-10 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="block truncate font-extrabold text-sm">
                            {c.participant.displayName}
                          </span>
                        </div>
                        <span className="block truncate text-xs text-[var(--text-secondary)]">
                          {c.lastMessage ? c.lastMessage.body : (c.participant.username ? `@${c.participant.username}` : "New conversation")}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {filteredConversations.length === 0 && !loading && (
                  <p className="py-2 text-xs text-[var(--text-secondary)]">
                    No active conversations found.
                  </p>
                )}
              </div>

              {/* Friends available to message */}
              {friendsWithoutConversation.length > 0 && (
                <div className="mt-6 border-t border-[var(--border-subtle)] pt-4">
                  <h2 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-2">
                    Message a Friend
                  </h2>
                  <div className="flex flex-col gap-1.5">
                    {friendsWithoutConversation.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => startConversation(f.id)}
                        className="flex items-center justify-between gap-2 rounded-lg p-2 text-left hover:bg-[var(--surface-subtle)] text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <User size={16} className="text-[var(--text-tertiary)] shrink-0" />
                          <span className="truncate font-medium">{f.displayName}</span>
                        </div>
                        <PlusCircle size={18} className="text-[var(--fetch-blue-600)] shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="mt-4 flex w-full items-center gap-3 rounded-xl bg-[var(--fetch-blue-50)] p-3 text-left">
                <Image
                  src="/assets/mascot/fetch-logo.png"
                  alt=""
                  width={44}
                  height={44}
                  className="pixel-art size-11 rounded-xl"
                />
                <div className="min-w-0">
                  <span className="block truncate font-extrabold text-sm">FETCH Demo</span>
                  <span className="block text-xs text-[var(--text-secondary)]">
                    Local conversation
                  </span>
                </div>
              </div>
              <p className="mt-auto pt-4 text-xs text-[var(--text-secondary)]">
                Preview messages are stored in memory and reset on reload. Sign in to chat directly with friends.
              </p>
            </>
          )}
        </aside>

        {/* Conversation Area */}
        <section className="flex min-h-0 flex-1 flex-col">
          <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 sm:px-5">
            <div className="flex items-center gap-3 min-w-0">
              {mode === "account" && activeConversation?.participant ? (
                <UserAvatar
                  src={activeConversation.participant.avatarUrl}
                  alt={activeConversation.participant.displayName}
                  size={36}
                  className="size-9 rounded-xl"
                />
              ) : (
                <ChatCircleDots
                  size={24}
                  className="shrink-0 text-[var(--fetch-blue-600)]"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-extrabold text-sm sm:text-base truncate">
                    {mode === "account"
                      ? activeConversation?.participant.displayName || "Messages"
                      : "Messages"}
                  </h1>
                  <Badge tone={mode === "account" ? "success" : "warning"}>
                    {mode === "account" ? "Direct chat" : "Preview"}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  {mode === "account"
                    ? activeConversation?.participant.username
                      ? `@${activeConversation.participant.username} · End-to-end cloud synced`
                      : "Select or start a chat with a study friend"
                    : "Local preview only · Messages reset on reload"}
                </p>
              </div>
            </div>
            {statusMessage && (
              <span className="text-xs text-[var(--semantic-danger-text)] truncate">
                {statusMessage}
              </span>
            )}
          </header>

          {/* Polite live region for screen reader announcements */}
          <div className="sr-only" aria-live="polite">
            {announcement}
          </div>

          {/* Scrollable Message Area */}
          <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto p-4 sm:p-5">
            {loading && mode === "account" ? (
              <MessageThreadSkeleton />
            ) : mode === "account" ? (
              !activeConversation ? (
                <div className="my-auto text-center px-4 py-6">
                  <Image
                    src="/assets/mascot/fetch-wave.png"
                    alt="FETCH ready"
                    width={140}
                    height={140}
                    className="pixel-art mx-auto w-[100px] sm:w-[130px]"
                  />
                  <h3 className="font-display mt-3 text-lg sm:text-xl font-semibold">
                    No conversation selected
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-[var(--text-secondary)]">
                    Pick a conversation or choose a study friend from the sidebar to start chatting.
                  </p>
                </div>
              ) : messages.length === 0 ? (
                <div className="my-auto text-center px-4 py-6">
                  <Image
                    src="/assets/mascot/fetch-wave.png"
                    alt="FETCH ready to chat"
                    width={120}
                    height={120}
                    className="pixel-art mx-auto w-[90px] sm:w-[110px]"
                  />
                  <h3 className="font-display mt-3 text-base sm:text-lg font-semibold">
                    Start a conversation with {activeConversation.participant.displayName}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-[var(--text-secondary)]">
                    Send a question, ask about a study pack, or compare notes!
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm sm:text-base ${
                      message.mine
                        ? "ml-auto bg-[var(--action-bg)] text-[var(--action-text)]"
                        : "bg-[var(--surface-subtle)]"
                    }`}
                  >
                    <span className="sr-only">
                      {message.mine ? "You: " : `${activeConversation.participant.displayName}: `}
                    </span>
                    <div>{message.body}</div>
                    <span className="block text-[10px] opacity-70 mt-1 text-right">
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))
              )
            ) : (
              demoMessages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-4 py-2.5 text-sm sm:text-base ${
                    message.mine
                      ? "ml-auto bg-[var(--action-bg)] text-[var(--action-text)]"
                      : "bg-[var(--surface-subtle)]"
                  }`}
                >
                  <span className="sr-only">You (local preview): </span>
                  {message.body}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Anchored Composer */}
          <form
            onSubmit={send}
            className="sticky bottom-0 z-10 flex shrink-0 items-center gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <label className="sr-only" htmlFor="message">
              Message
            </label>
            <textarea
              id="message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(event);
                }
              }}
              disabled={mode === "account" && !activeConversation}
              rows={1}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 text-sm focus:outline-2 focus:outline-[var(--fetch-blue-600)] disabled:opacity-50"
              placeholder={
                mode === "account" && !activeConversation
                  ? "Select a conversation to write a message"
                  : "Write a message"
              }
            />
            <Button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim() || sending || (mode === "account" && !activeConversation)}
              className="shrink-0"
            >
              <PaperPlaneTilt weight="fill" />
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
