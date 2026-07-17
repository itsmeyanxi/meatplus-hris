"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

// Auto sign-out after this much inactivity. Any mouse/keyboard/scroll/touch
// activity resets the timer. Shared across tabs via localStorage, so activity in
// one tab keeps the others alive.
const IDLE_MINUTES = 15;
const IDLE_MS = IDLE_MINUTES * 60 * 1000;
const LAST_ACTIVITY_KEY = "hris:last-activity";

export function IdleTimeout() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loggingOut = useRef(false);

  useEffect(() => {
    const now = () => Date.now();
    let lastWrite = 0;

    const markActive = () => {
      const t = now();
      // Throttle writes so mousemove doesn't hammer localStorage.
      if (t - lastWrite > 5000) {
        lastWrite = t;
        localStorage.setItem(LAST_ACTIVITY_KEY, String(t));
      }
    };

    const doLogout = async () => {
      if (loggingOut.current) return;
      loggingOut.current = true;
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      try { await logout(); } catch { /* already gone — still redirect */ }
      router.push("/login?idle=1");
    };

    const check = () => {
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || now());
      const remaining = IDLE_MS - (now() - last);
      if (remaining <= 0) { void doLogout(); return; }
      // Re-check when the window is due to expire (cap at 30s so cross-tab
      // activity is picked up promptly).
      timer.current = setTimeout(check, Math.min(remaining + 250, 30_000));
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    // Re-check immediately when the tab regains focus (covers a slept machine).
    document.addEventListener("visibilitychange", check);

    markActive();
    check();

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener("visibilitychange", check);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
