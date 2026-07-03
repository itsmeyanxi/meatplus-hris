"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getMe } from "@/lib/auth";
import { getLookup, listEmployees } from "@/lib/employees";
import { dtrApi, type DailyTimeRecord, type DayStatus } from "@/lib/attendance";
import { PageHeader } from "@/components/ui";
import { inputCls } from "@/lib/form-classes";

// ── helpers ──────────────────────────────────────────────────────────────────

function ymd(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthRange(year: number, month: number) {
  return {
    from: ymd(year, month, 1),
    to: ymd(year, month, new Date(year, month + 1, 0).getDate()),
  };
}

const TODAY = new Date();

const STATUS_COLOR: Record<DayStatus, string> = {
  present:  "bg-emerald-100 text-emerald-800 ring-emerald-200",
  late:     "bg-amber-100  text-amber-800  ring-amber-200",
  absent:   "bg-red-100    text-red-800    ring-red-200",
  leave:    "bg-indigo-100 text-indigo-800 ring-indigo-200",
  holiday:  "bg-violet-100 text-violet-800 ring-violet-200",
  rest_day: "bg-slate-100  text-slate-500  ring-slate-200",
  no_record:"bg-white      text-slate-300  ring-slate-100",
};

const STATUS_LABEL: Record<DayStatus, string> = {
  present: "P", late: "L", absent: "A", leave: "Lv",
  holiday: "H", rest_day: "—", no_record: "",
};

const LEGEND: { key: DayStatus; label: string; dot: string }[] = [
  { key: "present",  label: "Present",  dot: "bg-emerald-500" },
  { key: "late",     label: "Late",     dot: "bg-amber-500" },
  { key: "absent",   label: "Absent",   dot: "bg-red-500" },
  { key: "leave",    label: "Leave",    dot: "bg-indigo-500" },
  { key: "holiday",  label: "Holiday",  dot: "bg-violet-500" },
  { key: "rest_day", label: "Rest day", dot: "bg-slate-400" },
];

const DAY_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// ── types ─────────────────────────────────────────────────────────────────────

type EmployeeRow = {
  id: number;
  employee_no: string;
  full_name: string;
  days: Map<string, DailyTimeRecord>;
  totals: { present: number; late: number; absent: number; leave: number; ot: number };
};

type DrawerState = { record: DailyTimeRecord; empName: string } | null;

// ── component ─────────────────────────────────────────────────────────────────

export default function DtrMatrixPage() {
  const qc = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canViewAny = me?.user.permissions.includes("attendance.view.any") ?? false;
  const canManage  = me?.user.permissions.includes("attendance.manage") ?? false;

  // Month / dept filters
  const [year,  setYear]  = useState(TODAY.getFullYear());
  const [month, setMonth] = useState(TODAY.getMonth());
  const [deptId, setDeptId] = useState<number | "">("");
  const [search, setSearch] = useState("");

  const { data: departments = [] } = useQuery({
    queryKey: ["lookup-departments"],
    queryFn: () => getLookup("departments"),
    enabled: canViewAny,
    staleTime: 5 * 60_000,
  });

  const range = useMemo(() => monthRange(year, month), [year, month]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Column headers: [{day: 1, weekday: 0} ...]
  const columns = useMemo(() =>
    Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      dow: new Date(year, month, i + 1).getDay(),
    })),
    [year, month, daysInMonth],
  );

  // Fetch DTR records
  const qKey = ["dtr-matrix", year, month, deptId];
  const { data: records = [], isFetching } = useQuery({
    queryKey: qKey,
    queryFn: () =>
      dtrApi.list({
        from: range.from,
        to: range.to,
        department_id: deptId === "" ? undefined : deptId,
      }),
    enabled: canViewAny,
    staleTime: 60_000,
  });

  // Group into per-employee rows
  const rows: EmployeeRow[] = useMemo(() => {
    const map = new Map<number, EmployeeRow>();
    for (const r of records) {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, {
          id: r.employee_id,
          employee_no: r.employee?.employee_no ?? String(r.employee_id),
          full_name: r.employee?.full_name ?? `Employee #${r.employee_id}`,
          days: new Map(),
          totals: { present: 0, late: 0, absent: 0, leave: 0, ot: 0 },
        });
      }
      const row = map.get(r.employee_id)!;
      row.days.set(r.work_date, r);
      const s = r.day_status;
      if (s === "present") row.totals.present++;
      else if (s === "late") { row.totals.late++; row.totals.present++; }
      else if (s === "absent") row.totals.absent++;
      else if (s === "leave") row.totals.leave++;
      row.totals.ot += r.overtime_minutes ?? 0;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    );
  }, [records]);

  // Search filter (client-side, instant)
  const visible = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        r.employee_no.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Per-employee compute panel state
  const [showCp, setShowCp] = useState(false);
  const [cpEmpId, setCpEmpId] = useState<number | "">("");
  const [cpFrom, setCpFrom] = useState("");
  const [cpTo, setCpTo] = useState("");
  const [cpDone, setCpDone] = useState(false);

  const { data: empList } = useQuery({
    queryKey: ["employees-all-lookup"],
    queryFn: () => listEmployees({ perPage: 200 }),
    enabled: canManage,
    staleTime: 5 * 60_000,
  });

  const computeOne = useMutation({
    mutationFn: () =>
      dtrApi.compute({ employee_id: Number(cpEmpId), from: cpFrom, to: cpTo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qKey });
      setCpDone(true);
      setTimeout(() => setCpDone(false), 3000);
    },
  });

  const openComputePanel = () => {
    setCpEmpId("");
    setCpFrom(range.from);
    setCpTo(range.to);
    setCpDone(false);
    setShowCp(true);
  };

  // Compute mutation — recomputes the selected month for all employees in the view
  const compute = useMutation({
    mutationFn: async () => {
      const ids = visible.map((r) => r.id);
      for (const id of ids) {
        await dtrApi.compute({ employee_id: id, from: range.from, to: range.to });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
  });

  // Month nav helpers
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };
  const thisMonth = () => { setYear(TODAY.getFullYear()); setMonth(TODAY.getMonth()); };

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const [drawer, setDrawer] = useState<DrawerState>(null);

  // Summary totals across all visible rows
  const grand = useMemo(() =>
    visible.reduce(
      (acc, r) => ({
        present: acc.present + r.totals.present,
        late:    acc.late    + r.totals.late,
        absent:  acc.absent  + r.totals.absent,
        leave:   acc.leave   + r.totals.leave,
      }),
      { present: 0, late: 0, absent: 0, leave: 0 },
    ),
    [visible],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Matrix"
        description="Monthly overview — one row per employee, color-coded by attendance status."
      />

      {/* ── toolbar ── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {/* Month nav */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={prevMonth}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >←</button>
          <button
            onClick={thisMonth}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 min-w-[160px] text-center"
          >
            {monthLabel}
          </button>
          <button
            onClick={nextMonth}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
          >→</button>
        </div>

        {/* Department */}
        {canViewAny && departments.length > 0 && (
          <select
            className={inputCls + " min-w-[180px]"}
            value={deptId}
            onChange={(e) => setDeptId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search employee…"
          className={inputCls + " min-w-[200px]"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="ml-auto flex items-center gap-3">
          {isFetching && (
            <span className="text-xs text-slate-400">Loading…</span>
          )}
          {canManage && (
            <div className="flex gap-2">
              <button
                onClick={openComputePanel}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                title="Compute DTR for a single employee over a custom date range"
              >
                Per-employee
              </button>
              <button
                onClick={() => compute.mutate()}
                disabled={compute.isPending || visible.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
                title="Recompute DTR for all employees in the current view"
              >
                {compute.isPending ? "Computing…" : "Compute all"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── per-employee compute panel ── */}
      {showCp && (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Compute DTR for employee</h3>
            <button
              onClick={() => setShowCp(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-600">Employee</label>
              <select
                className={inputCls}
                value={cpEmpId}
                onChange={(e) => setCpEmpId(e.target.value === "" ? "" : Number(e.target.value))}
              >
                <option value="">Select employee…</option>
                {(empList?.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_no} — {e.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">From</label>
              <input type="date" className={inputCls} value={cpFrom} onChange={(e) => setCpFrom(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">To</label>
              <input type="date" className={inputCls} value={cpTo} onChange={(e) => setCpTo(e.target.value)} />
            </div>
            <button
              onClick={() => { setCpDone(false); computeOne.mutate(); }}
              disabled={computeOne.isPending || !cpEmpId || !cpFrom || !cpTo}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50"
            >
              {computeOne.isPending ? "Computing…" : "Compute"}
            </button>
            {cpDone && (
              <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                ✓ Done — matrix refreshed
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── summary cards ── */}
      {visible.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Present / Late", value: grand.present, dot: "bg-emerald-500" },
            { label: "Late",           value: grand.late,    dot: "bg-amber-500" },
            { label: "Absent",         value: grand.absent,  dot: "bg-red-500" },
            { label: "On leave",       value: grand.leave,   dot: "bg-indigo-500" },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                <p className="text-xs font-medium text-slate-500">{c.label}</p>
              </div>
              <p className="mt-1.5 text-2xl font-semibold text-slate-900">{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── matrix ── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
        {visible.length === 0 && !isFetching && (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-slate-700">No records found</p>
            <p className="mt-1 text-sm text-slate-400">
              {canManage ? 'Press "Compute all" to generate DTR for this month.' : "No attendance data for this month."}
            </p>
          </div>
        )}

        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              {/* Column group — fixed employee col + day cols + totals */}
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200 px-3 py-2.5 text-left text-xs font-semibold text-slate-600 min-w-[200px]">
                    Employee
                  </th>
                  {columns.map(({ day, dow }) => (
                    <th
                      key={day}
                      className={`px-0 py-2.5 text-center font-semibold min-w-[36px] ${
                        dow === 0 || dow === 6 ? "text-slate-400 bg-slate-50/80" : "text-slate-600"
                      }`}
                    >
                      <div>{day}</div>
                      <div className="text-[10px] font-normal text-slate-400">{DAY_ABBR[dow]}</div>
                    </th>
                  ))}
                  <th className="sticky right-0 z-10 bg-slate-50 border-l border-slate-200 px-3 py-2.5 text-center text-xs font-semibold text-slate-600 min-w-[110px]">
                    P / L / A
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition">
                    {/* Employee name */}
                    <td className="sticky left-0 z-10 bg-white border-r border-slate-100 px-3 py-2 hover:bg-slate-50 transition">
                      <div className="font-medium text-slate-800 truncate max-w-[180px]">{row.full_name}</div>
                      <div className="text-[10px] text-slate-400">{row.employee_no}</div>
                    </td>

                    {/* Day cells */}
                    {columns.map(({ day, dow }) => {
                      const key = ymd(year, month, day);
                      const rec = row.days.get(key);
                      const status: DayStatus = rec?.day_status ?? "no_record";
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <td
                          key={day}
                          className={`p-0.5 text-center ${isWeekend ? "bg-slate-50/60" : ""}`}
                        >
                          {rec ? (
                            <button
                              onClick={() => setDrawer({ record: rec, empName: row.full_name })}
                              className={`w-full rounded px-1 py-1.5 font-semibold ring-1 transition hover:opacity-80 ${STATUS_COLOR[status]}`}
                              title={`${row.full_name} — ${key}`}
                            >
                              {STATUS_LABEL[status]}
                            </button>
                          ) : (
                            <span className="block px-1 py-1.5 text-slate-200">·</span>
                          )}
                        </td>
                      );
                    })}

                    {/* Totals */}
                    <td className="sticky right-0 z-10 bg-white border-l border-slate-100 px-3 py-2 text-center font-mono font-semibold">
                      <span className="text-emerald-700">{row.totals.present}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className="text-amber-600">{row.totals.late}</span>
                      <span className="text-slate-300 mx-1">/</span>
                      <span className="text-red-600">{row.totals.absent}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── legend ── */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {LEGEND.map((l) => (
          <div key={l.key} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`h-2.5 w-2.5 rounded-full ${l.dot}`} />
            {l.label}
          </div>
        ))}
        <span className="text-xs text-slate-400 ml-2">
          Totals column: <strong className="text-emerald-700">P</strong>resent / <strong className="text-amber-600">L</strong>ate / <strong className="text-red-600">A</strong>bsent
        </span>
      </div>

      {/* ── detail drawer ── */}
      {drawer && (
        <DetailDrawer
          record={drawer.record}
          empName={drawer.empName}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

// ── detail drawer ─────────────────────────────────────────────────────────────

function DetailDrawer({
  record: r,
  empName,
  onClose,
}: {
  record: DailyTimeRecord;
  empName: string;
  onClose: () => void;
}) {
  const status: DayStatus = r.day_status ?? "no_record";
  const hm = (v: string | null) => (v ? v.slice(11, 16) : "—");

  const statusLabel: Record<DayStatus, string> = {
    present: "Present", late: "Late", absent: "Absent", leave: "On Leave",
    holiday: "Holiday", rest_day: "Rest Day", no_record: "No Record",
  };
  const statusBg: Record<DayStatus, string> = {
    present: "bg-emerald-500", late: "bg-amber-500", absent: "bg-red-500",
    leave: "bg-indigo-500", holiday: "bg-violet-500", rest_day: "bg-slate-400", no_record: "bg-slate-200",
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
              {r.work_date}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-700">{empName}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${statusBg[status]}`} />
              <h2 className="text-lg font-bold text-slate-900">{statusLabel[status]}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Time in">{hm(r.actual_in)}</Field>
            <Field label="Time out">{hm(r.actual_out)}</Field>
            <Field label="Scheduled">{r.scheduled_in ? `${r.scheduled_in} – ${r.scheduled_out}` : "—"}</Field>
            <Field label="Hours worked">{r.hours_worked ?? "—"}</Field>
          </div>
          <div className="grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
            <Field label="Late">{r.late_minutes ? `${r.late_minutes}m` : "—"}</Field>
            <Field label="Undertime">{r.undertime_minutes ? `${r.undertime_minutes}m` : "—"}</Field>
            <Field label="Overtime">{r.overtime_minutes ? `${r.overtime_minutes}m` : "—"}</Field>
          </div>
          {(r.is_rest_day || r.holiday_type || r.is_on_leave || r.is_adjusted) && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              {r.is_rest_day   && <Pill color="slate">Rest day</Pill>}
              {r.holiday_type  && <Pill color="violet">{r.holiday_type.replace("_", " ")}</Pill>}
              {r.is_on_leave   && <Pill color="indigo">On leave</Pill>}
              {r.is_adjusted   && <Pill color="amber">Adjusted</Pill>}
            </div>
          )}
          {r.remarks && (
            <div className="border-t border-slate-100 pt-4">
              <Field label="Remarks">{r.remarks}</Field>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

function Pill({ color, children }: { color: "slate" | "violet" | "indigo" | "amber"; children: React.ReactNode }) {
  const cls = {
    slate:  "bg-slate-100 text-slate-700",
    violet: "bg-violet-100 text-violet-800",
    indigo: "bg-indigo-100 text-indigo-800",
    amber:  "bg-amber-100 text-amber-800",
  }[color];
  return <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
