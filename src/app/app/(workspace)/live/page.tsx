"use client";
import Image from "next/image";
import { Copy, RocketLaunch, SignIn, UsersThree } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
export default function LivePage() {
  const [code, setCode] = useState(""),
    [created, setCreated] = useState(""),
    [status, setStatus] = useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(created);
      setStatus("Room code copied.");
    } catch {
      setStatus(
        "Clipboard unavailable. Select and copy the room code manually.",
      );
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
            Turn practice into a friendly challenge with your study buddies.
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
      <p className="notice mt-6">
        Local room preview · Real-time multiplayer is not connected. Codes work
        only within this page; no invitation or connection is sent.
      </p>
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className="surface-card flex min-h-80 flex-col p-6">
          <RocketLaunch size={30} className="text-[var(--fetch-blue-700)]" />
          <h2 className="font-display mt-5 text-2xl font-semibold">
            Create a room
          </h2>
          <p className="mt-2 text-[var(--text-secondary)]">
            Try generating and copying a local room code.
          </p>
          {created ? (
            <div className="mt-6 rounded-xl bg-[var(--surface-subtle)] p-4">
              <p className="text-xs font-bold text-[var(--text-secondary)]">
                LOCAL ROOM CODE
              </p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="select-all font-display text-3xl tracking-widest">
                  {created}
                </span>
                <button
                  aria-label="Copy room code"
                  className="flex size-11 items-center justify-center"
                  onClick={copy}
                >
                  <Copy size={23} />
                </button>
              </div>
              <Button
                className="mt-4"
                variant="quiet"
                onClick={() => {
                  setCreated("");
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
                setCreated(
                  Array.from(
                    crypto.getRandomValues(new Uint8Array(6)),
                    (n) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[n % 31],
                  ).join(""),
                );
                setStatus("Local code created. Multiplayer is not active.");
              }}
            >
              Create a room
            </Button>
          )}
        </section>
        <section className="surface-card p-6">
          <UsersThree size={30} className="text-[var(--fetch-blue-700)]" />
          <h2 className="font-display mt-5 text-2xl font-semibold">
            Join a room
          </h2>
          <p className="mt-2 text-[var(--text-secondary)]">
            Test the code you created on this page.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setStatus(
                code === created && created
                  ? "Local fixture code matched. No multiplayer connection was made."
                  : "Code not found in this page’s local preview. Create a room here first.",
              );
            }}
          >
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
                      .slice(0, 6),
                  )
                }
                maxLength={6}
                placeholder="ABC123"
              />
            </label>
            <Button className="mt-5" type="submit" disabled={code.length !== 6}>
              <SignIn />
              Check room code
            </Button>
          </form>
        </section>
      </div>
      <p
        role="status"
        className="mt-4 min-h-6 text-sm font-bold text-[var(--text-secondary)]"
      >
        {status}
      </p>
      <section className="mt-7 border-t border-[var(--border-subtle)] pt-6">
        <h2 className="font-display text-xl font-semibold">
          The next chapter: shared practice
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">
          Choose a StudyPack, invite a friend, and practice together.
          Authenticated rooms and synchronized play are planned.
        </p>
      </section>
    </div>
  );
}
