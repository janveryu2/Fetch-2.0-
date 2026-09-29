"use client";

import { useEffect, useState } from "react";

interface ElapsedTimerProps {
  startedAt?: string | number | null;
  className?: string;
}

export function ElapsedTimer({ startedAt, className }: ElapsedTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    const startTime = startedAt ? new Date(startedAt).getTime() : Date.now();

    function update() {
      const now = Date.now();
      const diffSecs = Math.max(0, Math.floor((now - startTime) / 1000));
      setElapsedSeconds(diffSecs);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return (
    <span
      className={className || "font-mono font-semibold text-xs tracking-wider text-[var(--text-secondary)]"}
      aria-label={`Elapsed time: ${minutes} minutes and ${seconds} seconds`}
    >
      {formatted}
    </span>
  );
}
