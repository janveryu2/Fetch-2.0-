"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/cn";

export interface UserAvatarProps {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
  imageClassName?: string;
}

const DEFAULT_MASCOT_AVATAR = "/assets/mascot/fetch-logo.png";

export function UserAvatar({
  src,
  alt,
  size = 48,
  className,
  imageClassName,
}: UserAvatarProps) {
  const [hasError, setHasError] = useState(false);

  // If no source provided or failed to load, fallback to mascot logo
  const effectiveSrc = !src || hasError ? DEFAULT_MASCOT_AVATAR : src;
  const isFallback = effectiveSrc === DEFAULT_MASCOT_AVATAR;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border-subtle)]",
        className,
      )}
      style={size ? { width: size, height: size } : undefined}
    >
      <Image
        src={effectiveSrc}
        alt={alt || "User avatar"}
        fill
        unoptimized
        sizes={`${size}px`}
        className={cn(
          "object-cover transition-opacity duration-200",
          isFallback && "p-1 pixel-art object-contain",
          imageClassName,
        )}
        onError={() => {
          if (!hasError) {
            setHasError(true);
          }
        }}
      />
    </div>
  );
}
