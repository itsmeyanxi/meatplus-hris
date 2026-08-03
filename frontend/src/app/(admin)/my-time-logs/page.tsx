"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { myTimeLogsApi, type AttendanceEvent, type TimeLog } from "@/lib/attendance";
import { PunchLocation } from "@/components/attendance/PunchLocation";
import { EVENT_BADGE, eventWhen, eventDirectionLabel } from "@/components/attendance/attendance-events";
import { PageHeader, AppCard, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Render a punch timestamp as readable Manila local time. */
function fmtLoggedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric", month: "short", day: "2-digit",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

export default function MyTimeLogsPage() {
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const hasEmployee = Boolean(me?.user.employee);

  const todayObj = useMemo(() => new Date(), []);
  const [from, setFrom] = useState<string>(ymd(new Date(todayObj.getFullYear(), todayObj.getMonth(), 1)));
  const [to, setTo] = useState<string>(ymd(todayObj));

  const { data = { punches: [], events: [] }, isLoading } = useQuery({
    queryKey: ["my-time-logs", from, to],
    queryFn: () => myTimeLogsApi.list({ from: from || undefined, to: to || undefined }),
    enabled: hasEmployee,
  });

  // Merge punches + OB/COA/OT events into one date-sorted timeline.
  type Row =
    | { kind: "punch"; sortTs: string; log: TimeLog }
    | { kind: "event"; sortTs: string; ev: AttendanceEvent };
  const rows = useMemo<Row[]>(() => {
    const punchRows: Row[] = data.punches.map((log) => ({ kind: "punch", sortTs: log.logged_at, log }));
    const eventRows: Row[] = data.events.map((ev) => ({
      kind: "event",
      sortTs: `${ev.date ?? "0000-00-00"}T${ev.start_time ?? "23:59"}:00`,
      ev,
    }));
    return [...punchRows, ...eventRows].sort((a, b) => b.sortTs.localeCompare(a.sortTs));
  }, [data]);

  const counts = useMemo(() => {
    const c = { punch: data.punches.length, ob: 0, coa: 0, ot: 0 };
    for (const ev of data.events) c[ev.type]++;
    return c;
  }, [data]);

  if (!meLoading && !hasEmployee) {
    return (
      <div className="space-y-6">
        <PageHeader title="My time logs" />
        <AppCard>
          <div className="py-10 text-center">
            <p className="text-sm text-slate-600">Your account isn&rsquo;t linked to an employee record yet.</p>
            <p className="mt-1 text-xs text-slate-400">Contact HR or IT to have your account set up.</p>
          </div>
        </AppCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="My time logs"
        description="Your own clock in/out punches, plus your approved Official Business, Certificate of Attendance and Overtime — so off-site and certified time shows up too."
      />

      <AppCard title="Filter">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>From</label>
            <input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <div className="flex flex-wrap gap-2 text-xs">
              <Tag className="bg-slate-100 text-slate-600">{counts.punch} punches</Tag>
              {counts.ob > 0 && <Tag className={EVENT_BADGE.ob.cls}>{counts.ob} OB</Tag>}
              {counts.coa > 0 && <Tag className={EVENT_BADGE.coa.cls}>{counts.coa} COA</Tag>}
              {counts.ot > 0 && <Tag className={EVENT_BADGE.ot.cls}>{counts.ot} OT</Tag>}
            </div>
          </div>
        </div>
      </AppCard>

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              {["When", "Direction", "Source / Type", "Location / Reason", "Approval"].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-16 text-center text-slate-400">Loading…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No time logs in this range</p>
                  <p className="mt-1 text-sm text-slate-500">Adjust the dates above.</p>
                </td>
              </tr>
            )}
            {rows.map((row) =>
              row.kind === "punch" ? (
                (() => {
                  const l = row.log;
                  return (
                    <tr key={`p-${l.id}`} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{fmtLoggedAt(l.logged_at)}</td>
                      <td className="px-4 py-3 capitalize text-slate-700">{l.direction.replace("_", " ")}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {l.source}
                        {(l.device_name || l.device_id) && (
                          <span className="ml-1 text-xs text-slate-400">· {l.device_name ?? l.device_id}</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><PunchLocation lat={l.lat} lng={l.lng} geo={l.geo} siteLabel={l.site_location} siteLat={l.site_lat} siteLng={l.site_lng} /></td>
                      <td className="px-4 py-3 text-xs text-slate-400">—</td>
                    </tr>
                  );
                })()
              ) : (
                (() => {
                  const ev = row.ev;
                  const badge = EVENT_BADGE[ev.type];
                  return (
                    <tr key={`e-${ev.type}-${ev.date}-${ev.start_time ?? ""}`} className="border-t border-slate-100 bg-slate-50/40 transition hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{eventWhen(ev)}</td>
                      <td className="px-4 py-3 text-slate-700">{eventDirectionLabel(ev)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {ev.detail && <div>{ev.detail}</div>}
                        {ev.reason && <div className="text-xs text-slate-400">{ev.reason}</div>}
                        {!ev.detail && !ev.reason && <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {ev.approved_by ? (
                          <>
                            <div className="font-medium text-slate-600">{ev.approved_by}</div>
                            {ev.approved_at && <div className="text-slate-400">{ev.approved_at}</div>}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })()
              ),
            )}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}

function Tag({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${className}`}>{children}</span>;
}
