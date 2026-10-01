"use client";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/** Dragging is confined to the handle so audio controls remain touch-friendly. */
export function useMovablePlayer() {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  function constrain(left: number, top: number) {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return { left, top };
    const nav = document.querySelector<HTMLElement>(".fetch-mobile-nav");
    const bottom =
      nav && getComputedStyle(nav).display !== "none"
        ? nav.getBoundingClientRect().top
        : innerHeight;
    return {
      left: Math.max(12, Math.min(left, innerWidth - box.width - 12)),
      top: Math.max(12, Math.min(top, bottom - box.height - 12)),
    };
  }
  useEffect(() => {
    const clamp = () =>
      setPosition((current) => {
        if (!current) return current;
        const next = constrain(current.left, current.top);
        return next.left === current.left && next.top === current.top
          ? current
          : next;
      });
    window.addEventListener("resize", clamp);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(clamp);
    if (ref.current) observer?.observe(ref.current);
    return () => {
      window.removeEventListener("resize", clamp);
      observer?.disconnect();
    };
  }, []);
  return {
    ref,
    style: position
      ? { ...position, right: "auto", bottom: "auto" }
      : undefined,
    handle: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        const box = ref.current?.getBoundingClientRect();
        if (!box) return;
        drag.current = {
          x: event.clientX,
          y: event.clientY,
          left: box.left,
          top: box.top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        if (drag.current)
          setPosition(
            constrain(
              drag.current.left + event.clientX - drag.current.x,
              drag.current.top + event.clientY - drag.current.y,
            ),
          );
      },
      onPointerUp() {
        drag.current = null;
      },
      onPointerCancel() {
        drag.current = null;
      },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (event.key === "Home") {
          event.preventDefault();
          setPosition(null);
          return;
        }
        const offsets: Record<string, [number, number]> = {
          ArrowLeft: [-16, 0],
          ArrowRight: [16, 0],
          ArrowUp: [0, -16],
          ArrowDown: [0, 16],
        };
        const offset = offsets[event.key];
        const box = ref.current?.getBoundingClientRect();
        if (offset && box) {
          event.preventDefault();
          setPosition(constrain(box.left + offset[0], box.top + offset[1]));
        }
      },
    },
  };
}
