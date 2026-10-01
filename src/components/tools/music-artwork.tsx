"use client";
import Image from "next/image";
import { useState } from "react";

/** Publisher art is kept separate from copy; failures use original non-logo artwork. */
export function MusicArtwork({
  src,
  className = "",
  sizes = "160px",
}: {
  src?: string;
  className?: string;
  sizes?: string;
}) {
  const [failedSource, setFailedSource] = useState<string>();
  const imageSrc =
    !src || failedSource === src ? "/assets/illustrations/focus-lake.png" : src;
  return (
    <span className={"music-artwork " + className}>
      <Image
        src={imageSrc}
        alt=""
        fill
        sizes={sizes}
        unoptimized={imageSrc.startsWith("https://")}
        onError={() => setFailedSource(src)}
      />
    </span>
  );
}
