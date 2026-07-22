"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { myTimeClockApi } from "@/lib/attendance";
import { PunchLocation } from "@/components/attendance/PunchLocation";

const TZ = "Asia/Manila";

// Punch timestamps are stored as Manila wall-clock but the app's DB timezone is
// UTC, so the API tags them +00:00. Read the literal clock straight from the
// string — never convert timezones — matching how the rest of the app renders
// punch times. (Converting would shift every punch by +8 hours.)
function fmtTime(iso: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return "";
  let h = Number(m[1]);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${String(h).padStart(2, "0")}:${m[2]} ${ap}`;
}
function fmtDate(iso: string): string {
  const dt = new Date(iso.slice(0, 10) + "T00:00:00");
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Display-only time clock. Attendance is recorded on the biometric device, not
 * here — this card just shows the live time, today's status, and the punches
 * that came in from the device.
 */
export function TimeClockCard() {
  const { data: status, isLoading } = useQuery({
    queryKey: ["my", "time-clock"],
    queryFn: myTimeClockApi.today,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // pick up new device punches without a manual refresh
  });

  // Live clock, driven off the server time so it's correct even if the device
  // clock is wrong. offsetRef = serverTime - localTime at the moment of fetch.
  const offsetRef = useRef(0);
  const [nowLabel, setNowLabel] = useState("");
  useEffect(() => {
    if (status?.server_time) {
      offsetRef.current = new Date(status.server_time).getTime() - Date.now();
    }
  }, [status?.server_time]);
  useEffect(() => {
    const tick = () =>
      setNowLabel(
        new Date(Date.now() + offsetRef.current).toLocaleTimeString("en-US", {
          timeZone: TZ,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const isIn = status?.state === "in";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: live clock + status */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {status ? fmtDate(status.server_time) : "Time Clock"}
          </p>
          <p className="mt-1 font-mono text-4xl font-semibold tabular-nums text-slate-900">
            {nowLabel || "—"}
          </p>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span
              className={`inline-block h-2.5 w-2.5 rounded-full ${
                isIn ? "bg-emerald-500" : "bg-slate-300"
              }`}
            />
            {isLoading ? (
              <span className="text-slate-400">Loading…</span>
            ) : isIn && status?.clocked_in_at ? (
              <span className="text-emerald-700">
                Clocked in at <strong>{fmtTime(status.clocked_in_at)}</strong>
              </span>
            ) : status?.last_punch_at ? (
              <span className="text-slate-500">
                Clocked out at <strong>{fmtTime(status.last_punch_at)}</strong>
              </span>
            ) : (
              <span className="text-slate-500">No punch yet today</span>
            )}
          </div>
        </div>

        {/* Right: this is a read-only view — punching happens on the device */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center sm:text-right">
          <p className="text-sm font-medium text-slate-600">Biometric attendance</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Time in / out is recorded on the biometric device.
          </p>
        </div>
      </div>

      {/* Today's punches (from the device) */}
      {(status?.punches ?? []).length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Today&apos;s punches
          </p>
          <ul className="flex flex-col gap-2">
            {(status?.punches ?? []).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
                    p.direction === "in"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <strong>{p.direction === "in" ? "IN" : "OUT"}</strong>
                  {fmtTime(p.logged_at)}
                  {p.source !== "biometric" && (
                    <span className="rounded bg-white/70 px-1 text-[10px] uppercase text-slate-400">
                      {p.source}
                    </span>
                  )}
                </span>
                <PunchLocation lat={p.lat} lng={p.lng} geo={p.geo} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
