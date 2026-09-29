"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: "primary" | "secondary" | "quiet" | "dark";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  function LoadingButton(
    { isLoading = false, loadingText, disabled, children, className, ...props },
    ref
  ) {
    return (
      <Button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={cn(isLoading && "cursor-wait opacity-80", className)}
        {...props}
      >
        {isLoading && (
          <CircleNotch
            size={18}
            className="animate-spin shrink-0"
            aria-hidden="true"
          />
        )}
        <span>{isLoading && loadingText ? loadingText : children}</span>
      </Button>
    );
  }
);
