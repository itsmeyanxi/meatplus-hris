"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { timeLogsApi, timeLogsExportUrl, type AttendanceEvent, type TimeLog, type TimeLogInput } from "@/lib/attendance";
import { EVENT_BADGE, eventWhen, eventDirectionLabel } from "@/components/attendance/attendance-events";
import { getLookup } from "@/lib/employees";
import { PunchLocation } from "@/components/attendance/PunchLocation";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { SearchSelect } from "@/components/SearchSelect";
import { AppButton, AppCard, PageHeader, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

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

export default function TimeLogsPage() {
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  // Only HR (attendance.view.any) may browse other employees; everyone else is self-only.
  const canViewAny = me?.user.permissions.includes("attendance.view.any") ?? false;
  // Creating manual logs is restricted to attendance.manage holders.
  const canManage = me?.user.permissions.includes("attendance.manage") ?? false;

  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [deviceId, setDeviceId] = useState<string>("");
  const [companyId, setCompanyId] = useState<number | "">("");
  const [departmentId, setDepartmentId] = useState<number | "">("");

  const { data: devices = [] } = useQuery({ queryKey: ["time-log-devices"], queryFn: timeLogsApi.devices });

  // Companies the user can access (for the Company filter). Single-company users
  // just see their own; super-admins see all of theirs.
  const companies = me?.user.companies ?? [];
  const showCompany = canViewAny && companies.length > 1;

  // Departments, scoped to the chosen company (or the active one).
  const { data: departments = [] } = useQuery({
    queryKey: ["tl-departments", companyId],
    queryFn: () => getLookup("departments", companyId === "" ? {} : { company_id: Number(companyId) }),
    enabled: canViewAny,
  });

  const filterKey = ["time-logs", { employeeId, from, to, deviceId, companyId, departmentId }];
  const { data: result = { punches: [], events: [] } } = useQuery({
    queryKey: filterKey,
    queryFn: () =>
      timeLogsApi.list({
        employee_id: employeeId === "" ? undefined : Number(employeeId),
        from: from || undefined,
        to: to || undefined,
        device_id: deviceId || undefined,
        company_id: companyId === "" ? undefined : Number(companyId),
        department_id: departmentId === "" ? undefined : Number(departmentId),
      }),
  });

  // Merge raw punches with OB / COA / OT events into one date-sorted timeline so
  // off-site work (OB), certified missed punches (COA) and overtime all show up.
  type Row =
    | { kind: "punch"; sortTs: string; log: TimeLog }
    | { kind: "event"; sortTs: string; ev: AttendanceEvent };
  const rows = useMemo<Row[]>(() => {
    const punchRows: Row[] = result.punches.map((log) => ({ kind: "punch", sortTs: log.logged_at, log }));
    const eventRows: Row[] = result.events.map((ev) => ({
      kind: "event",
      sortTs: `${ev.date ?? "0000-00-00"}T${ev.start_time ?? "23:59"}:00`,
      ev,
    }));
    return [...punchRows, ...eventRows].sort((a, b) => b.sortTs.localeCompare(a.sortTs));
  }, [result]);

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

  // Download the CSV for the current filters (session cookie authenticates the request).
  const onExport = () => {
    const a = document.createElement("a");
    a.href = timeLogsExportUrl({ employee_id: employeeId, from, to, device_id: deviceId, company_id: companyId, department_id: departmentId });
    a.download = "time-logs.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Time logs"
        description="Raw punches plus labelled Official Business, Certificate of Attendance and Overtime — so off-site work and certified/approved time show up, not just biometric taps."
        actions={<AppButton variant="secondary" onClick={onExport}>Export CSV</AppButton>}
      />

      <AppCard title="Filter">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canViewAny && (
            <div>
              <label className={labelCls}>Employee</label>
              <EmployeeSearchSelect value={employeeId} onChange={(id) => setEmployeeId(id)} />
            </div>
          )}
          {showCompany && (
            <div>
              <label className={labelCls}>Company</label>
              <SearchSelect
                className={inputCls}
                value={companyId === "" ? "" : String(companyId)}
                onChange={(v) => { setCompanyId(v === "" ? "" : Number(v)); setDepartmentId(""); }}
                options={[{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: String(c.id), label: c.code ?? c.legal_name }))]}
              />
            </div>
          )}
          {canViewAny && (
            <div>
              <label className={labelCls}>Department</label>
              <SearchSelect
                className={inputCls}
                value={departmentId === "" ? "" : String(departmentId)}
                onChange={(v) => setDepartmentId(v === "" ? "" : Number(v))}
                options={[{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: String(d.id), label: d.name ?? String(d.id) }))]}
              />
            </div>
          )}
          <div>
            <label className={labelCls}>Device</label>
            <SearchSelect className={inputCls} value={deviceId} onChange={setDeviceId} options={[{ value: "", label: "All devices" }, ...devices.map((d) => ({ value: d.device_id, label: d.name }))]} />
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
            <EmployeeSearchSelect value={form.employee_id || ""} onChange={(id) => setForm({ ...form, employee_id: id === "" ? 0 : Number(id) })} placeholder="Select…" />
          </div>
          <div>
            <label className={labelCls}>Logged at *</label>
            <input type="datetime-local" className={inputCls} value={form.logged_at} onChange={(e) => setForm({ ...form, logged_at: e.target.value.replace("T", " ") + ":00" })} required />
          </div>
          <div>
            <label className={labelCls}>Direction</label>
            <SearchSelect className={inputCls} value={form.direction} onChange={(v) => setForm({ ...form, direction: v as TimeLogInput["direction"] })} options={[{ value: "in", label: "In" }, { value: "out", label: "Out" }, { value: "break_out", label: "Break out" }, { value: "break_in", label: "Break in" }]} />
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
              {["Logged at", "Employee", "Company", "Direction", "Source", "Location / Reason", "Approval"].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">No logs in this range</p>
                  <p className="mt-1 text-sm text-slate-500">Adjust the filter or add a manual log above.</p>
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
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{l.employee_name ?? "—"}</div>
                        <div className="text-xs text-slate-400">#{l.employee_no ?? l.employee_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {l.company_code ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600" title={l.company_name ?? undefined}>
                            {l.company_code}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
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
                    <tr key={`e-${ev.type}-${ev.employee_id}-${ev.date}-${ev.start_time ?? ""}`} className="border-t border-slate-100 bg-slate-50/40 transition hover:bg-slate-50">
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{eventWhen(ev)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{ev.employee_name ?? "—"}</div>
                        <div className="text-xs text-slate-400">#{ev.employee_no ?? ev.employee_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        {ev.company_code ? (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600" title={ev.company_name ?? undefined}>
                            {ev.company_code}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
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
