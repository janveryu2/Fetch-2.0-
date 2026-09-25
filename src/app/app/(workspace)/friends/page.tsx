"use client";

import Image from "next/image";
import {
  ArrowRight,
  Copy,
  LinkSimple,
  MagnifyingGlass,
  UserPlus,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function FriendsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText("@fetch_student");
      setStatus("Username copied: @fetch_student (demo identity).");
    } catch {
      setStatus(
        "Clipboard unavailable. Select @fetch_student and copy it manually.",
      );
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
        <Badge tone="neutral">Local preview</Badge>
      </div>

      <div role="note" className="notice mt-4">
        Social preview · Friend discovery, search, and invitations are currently an interface preview. Actions do not connect to external users or send network requests.
      </div>

      <div className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStatus(
                "Friend discovery is an interface preview. No search or friend request was sent.",
              );
            }}
            className="flex items-end gap-2"
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search by username</span>
              <MagnifyingGlass
                size={20}
                className="absolute left-3 top-5 text-[var(--text-tertiary)]"
              />
              <input
                className="field pl-10"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by @username"
              />
            </label>
            <Button
              type="submit"
              aria-label="Search friends"
              disabled={!query.trim()}
            >
              <ArrowRight />
            </Button>
          </form>
          <span className="mt-1 block text-xs text-[var(--text-secondary)]">
            Preview mode: search does not connect to external user directories.
          </span>

          <section className="surface-card mt-5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-semibold">
                Your friends
              </h2>
            </div>
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
                Friend discovery and invitations will be available when accounts
                are connected.
              </p>
              <Button
                className="mt-5"
                onClick={() =>
                  setStatus(
                    "Invitations are a preview feature. No invitation was sent.",
                  )
                }
              >
                <UserPlus />
                Invite a friend
              </Button>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="surface-card p-5">
            <h2 className="text-sm font-extrabold text-[var(--text-secondary)]">
              Your global username
            </h2>
            <p className="mt-3 select-all break-all font-display text-2xl font-semibold text-[var(--fetch-blue-700)]">
              @fetch_student
            </p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Demo identity · Not a registered profile
            </p>
            <button
              onClick={copy}
              className="mt-4 flex min-h-11 cursor-pointer items-center gap-2 text-sm font-extrabold text-[var(--fetch-blue-700)]"
            >
              <Copy />
              Copy username
            </button>
            <button
              disabled
              title="Profile links require a connected account"
              className="mt-1 flex min-h-11 items-center gap-2 text-sm font-extrabold text-[var(--text-tertiary)] opacity-60"
            >
              <LinkSimple />
              Share profile link (Account feature)
            </button>
          </section>

          <section className="surface-card p-5">
            <h2 className="font-display text-xl font-semibold">Your stats</h2>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">
              Your study circle’s activity will appear here once friends are
              connected.
            </p>
          </section>
        </aside>
      </div>

      <p
        role="status"
        className="mt-4 min-h-6 text-sm font-bold text-[var(--text-secondary)]"
      >
        {status}
      </p>
    </div>
  );
}
