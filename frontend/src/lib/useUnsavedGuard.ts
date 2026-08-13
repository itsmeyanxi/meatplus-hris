"use client";

import { useEffect } from "react";

/**
 * Warns before a browser navigation / tab-close / refresh throws away unsaved
 * form edits. Pass `true` only while there are genuinely unsaved changes so the
 * prompt never fires needlessly. (This covers full-page unloads; guard in-app
 * Cancel/Back buttons with an explicit confirm.)
 */
export function useUnsavedGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
