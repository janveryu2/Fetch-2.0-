"use client";

import Image from "next/image";
import {
  ChatCircleDots,
  MagnifyingGlass,
  PaperPlaneTilt,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Message = { id: string; body: string; mine: boolean };

export default function MessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");

  function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((items) => [
      ...items,
      { id: crypto.randomUUID(), body: text, mine: true },
    ]);
    setDraft("");
    setAnnouncement(`Message sent: ${text}`);
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-5.5rem)] max-w-[1200px] flex-col px-3 py-3 sm:px-7 sm:py-6 md:h-[calc(100dvh-6.5rem)] md:max-h-[820px] md:min-h-[500px]">
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-[var(--shadow-soft)] md:grid-cols-[320px_1fr]">
        {/* Desktop / Tablet Sidebar */}
        <aside className="hidden border-r border-[var(--border-subtle)] p-5 md:flex md:flex-col">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold">Messages</h1>
            <Badge tone="warning">Fixture</Badge>
          </div>
          <label className="relative mt-4 block">
            <span className="sr-only">Search conversations</span>
            <MagnifyingGlass
              size={18}
              className="absolute left-3 top-3 text-[var(--text-tertiary)]"
            />
            <input
              className="min-h-11 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] pl-10 pr-3 text-sm"
              placeholder="Search unavailable in preview"
              disabled
            />
          </label>
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
            Preview messages are stored in memory and reset on page reload.
          </p>
        </aside>

        {/* Conversation Area */}
        <section className="flex min-h-0 flex-1 flex-col">
          <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 sm:px-5">
            <div className="flex items-center gap-3 min-w-0">
              <ChatCircleDots
                size={24}
                className="shrink-0 text-[var(--fetch-blue-600)]"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-extrabold text-sm sm:text-base truncate">FETCH Demo</h2>
                  <Badge tone="warning" className="md:hidden">Preview</Badge>
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate">
                  Local preview only · Messages reset on reload
                </p>
              </div>
            </div>
          </header>

          {/* Polite live region for screen reader announcements */}
          <div className="sr-only" aria-live="polite">
            {announcement}
          </div>

          {/* Bounded Scrollable Message Area */}
          <div className="flex flex-1 flex-col justify-end gap-3 overflow-y-auto p-4 sm:p-5">
            {messages.length === 0 ? (
              <div className="my-auto text-center px-4 py-6">
                <Image
                  src="/assets/mascot/fetch-wave.png"
                  alt="FETCH ready to start a conversation"
                  width={140}
                  height={140}
                  className="pixel-art mx-auto w-[100px] sm:w-[130px]"
                />
                <h3 className="font-display mt-3 text-lg sm:text-xl font-semibold">
                  Start a fixture conversation
                </h3>
                <p className="mx-auto mt-1 max-w-sm text-xs sm:text-sm text-[var(--text-secondary)]">
                  Try composing a local message. This is a local UI preview and nothing is sent to another person.
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
                  <span className="sr-only">You (local preview): </span>
                  {message.body}
                </div>
              ))
            )}
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
                  send(event);
                }
              }}
              rows={1}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 text-sm focus:outline-2 focus:outline-[var(--fetch-blue-600)]"
              placeholder="Write a message"
            />
            <Button
              type="submit"
              aria-label="Send message"
              disabled={!draft.trim()}
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
