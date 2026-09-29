import { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SkeletonBlockProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: "none" | "sm" | "md" | "lg" | "xl" | "full";
}

export function SkeletonBlock({
  width,
  height,
  rounded = "lg",
  className,
  style,
  ...props
}: SkeletonBlockProps) {
  const roundedClasses = {
    none: "rounded-none",
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-xl",
    xl: "rounded-2xl",
    full: "rounded-full",
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse bg-[var(--border-subtle)]/70",
        roundedClasses[rounded],
        className
      )}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        ...style,
      }}
      {...props}
    />
  );
}
