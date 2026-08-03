import type { AttendanceEvent } from "@/lib/attendance";

/**
 * Shared presentation for non-punch attendance events (OB / COA / OT) surfaced
 * on the time-log views. Keeps the admin and employee pages labelling them the
 * same way so an OB / COA / OT entry always reads clearly, never as a blank row.
 */
export const EVENT_BADGE: Record<AttendanceEvent["type"], { short: string; label: string; cls: string }> = {
  ob: { short: "OB", label: "Official Business", cls: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" },
  coa: { short: "COA", label: "Certificate of Attendance", cls: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  ot: { short: "OT", label: "Overtime", cls: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200" },
};

function prettyDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, day ?? 1);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "2-digit" });
}

/** Human "when" for an event: date (or date range) plus its time window, if any. */
export function eventWhen(ev: AttendanceEvent): string {
  const datePart = ev.date_to && ev.date_to !== ev.date
    ? `${prettyDate(ev.date)} – ${prettyDate(ev.date_to)}`
    : prettyDate(ev.date);
  const window = ev.start_time || ev.end_time
    ? ` · ${ev.start_time ?? "—"}–${ev.end_time ?? "—"}`
    : "";
  return datePart + window;
}

/** What to show in the "direction" column for an event row. */
export function eventDirectionLabel(ev: AttendanceEvent): string {
  if (ev.type === "coa") {
    const mp = ev.missed_punch;
    return mp === "both" ? "Missed In & Out" : mp === "out" ? "Missed Out" : mp === "in" ? "Missed In" : "Certified";
  }
  if (ev.type === "ot") {
    return ev.hours != null ? `${ev.hours} hr${ev.hours === 1 ? "" : "s"}` : "Overtime";
  }
  return "Off-site"; // OB
}
