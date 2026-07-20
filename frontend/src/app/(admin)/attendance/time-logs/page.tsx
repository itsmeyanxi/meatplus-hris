"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getMe } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import { timeLogsApi, type TimeLog, type TimeLogInput } from "@/lib/attendance";
import { PunchLocation } from "@/components/attendance/PunchLocation";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { AppButton, AppCard, PageHeader, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

/**
 * Punch timestamps are stored as local (Manila) wall-clock time but tagged UTC
 * ("…Z") by the API. Render the wall-clock exactly as stored — format in UTC so
 * the browser doesn't shift it — giving a readable local time for every punch.
 */
function fmtLoggedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PH", {
    timeZone: "UTC",
    year: "numeric", month: "short", day: "2-digit",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

export default function TimeLogsPage() {
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  // Only HR (attendance.view.any) may browse other employees; everyone else is self-only.
  const canViewAny = me?.user.permissions.includes("attendance.view.any") ?? false;
  // Creating manual logs is restricted to attendance.manage holders.
  const canManage = me?.user.permissions.includes("attendance.manage") ?? false;

  const { data: empPage } = useQuery({
    queryKey: ["employees", { all: true }],
    queryFn: () => listEmployees({ perPage: 100 }),
    enabled: canViewAny,
  });

  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("");

  const { data: devices = [] } = useQuery({ queryKey: ["time-log-devices"], queryFn: timeLogsApi.devices });

  const filterKey = ["time-logs", { employeeId, from, to, deviceId }];
  const { data: items = [] } = useQuery({
    queryKey: filterKey,
    queryFn: () =>
      timeLogsApi.list({
        employee_id: employeeId === "" ? undefined : Number(employeeId),
        from: from || undefined,
        to: to || undefined,
        device_id: deviceId || undefined,
      }),
  });

  const [form, setForm] = useState<TimeLogInput>({
    employee_id: 0,
    logged_at: "",
    direction: "in",
    source: "manual",
  });

  const create = useMutation({
    mutationFn: () => timeLogsApi.create(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["time-logs"] });
      setForm({ ...form, logged_at: "" });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time logs"
        description="Append-only raw punches. Enter logs manually here; biometric/web/mobile sources populate automatically once integrated."
      />

      <AppCard title="Filter">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canViewAny && (
            <div>
              <label className={labelCls}>Employee</label>
              <EmployeeSearchSelect value={employeeId} onChange={(id) => setEmployeeId(id)} />
            </div>
          )}
          <div>
            <label className={labelCls}>Device</label>
            <select className={inputCls} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="">All devices</option>
              {devices.map((d) => (<option key={d.device_id} value={d.device_id}>{d.name}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>From</label>
            <input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>To</label>
            <input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </AppCard>

      {canManage && (
      <AppCard title="Add manual log">
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label className={labelCls}>Employee *</label>
            <select className={inputCls} value={form.employee_id || ""} onChange={(e) => setForm({ ...form, employee_id: Number(e.target.value) })} required>
              <option value="">Select…</option>
              {empPage?.data.map((e) => (<option key={e.id} value={e.id}>{e.employee_no} — {e.full_name}</option>))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Logged at *</label>
            <input type="datetime-local" className={inputCls} value={form.logged_at} onChange={(e) => setForm({ ...form, logged_at: e.target.value.replace("T", " ") + ":00" })} required />
          </div>
          <div>
            <label className={labelCls}>Direction</label>
            <select className={inputCls} value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as TimeLogInput["direction"] })}>
              <option value="in">In</option>
              <option value="out">Out</option>
              <option value="break_out">Break out</option>
              <option value="break_in">Break in</option>
            </select>
          </div>
          <div className="flex items-end">
            <AppButton type="submit" className="w-full" disabled={create.isPending}>{create.isPending ? "Saving…" : "Add log"}</AppButton>
          </div>
        </form>
      </AppCard>
      )}

      <TableShell>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
              {["Logged at", "Employee", "Direction", "Source", "Location"].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No logs in this range</p>
                  <p className="mt-1 text-sm text-slate-500">Adjust the filter or add a manual log above.</p>
                </td>
              </tr>
            )}
            {items.map((l: TimeLog) => (
              <tr key={l.id} className="border-t border-slate-100 transition hover:bg-slate-50/70">
                <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{fmtLoggedAt(l.logged_at)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{l.employee_name ?? "—"}</div>
                  <div className="text-xs text-slate-400">#{l.employee_no ?? l.employee_id}</div>
                </td>
                <td className="px-4 py-3 capitalize text-slate-700">{l.direction.replace("_", " ")}</td>
                <td className="px-4 py-3 text-slate-500">
                  {l.source}
                  {(l.device_name || l.device_id) && (
                    <span className="ml-1 text-xs text-slate-400">· {l.device_name ?? l.device_id}</span>
                  )}
                </td>
                <td className="px-4 py-3"><PunchLocation lat={l.lat} lng={l.lng} geo={l.geo} siteLabel={l.site_location} siteLat={l.site_lat} siteLng={l.site_lng} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>
    </div>
  );
}
