import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
  variant?: "primary" | "secondary" | "quiet" | "dark";
  size?: "sm" | "md" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { asChild, className, variant = "primary", size = "md", ...props },
    ref,
  ) {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-[13px] font-extrabold transition-[transform,background-color,border-color,box-shadow] duration-200 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
          variant === "primary" &&
            "bg-[var(--action-bg)] text-[var(--action-text)] hover:bg-[var(--action-hover)]",
          variant === "secondary" &&
            "border border-[var(--border-strong)] bg-[var(--surface-card)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]",
          variant === "quiet" &&
            "text-[var(--fetch-blue-700)] hover:bg-[var(--fetch-blue-50)]",
          variant === "dark" &&
            "bg-[var(--text-primary)] text-[var(--surface-card)] hover:opacity-90",
          size === "sm" && "min-h-9 px-3 text-sm",
          size === "md" && "px-5 py-2.5",
          size === "lg" && "min-h-14 px-7 text-lg",
          className,
        )}
        {...props}
      />
    );
  },
);
