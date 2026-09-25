import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function FetchBrand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-3 no-underline", className)} aria-label="FETCH home">
      <Image src="/assets/mascot/fetch-logo.png" alt="" width={48} height={48} className="pixel-art size-10 rounded-[12px]" priority />
      {!compact && (
        <span className="leading-none">
          <span className="font-display block text-[1.35rem] font-semibold tracking-[-.02em]">FETCH</span>
          <span className="mt-1 block text-[.62rem] font-extrabold tracking-[.19em] text-[var(--fetch-blue-700)]">STUDY BUDDY</span>
        </span>
      )}
    </Link>
  );
}
