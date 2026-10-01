"use client";

import { useEffect } from "react";

/** Keep fixed navigation clear of the software keyboard without moving the focused field. */
export function useMobileKeyboard() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let restingHeight = window.innerHeight;
    const update = () => {
      const focused = document.activeElement;
      const editing = focused instanceof HTMLElement &&
        (focused.matches("input, textarea") || focused.isContentEditable);
      if (!editing) restingHeight = window.innerHeight;
      const keyboardOpen = editing && Math.max(restingHeight, window.innerHeight) - viewport.height > 140;
      document.documentElement.dataset.keyboardOpen = String(keyboardOpen);
      document.documentElement.style.setProperty("--visible-viewport-height", `${viewport.height}px`);
    };
    viewport.addEventListener("resize", update);
    const orientationChanged = () => { restingHeight = window.innerHeight; update(); };
    window.addEventListener("orientationchange", orientationChanged);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    update();
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", orientationChanged);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
      delete document.documentElement.dataset.keyboardOpen;
      document.documentElement.style.removeProperty("--visible-viewport-height");
    };
  }, []);
}
