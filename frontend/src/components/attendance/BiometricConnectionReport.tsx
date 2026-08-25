"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { TableShell } from "@/components/ui";
import { devicesApi, type DeviceHealth, type DeviceState } from "@/lib/devices";

/**
 * Connection health for every terminal.
 *
 * The device list answers "what devices exist"; this answers "are they working".
 * A terminal can look perfectly healthy there — approved, has a serial, has a
 * company — while having sent nothing for weeks. That matters because absence is
 * judged from missing punches, so a silent device quietly marks its people ABSENT
 * every day until somebody notices.
 *
 * Two different questions live in this table, and conflating them was the old bug:
 * "Last seen" is the ~30-second connection heartbeat (is the unit plugged in and
 * reachable), while "Last punch" is attendance activity. A quiet door with nobody
 * punching used to read as OFFLINE for days — hence "Connected · no punches", which
 * is a healthy terminal, not an outage.
 */

const STATE_STYLE: Record<DeviceState, { dot: string; chip: string; label: string }> = {
  live:    { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700",  label: "Live" },
  idle:    { dot: "bg-sky-500",     chip: "bg-sky-50 text-sky-700",          label: "Connected · no punches" },
  quiet:   { dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700",      label: "Out of touch" },
  offline: { dot: "bg-red-500",     chip: "bg-red-50 text-red-700",          label: "Offline" },
  never:   { dot: "bg-red-500",     chip: "bg-red-50 text-red-700",          label: "Never seen" },
};

/** How long since the terminal last said anything, in words. */
function silence(mins: number | null): string {
  if (mins === null) return "never";
  if (mins < 60) return `${Math.round(mins)} min ago`;
  const h = mins / 60;
  if (h < 24) return `${Math.round(h)} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/** Relative age of a timestamp, for the "Last punch" column. */
function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  if (!isFinite(mins) || mins < 0) return "—";
  return silence(mins);
}

/** Below ~90% a meaningful share of what the device sends is landing on nobody. */
function matchTone(rate: number | null): string {
  if (rate === null) return "text-slate-400";
  if (rate >= 95) return "text-emerald-700";
  if (rate >= 80) return "text-amber-600";
  return "text-red-600";
}

export function BiometricConnectionReport() {
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["device-connection-report"],
    queryFn: devicesApi.report,
    // Health goes stale fast — a terminal can drop between page views.
    refetchInterval: 60_000,
  });

  const download = async () => {
    setExporting(true);
    try {
      await devicesApi.downloadReport();
    } catch {
      toast.error("Couldn't export the connection report.");
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;
  const devices = data?.devices ?? [];
  const needing = devices.filter((d) => d.attention);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Connection report</h2>
          <p className="text-xs text-slate-500">
            Whether each terminal is still reporting, and whether its punches reach an employee.
            {s && <> Updated {new Date(s.generated_at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila" })}.</>}
          </p>
        </div>
        <button
          onClick={download}
          disabled={exporting || devices.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
          {exporting ? "Preparing…" : "Export CSV"}
        </button>
      </div>

      {/* Headline counts — what needs a human, first. */}
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Needs attention", value: s.needs_attention, tone: s.needs_attention > 0 ? "text-red-600" : "text-emerald-700" },
            { label: "Live", value: s.live, tone: "text-emerald-700" },
            { label: "Quiet", value: s.quiet, tone: s.quiet > 0 ? "text-amber-600" : "text-slate-700" },
            { label: "Offline", value: s.offline + s.never, tone: s.offline + s.never > 0 ? "text-red-600" : "text-slate-700" },
            { label: "Punches today", value: s.punches_today.toLocaleString(), tone: "text-slate-800" },
            { label: "Staged / unmatched", value: s.staged_pending.toLocaleString(), tone: s.staged_pending > 0 ? "text-amber-600" : "text-slate-700" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className={`text-lg font-semibold tabular-nums ${c.tone}`}>{c.value}</div>
              <div className="text-[11px] text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Anything actionable, spelled out in words rather than left to be inferred. */}
      {needing.length > 0 && (
        <ul className="space-y-1.5">
          {needing.map((d) => (
            <li key={d.id} className="flex gap-2 rounded-lg border-l-[3px] border-red-400 bg-red-50/60 px-3 py-2 text-xs">
              <span className="font-semibold text-slate-800">{d.name}</span>
              <span className="text-slate-600">{d.attention}</span>
            </li>
          ))}
        </ul>
      )}

      <TableShell>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Device", "Company", "State", "Last contact", "Last punch", "Today", "7 days", "30 days", "People", "Match rate", "Staged"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {isLoading ? (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-xs text-slate-400">Checking terminals…</td></tr>
              ) : devices.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-xs text-slate-400">No devices registered for this company.</td></tr>
              ) : (
                devices.map((d: DeviceHealth) => {
                  const st = STATE_STYLE[d.state];
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 flex-none rounded-full ${st.dot}`} />
                          <span className="font-medium text-slate-800">{d.name}</span>
                          {!d.is_active && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">not approved</span>}
                        </div>
                        <div className="pl-4 text-[11px] text-slate-400">{d.serial_no}</div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600">{d.company ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.chip}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{silence(d.silent_minutes)}</td>
                      {/* Deliberately its own column: a terminal can be reachable
                          (Last contact seconds ago) while nobody has punched on it
                          for a week. Reading one as the other is what made healthy
                          low-traffic doors look dead. */}
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{ago(d.last_punch_at)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-700">{d.punches_today}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600">{d.punches_7d}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600">{d.punches_30d.toLocaleString()}</td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600">{d.employees_30d}</td>
                      <td className={`px-3 py-2.5 tabular-nums font-medium ${matchTone(d.match_rate)}`}>
                        {d.match_rate === null ? "—" : `${d.match_rate}%`}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-slate-600">
                        {d.staged_pending === 0 ? "—" : (
                          <span title={`${d.staged_pins} unmapped PIN(s)`}>
                            {d.staged_pending.toLocaleString()}
                            <span className="ml-1 text-[11px] text-slate-400">/ {d.staged_pins} PINs</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </TableShell>

      <p className="text-[11px] text-slate-400">
        <b>Match rate</b> is the share of punches from that terminal in the last 30 days that landed on an
        employee. A low rate means the device is reachable but its PINs aren&apos;t mapped in the HRIS — those
        punches are staged, not lost, and recover automatically once the PIN maps.
      </p>
    </section>
  );
}
