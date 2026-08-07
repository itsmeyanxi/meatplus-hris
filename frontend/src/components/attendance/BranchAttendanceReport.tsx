"use client";

import { useMemo, useState } from "react";
import { getAgencyAttendanceData, type AgencyAttendanceData } from "@/lib/agencies";
import { downloadAgencyAttendance } from "@/lib/reports";
import { AppButton, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

const STATUS_CLASS: Record<string, string> = {
  Present: "s-green",
  Absent: "s-red",
  "On Leave": "s-blue",
  "Rest Day": "s-gray",
};
function statusPill(s: string): string {
  const cls = STATUS_CLASS[s] ?? (s.toLowerCase().includes("holiday") ? "s-amber" : "s-gray");
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}

const GRID_STATUS: { re: RegExp; code: string; cls: string }[] = [
  { re: /late/i, code: "L", cls: "bg-amber-100 text-amber-700" },
  { re: /present/i, code: "P", cls: "bg-emerald-100 text-emerald-700" },
  { re: /leave/i, code: "V", cls: "bg-violet-100 text-violet-700" },
  { re: /absent/i, code: "A", cls: "bg-red-100 text-red-700" },
  { re: /holiday/i, code: "H", cls: "bg-sky-100 text-sky-700" },
  { re: /rest/i, code: "R", cls: "bg-slate-100 text-slate-400" },
];
function gridCell(status: string): { code: string; cls: string } {
  return GRID_STATUS.find((g) => g.re.test(status)) ?? { code: "•", cls: "bg-slate-50 text-slate-400" };
}

/** A polished, self-contained printable report → the browser's "Save as PDF" produces the PDF. */
function buildPrintHtml(d: AgencyAttendanceData, scopeLabel: string): string {
  const groups = new Map<string, { no: string; name: string; rows: AgencyAttendanceData["rows"] }>();
  for (const r of d.rows) {
    const key = `${r.employee_no}|${r.name}`;
    if (!groups.has(key)) groups.set(key, { no: r.employee_no, name: r.name, rows: [] });
    groups.get(key)!.rows.push(r);
  }

  const sections = [...groups.values()]
    .map((g) => {
      const present = g.rows.filter((r) => r.shift_start).length;
      const hours = g.rows.reduce((s, r) => s + (r.hours ?? 0), 0);
      const late = g.rows.reduce((s, r) => s + (r.late ?? 0), 0);
      const ot = g.rows.reduce((s, r) => s + (r.ot ?? 0), 0);
      const body = g.rows
        .map(
          (r, i) =>
            `<tr class="${i % 2 ? "alt" : ""}"><td>${esc(r.date)}</td><td>${esc(r.day)}</td><td>${esc(r.shift_start ?? "—")}</td><td>${esc(
              r.shift_end ?? "—",
            )}</td><td class="num">${r.hours ?? "—"}</td><td class="num">${r.late || "—"}</td><td class="num">${r.ot || "—"}</td><td>${statusPill(
              r.status,
            )}</td></tr>`,
        )
        .join("");
      return `<section class="emp">
        <div class="emp-hd">
          <div class="emp-name">${esc(g.name)} <span class="emp-no">${esc(g.no)}</span></div>
          <div class="emp-sub">${present} present · ${hours.toFixed(2)} hrs · ${late} late min · ${ot} OT min · ${g.rows.length} days</div>
        </div>
        <table><thead><tr><th>Date</th><th>Day</th><th>Shift Start</th><th>Shift End</th><th class="num">Hours</th><th class="num">Late</th><th class="num">OT</th><th>Status</th></tr></thead>
        <tbody>${body}</tbody></table>
      </section>`;
    })
    .join("");

  const coverage = d.summary.employees ? Math.round((groups.size / d.summary.employees) * 100) : 0;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.agency.name)} Attendance ${d.from} to ${d.to}</title>
  <style>
    @page{size:A4 landscape;margin:12mm}
    *{font-family:-apple-system,Segoe UI,Arial,sans-serif;box-sizing:border-box}
    body{margin:0;color:#1e293b;font-size:11px}
    .head{background:#1e293b;color:#fff;padding:16px 20px;border-radius:10px;display:flex;justify-content:space-between;align-items:flex-start}
    .brand{font-size:11px;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
    .title{font-size:19px;font-weight:700;margin-top:2px}
    .sub{font-size:12px;opacity:.85;margin-top:3px}
    .head .right{text-align:right;font-size:11px;opacity:.8}
    .cards{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
    .card{border:1px solid #e2e8f0;border-radius:8px;padding:9px 14px;min-width:96px}
    .card b{display:block;font-size:19px;line-height:1.1}
    .card span{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em}
    .emp{margin-top:14px;break-inside:avoid}
    .emp-hd{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #1e293b;padding-bottom:3px;margin-bottom:0}
    .emp-name{font-weight:700;font-size:13px}
    .emp-no{font-weight:400;color:#64748b;font-size:11px;font-family:monospace}
    .emp-sub{font-size:10px;color:#475569}
    table{border-collapse:collapse;width:100%;font-size:10.5px;margin-top:2px}
    thead{display:table-header-group}
    th{background:#334155;color:#fff;text-align:left;padding:5px 8px;font-weight:600}
    td{border-bottom:1px solid #eee;padding:4px 8px}
    tr.alt td{background:#f8fafc}
    td.num,th.num{text-align:right}
    .pill{display:inline-block;padding:1px 7px;border-radius:9px;font-size:9.5px;font-weight:600}
    .s-green{background:#dcfce7;color:#166534}.s-red{background:#fee2e2;color:#991b1b}
    .s-blue{background:#dbeafe;color:#1e40af}.s-amber{background:#fef3c7;color:#92400e}.s-gray{background:#f1f5f9;color:#475569}
    .sign{display:flex;gap:40px;margin-top:34px;break-inside:avoid}
    .sign div{flex:1;text-align:center;font-size:10px;color:#475569}
    .sign .line{border-top:1px solid #94a3b8;margin-bottom:3px;padding-top:4px;font-weight:600;color:#1e293b}
    .foot{margin-top:16px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:9.5px;color:#94a3b8;text-align:center}
    @media print{th,.head,.pill{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="head">
    <div>
      <div class="brand">ALL COMPANY HRIS</div>
      <div class="title">${esc(d.agency.name)} — Attendance Report</div>
      <div class="sub">${esc(scopeLabel)}</div>
    </div>
    <div class="right">Period<br><b>${d.from}</b> to <b>${d.to}</b><br><span style="opacity:.7">Generated ${new Date().toLocaleString()}</span></div>
  </div>
  <div class="cards">
    <div class="card"><b>${d.summary.employees}</b><span>Employees</span></div>
    <div class="card"><b>${groups.size}</b><span>With attendance</span></div>
    <div class="card"><b>${d.summary.present_days}</b><span>Present days</span></div>
    <div class="card"><b>${d.summary.absent_days}</b><span>Absent days</span></div>
    <div class="card"><b>${d.summary.leave_days}</b><span>Leave days</span></div>
    <div class="card"><b>${d.summary.total_hours}</b><span>Total hours</span></div>
    <div class="card"><b>${coverage}%</b><span>Coverage</span></div>
  </div>
  ${sections || '<p style="text-align:center;padding:30px;color:#64748b">No attendance records in this range.</p>'}
  <div class="sign">
    <div><div class="line">Prepared by</div>Name & Signature</div>
    <div><div class="line">Checked by</div>Name & Signature</div>
    <div><div class="line">Approved by</div>Name & Signature</div>
  </div>
  <div class="foot">Confidential — generated by ALL COMPANY HRIS on ${new Date().toLocaleString()}</div>
  <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
  </body></html>`;
}

/**
 * Reusable "Attendance report" card for a single branch (agency or project crew):
 * date range + worker filter → View data (grid/list), Excel and PDF. The report
 * endpoints are branch-based, so this works for any branch id.
 */
export function BranchAttendanceReport({
  branchId,
  branchName,
  termSingular,
  filePrefix,
  workers,
}: {
  branchId: number;
  branchName?: string;
  termSingular: string;
  filePrefix: string;
  workers: { id: number; name: string; employee_no: string }[];
}) {
  const [dateFrom, setDateFrom] = useState(firstOfMonth());
  const [dateTo, setDateTo] = useState(today());
  const [workerId, setWorkerId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<AgencyAttendanceData | null>(null);
  const [reportView, setReportView] = useState<"grid" | "list">("grid");

  const grid = useMemo(() => {
    if (!report) return null;
    const workersMap = new Map<string, { no: string; name: string }>();
    const dateSet = new Set<string>();
    const cells = new Map<string, string>();
    for (const r of report.rows) {
      workersMap.set(r.employee_no, { no: r.employee_no, name: r.name });
      dateSet.add(r.date);
      cells.set(`${r.employee_no}|${r.date}`, r.status);
    }
    return {
      workers: [...workersMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
      dates: [...dateSet].sort(),
      cells,
    };
  }, [report]);

  const viewData = async () => {
    setErr(null);
    setViewing(true);
    try {
      setReport(await getAgencyAttendanceData({ branchId, dateFrom, dateTo, employeeId: workerId || undefined }));
    } catch {
      setErr("Could not load the data. Check the dates and try again.");
    } finally {
      setViewing(false);
    }
  };

  const generate = async () => {
    setErr(null);
    setBusy(true);
    try {
      const worker = workerId ? workers.find((e) => e.id === workerId) : undefined;
      await downloadAgencyAttendance({
        branchId,
        dateFrom,
        dateTo,
        agencyName: branchName,
        employeeId: workerId || undefined,
        employeeName: worker?.name,
        filePrefix,
      });
    } catch {
      setErr("Could not generate the report. Check the dates and try again.");
    } finally {
      setBusy(false);
    }
  };

  const printPdf = async () => {
    setErr(null);
    setPdfBusy(true);
    try {
      const d = await getAgencyAttendanceData({ branchId, dateFrom, dateTo, employeeId: workerId || undefined });
      const worker = workerId ? workers.find((e) => e.id === workerId) : undefined;
      const scope = worker ? `Worker: ${worker.name} (${worker.employee_no})` : `All workers`;
      const win = window.open("", "_blank");
      if (!win) {
        setErr("Allow pop-ups for this site to generate the PDF.");
        return;
      }
      win.document.write(buildPrintHtml(d, scope));
      win.document.close();
    } catch {
      setErr("Could not generate the PDF. Check the dates and try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Attendance report</h2>
      <p className="mt-1 text-sm text-slate-500">
        Pull this {termSingular}&rsquo;s time logs for a date range — Excel with Summary, Daily Shifts (shift start/end + hours) and raw Punch Records.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls}>From</label>
          <input type="date" className={inputCls} value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>To</label>
          <input type="date" className={inputCls} value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Worker</label>
          <select className={inputCls} value={workerId} onChange={(e) => setWorkerId(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All workers (whole {termSingular})</option>
            {workers.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.employee_no})</option>
            ))}
          </select>
        </div>
        <AppButton onClick={viewData} disabled={viewing || !dateFrom || !dateTo}>
          {viewing ? "Loading…" : "View data"}
        </AppButton>
        <AppButton variant="secondary" onClick={generate} disabled={busy || !dateFrom || !dateTo}>
          {busy ? "Generating…" : "Excel"}
        </AppButton>
        <AppButton variant="secondary" onClick={printPdf} disabled={pdfBusy || !dateFrom || !dateTo}>
          {pdfBusy ? "Preparing…" : "PDF"}
        </AppButton>
      </div>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

      {report && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              <strong>{report.rows.length}</strong> day-records · {report.summary.present_days} present · {report.summary.absent_days} absent · {report.summary.leave_days} leave · {report.summary.total_hours} hrs
              <span className="text-slate-400"> · {report.from} to {report.to}</span>
            </p>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold">
                <button type="button" onClick={() => setReportView("grid")} className={`rounded-md px-2.5 py-1 transition ${reportView === "grid" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>Grid</button>
                <button type="button" onClick={() => setReportView("list")} className={`rounded-md px-2.5 py-1 transition ${reportView === "list" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>List</button>
              </div>
              <button onClick={() => setReport(null)} className="text-xs text-slate-400 hover:text-slate-700">Hide</button>
            </div>
          </div>

          {reportView === "grid" && grid && (
            <div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="sticky left-0 z-10 bg-slate-50 px-2 py-2 text-left font-semibold text-slate-500">Worker</th>
                      {grid.dates.map((d) => (
                        <th key={d} className="px-1 py-2 text-center font-medium text-slate-400" title={d}>{d.slice(8)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.workers.map((w) => (
                      <tr key={w.no} className="border-t border-slate-100">
                        <td className="sticky left-0 z-10 bg-white px-2 py-1">
                          <div className="max-w-[150px] truncate text-[13px] font-medium text-slate-800">{w.name}</div>
                          <div className="font-mono text-[10px] text-slate-400">{w.no}</div>
                        </td>
                        {grid.dates.map((d) => {
                          const st = grid.cells.get(`${w.no}|${d}`);
                          if (!st) return <td key={d} className="px-1 py-1 text-center text-slate-200">·</td>;
                          const c = gridCell(st);
                          return (
                            <td key={d} className="px-1 py-1 text-center">
                              <span title={`${d} · ${st}`} className={`inline-block w-5 rounded py-0.5 text-[10px] font-bold ${c.cls}`}>{c.code}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span><b className="text-emerald-700">P</b> Present</span>
                <span><b className="text-amber-700">L</b> Late</span>
                <span><b className="text-violet-700">V</b> Leave</span>
                <span><b className="text-red-700">A</b> Absent</span>
                <span><b className="text-sky-700">H</b> Holiday</span>
                <span><b className="text-slate-400">R</b> Rest</span>
              </div>
            </div>
          )}

          {reportView === "list" && (
            <TableShell>
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Employee No</th>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Shift Start</th>
                    <th className="px-3 py-2">Shift End</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Late</th>
                    <th className="px-3 py-2">OT</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.rows.length === 0 && (
                    <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-500">No attendance records in this range.</td></tr>
                  )}
                  {report.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-700">{r.employee_no}</td>
                      <td className="px-3 py-2 text-slate-900">{r.name}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{r.date}</td>
                      <td className="px-3 py-2 text-slate-500">{r.day}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{r.shift_start ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{r.shift_end ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-700">{r.hours ?? "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-500">{r.late || "—"}</td>
                      <td className="px-3 py-2 tabular-nums text-slate-500">{r.ot || "—"}</td>
                      <td className="px-3 py-2 text-slate-600">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          )}
        </div>
      )}
    </div>
  );
}
