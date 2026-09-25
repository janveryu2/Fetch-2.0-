"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowClockwise,
  Lightbulb,
  NotePencil,
  Plus,
  Question,
  Sparkle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/components/app/demo-provider";
import { useStudentPreferences } from "@/components/app/student-preferences-provider";

type TutorMessage = { role: "user" | "assistant"; content: string };
type TutorConversation = {
  id: string;
  packId: string | null;
  updatedAt: string;
  preview: string | null;
};

const suggestions = [
  { label: "Explain a concept", prompt: "Help me understand this concept: ", icon: Lightbulb },
  { label: "Understand my notes", prompt: "Help me break down these notes: ", icon: NotePencil },
  { label: "Quiz me on a topic", prompt: "Quiz me on this topic: ", icon: Sparkle },
  { label: "Break down a question", prompt: "Help me reason through this question: ", icon: Question },
];

export default function TutorPage() {
  const { packs, mode, tutorAvailable } = useDemo();
  const [draft, setDraft] = useState("");
  const [packId, setPackId] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<TutorMessage[]>([]);
  const [conversations, setConversations] = useState<TutorConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [streamedReply, setStreamedReply] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);

  const isTutorUsable = mode === "account" && tutorAvailable;

  useEffect(() => {
    if (mode !== "account") return;
    let active = true;
    const frame = requestAnimationFrame(() => {
      setLoadingHistory(true);
      setHistoryError("");
      void fetch("/api/tutor", { cache: "no-store" })
        .then(async (response) => {
          const data = (await response.json()) as { conversations?: TutorConversation[]; error?: string };
          if (!response.ok) throw new Error(data.error || "Failed to load conversations");
          if (active) setConversations(data.conversations ?? []);
        })
        .catch((err) => {
          if (active) setHistoryError(err instanceof Error ? err.message : "Failed to load recent conversations");
        })
        .finally(() => {
          if (active) setLoadingHistory(false);
        });
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
    };
  }, [mode]);

  async function refreshConversations() {
    setLoadingHistory(true);
    setHistoryError("");
    try {
      const response = await fetch("/api/tutor", { cache: "no-store" });
      const data = (await response.json()) as { conversations?: TutorConversation[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Failed to load conversations");
      setConversations(data.conversations ?? []);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Failed to load recent conversations");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function openConversation(id: string) {
    setLoadingHistory(true);
    setError("");
    try {
      const response = await fetch(`/api/tutor?conversationId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as { error?: string; messages?: TutorMessage[] };
      if (!response.ok || !data.messages) {
        throw new Error(data.error || "Conversation could not be loaded.");
      }
      const conversation = conversations.find((item) => item.id === id);
      setConversationId(id);
      setPackId(conversation?.packId ?? "");
      setMessages(data.messages);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conversation could not be loaded.");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function send() {
    const message = draft.trim();
    if (!message || mode !== "account" || !tutorAvailable || loading) return;
    setError("");
    setLoading(true);
    setPendingQuestion(message);
    setStreamedReply("");

    try {
      const response = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          packId: packId || null,
          conversationId: conversationId || null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "FETCH could not get a tutor reply.");
      }
      if (!response.body) {
        throw new Error("FETCH could not open the tutor response stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let reply = "";
      let savedConversationId = "";
      let finished = false;

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";
        for (const event of events) {
          const line = event.split(/\r?\n/).find((item) => item.startsWith("data:"));
          if (!line) continue;
          const data = JSON.parse(line.slice(5).trim()) as {
            type?: string;
            delta?: string;
            error?: string;
            conversationId?: string;
          };
          if (data.type === "delta" && typeof data.delta === "string") {
            reply += data.delta;
            setStreamedReply(reply);
          } else if (data.type === "error") {
            throw new Error(data.error || "FETCH could not finish the tutor reply.");
          } else if (data.type === "done" && typeof data.conversationId === "string") {
            savedConversationId = data.conversationId;
            finished = true;
          }
        }
        if (done) break;
      }

      if (!finished || !savedConversationId || !reply.trim()) {
        throw new Error("FETCH could not save this Tutor conversation.");
      }

      setConversationId(savedConversationId);
      setMessages((current) => [
        ...current,
        { role: "user", content: message },
        { role: "assistant", content: reply.trim() },
      ]);
      setDraft("");
      await refreshConversations().catch(() => undefined);
    } catch (reason) {
      // Keep draft text recoverable in input
      setError(reason instanceof Error ? reason.message : "FETCH could not get a tutor reply.");
    } finally {
      setLoading(false);
      setPendingQuestion("");
      setStreamedReply("");
    }
  }

  function newConversation() {
    setConversationId("");
    setMessages([]);
    setPackId("");
    setError("");
    input.current?.focus();
  }

  const { preferences } = useStudentPreferences();
  const subject = preferences?.primarySubject?.trim();
  const goal = preferences?.studyGoal;

  let personalizedStarter: { label: string; prompt: string } | null = null;
  if (isTutorUsable && (subject || goal)) {
    if (goal === "exam") {
      personalizedStarter = {
        label: subject ? `Review for ${subject} exam` : "Review for an exam",
        prompt: subject
          ? `Can you help me review the core concepts in ${subject} for my exam?`
          : "Can you help me review the core concepts in what I'm studying for my exam?",
      };
    } else if (goal === "understand") {
      personalizedStarter = {
        label: subject ? `Understand difficult ${subject} ideas` : "Understand difficult ideas",
        prompt: subject
          ? `Can you help me understand the hardest idea in ${subject}?`
          : "Can you help me understand the hardest idea in what I'm studying?",
      };
    } else if (goal === "habit") {
      personalizedStarter = {
        label: subject ? `Daily ${subject} practice question` : "Daily practice question",
        prompt: subject
          ? `Can you ask me a question to test my understanding of ${subject}?`
          : "Can you ask me a question to test my understanding?",
      };
    } else if (subject) {
      personalizedStarter = {
        label: `Explore ${subject}`,
        prompt: `Can you explain the foundational principles of ${subject}?`,
      };
    }
  }

  const availability =
    mode !== "account"
      ? "Sign in to use the Tutor with your account and keep conversations saved."
      : tutorAvailable
        ? "Your question and selected StudyPack source will be processed by the AI Tutor. Tutor conversations are saved in your account; up to 10 messages are allowed every 10 minutes."
        : "AI Tutor needs GROQ_API_KEY on the server before it can reply.";

  const badgeText =
    mode !== "account"
      ? "Demo preview"
      : tutorAvailable
        ? "Account tutor"
        : "Setup needed";

  return (
    <div className="workspace !max-w-[1000px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">FETCH AI Tutor</h1>
        <span className="rounded-full bg-[var(--fetch-blue-100)] px-3 py-1 text-xs font-extrabold text-[var(--fetch-blue-800)] dark:bg-[var(--fetch-blue-950)] dark:text-[var(--fetch-blue-300)]">
          {badgeText}
        </span>
      </div>
      <p className="page-description">
        A place to work through the things that haven’t clicked yet.
      </p>

      {/* Prominent notice when service is unavailable */}
      {!isTutorUsable && (
        <div className="surface-card mt-5 border-l-4 border-l-[var(--fetch-blue-500)] p-4 sm:p-5">
          <p className="font-extrabold text-[var(--text-primary)]">
            {mode !== "account" ? "Account sign-in required" : "Service configuration required"}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]" id="tutor-availability">
            {availability}
          </p>
          {mode !== "account" && (
            <Button asChild size="sm" className="mt-3">
              <Link href="/login">Sign in to your account</Link>
            </Button>
          )}
        </div>
      )}

      <section className="surface-card mt-6 overflow-hidden">
        {!messages.length && (
          <div className="px-4 py-6 text-center sm:px-10 sm:py-8">
            <Image
              src="/assets/mascot/fetch-wave.png"
              alt="FETCH, your learning companion"
              width={120}
              height={120}
              className="pixel-art mx-auto w-[90px] sm:w-[120px]"
            />
            <h2 className="font-display mt-3 text-2xl font-semibold sm:text-3xl">
              What would you like to understand today?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-secondary)]">
              Ask a question, explore a concept, or choose a StudyPack for source-aware tutoring.
            </p>
            {personalizedStarter && (
              <div className="mt-5 text-left">
                <p className="text-xs font-bold text-[var(--fetch-blue-800)] dark:text-[var(--fetch-blue-300)] mb-1.5">
                  Suggested for your study goal:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(personalizedStarter!.prompt);
                    input.current?.focus();
                  }}
                  className="flex w-full items-center justify-between rounded-xl border-2 border-[var(--fetch-blue-600)] bg-[var(--fetch-blue-50)] dark:bg-[var(--fetch-blue-950)] p-3.5 text-left text-sm font-extrabold text-[var(--fetch-blue-950)] dark:text-[var(--fetch-blue-100)] hover:bg-[var(--fetch-blue-100)] dark:hover:bg-[var(--fetch-blue-900)] transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkle size={20} className="shrink-0 text-[var(--fetch-blue-600)]" />
                    <span>{personalizedStarter.prompt}</span>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-[var(--fetch-blue-700)] dark:text-[var(--fetch-blue-300)] underline ml-2">
                    Use question
                  </span>
                </button>
              </div>
            )}
            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {suggestions.map(({ label, prompt, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => {
                    setDraft(prompt);
                    input.current?.focus();
                  }}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-[var(--border-subtle)] p-3 text-left text-sm font-bold hover:bg-[var(--surface-subtle)]"
                >
                  <Icon size={20} className="shrink-0 text-[var(--fetch-blue-700)]" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {(!!messages.length || loading) && (
          <div aria-live="polite" className="max-h-[55dvh] space-y-4 overflow-y-auto p-4 sm:p-7">
            {messages.map((message, index) => (
              <article
                key={`${index}-${message.role}`}
                className={`rounded-2xl p-4 ${
                  message.role === "assistant"
                    ? "bg-[var(--surface-subtle)]"
                    : "ml-auto max-w-[90%] bg-[var(--fetch-blue-100)] dark:bg-[var(--fetch-blue-950)]"
                }`}
              >
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">
                  {message.role === "assistant" ? "FETCH Tutor" : "You"}
                </p>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </article>
            ))}
            {pendingQuestion && (
              <article className="ml-auto max-w-[90%] rounded-2xl bg-[var(--fetch-blue-100)] p-4 dark:bg-[var(--fetch-blue-950)]">
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">
                  You
                </p>
                <p className="whitespace-pre-wrap">{pendingQuestion}</p>
              </article>
            )}
            {!!streamedReply && (
              <article className="rounded-2xl bg-[var(--surface-subtle)] p-4">
                <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">
                  FETCH Tutor
                </p>
                <p className="whitespace-pre-wrap">{streamedReply}</p>
              </article>
            )}
            {loading && (
              <p role="status" className="text-sm text-[var(--text-secondary)]">
                FETCH is thinking…
              </p>
            )}
          </div>
        )}

        <div className="border-t border-[var(--border-subtle)] p-4 sm:p-5">
          {isTutorUsable && (
            <p className="notice" id="tutor-availability">
              {availability}
            </p>
          )}

          {mode === "account" && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="tutor-history">
                Saved Tutor conversations
              </label>
              <select
                id="tutor-history"
                className="field min-w-0 flex-1"
                value={conversationId}
                disabled={loadingHistory}
                onChange={(event) => {
                  if (event.target.value) void openConversation(event.target.value);
                }}
              >
                <option value="">
                  {loadingHistory
                    ? "Loading conversations..."
                    : conversations.length === 0
                      ? "No previous conversations"
                      : "Recent Tutor conversations"}
                </option>
                {conversations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.preview || "Study conversation"}
                  </option>
                ))}
              </select>
              <Button variant="secondary" onClick={newConversation} size="sm">
                <Plus /> New
              </Button>
              {historyError && (
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => void refreshConversations()}
                  title="Retry loading conversations"
                >
                  <ArrowClockwise /> Retry
                </Button>
              )}
            </div>
          )}

          <label className="field-label mt-4" htmlFor="tutor-pack-context">
            StudyPack context
          </label>
          <select
            id="tutor-pack-context"
            className="field mt-1"
            value={packId}
            disabled={!!conversationId}
            onChange={(event) => setPackId(event.target.value)}
          >
            <option value="">No StudyPack selected</option>
            {packs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          {conversationId && (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              This conversation keeps its StudyPack context. Start a new chat to change it.
            </p>
          )}

          <label className="field-label mt-4" htmlFor="tutor-question">
            Your question
          </label>
          <textarea
            ref={input}
            id="tutor-question"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            className="field mt-1 resize-y"
            rows={3}
            maxLength={4000}
            placeholder="What are you working on?"
            aria-describedby="tutor-availability"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--text-secondary)]">
              {draft.length}/4,000 · Shift + Enter for a new line
            </span>
            <div className="flex gap-2">
              <Button
                variant="quiet"
                size="sm"
                disabled={!draft || loading}
                onClick={() => setDraft("")}
              >
                Clear draft
              </Button>
              <Button
                disabled={!draft.trim() || loading || !isTutorUsable}
                onClick={() => void send()}
              >
                {loading ? "Sending…" : "Send to FETCH"}
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-red-50 p-3 text-sm font-semibold text-[var(--danger)] dark:bg-red-950/40">
              <p role="alert">{error}</p>
              {isTutorUsable && draft.trim() && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void send()}
                >
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
