"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

interface FetchLoadingMascotProps {
  size?: number;
  variant?: "active" | "seated" | "wave" | "celebrate";
  className?: string;
}

export function FetchLoadingMascot({
  size = 48,
  variant = "active",
  className,
}: FetchLoadingMascotProps) {
  const src = `/assets/mascot/fetch-${variant}.png`;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        className="pixel-art fetch-breathe select-none"
        priority
      />
    </div>
  );
}
