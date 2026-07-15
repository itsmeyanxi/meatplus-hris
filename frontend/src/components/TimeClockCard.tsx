"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { myTimeClockApi, type TimeClockStatus } from "@/lib/attendance";

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

// Ask the browser for GPS; resolve to null (never reject) if denied/unavailable,
// so a location refusal still lets the punch go through.
function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

export function TimeClockCard() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["my", "time-clock"],
    queryFn: myTimeClockApi.today,
    refetchOnWindowFocus: true,
  });

  const punch = useMutation({
    mutationFn: async (direction: "in" | "out") => {
      const coords = await getCoords();
      return myTimeClockApi.punch(direction, coords ?? undefined);
    },
    onMutate: () => setError(null),
    onSuccess: (res) => {
      qc.setQueryData(["my", "time-clock"], res.data);
      // The punch also recomputes today's DTR server-side; refresh anything showing it.
      qc.invalidateQueries({ queryKey: ["my", "attendance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: unknown) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not record your punch. Please try again.";
      setError(msg);
    },
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
    // server_time carries the correct +08:00 offset, so this real epoch converts
    // cleanly to Manila for the live ticking clock.
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
  const busy = punch.isPending;

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
              <span className="text-slate-500">Not clocked in yet today</span>
            )}
          </div>
        </div>

        {/* Right: the one valid action */}
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            disabled={busy || isLoading}
            onClick={() => punch.mutate(isIn ? "out" : "in")}
            className={`rounded-2xl px-8 py-4 text-lg font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
              isIn
                ? "bg-rose-600 hover:bg-rose-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy ? "Saving…" : isIn ? "Time Out" : "Time In"}
          </button>
          <p className="text-center text-xs text-slate-400 sm:text-right">
            Records your location for verification
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      {/* Today's punches */}
      {status && status.punches.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
            Today&apos;s punches
          </p>
          <ul className="flex flex-wrap gap-2">
            {status.punches.map((p) => (
              <li
                key={p.id}
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
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
