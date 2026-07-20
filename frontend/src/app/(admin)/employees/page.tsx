"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/auth";
import {
  listEmployees,
  getLookup,
  importEmployees,
  employeeImportTemplateUrl,
  employeeExportUrl,
  type ImportResult,
  type EmployeeListItem,
} from "@/lib/employees";
import { invitationsApi } from "@/lib/invitations";
import { getAdminStats } from "@/lib/dashboard";
import { AppButton, AppInput, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

// ── Access status badge ───────────────────────────────────────────────────────

function AccessBadge({ status }: { status: EmployeeListItem["login_status"] }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Active
      </span>
    );
  }
  if (status === "invited") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        Invited
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      No access
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [empNo, setEmpNo] = useState("");
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [branchId, setBranchId] = useState<number | "">("");
  const [isConfidential, setIsConfidential] = useState<boolean | "">("");
  const [debEmpNo, setDebEmpNo] = useState("");
  const [debName, setDebName] = useState("");
  const [page, setPage] = useState(1);
  const [previewEmployee, setPreviewEmployee] = useState<EmployeeListItem | null>(null);

  // Bulk-select state
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkResult, setBulkResult] = useState<{ sent: number; skipped: number; errors: string[] } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebEmpNo(empNo);
      setDebName(name);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [empNo, name]);

  // Clear selection when page / filters change
  useEffect(() => { setSelected(new Set()); }, [debEmpNo, debName, departmentId, branchId, isConfidential, page]);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canManageUsers = me?.user.permissions?.includes("user.manage") ?? false;

  const { data: adminStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: getAdminStats,
    enabled: !!me,
    staleTime: 2 * 60_000,
  });

  // Company list — used only by the Import modal's "import into" selector (a
  // deliberate admin write target), not for filtering the list.
  const { data: companies } = useQuery({
    queryKey: ["lookup-companies"],
    queryFn: () => getLookup("companies"),
    enabled: !!me,
    staleTime: 5 * 60_000,
  });

  const { data: departments } = useQuery({
    queryKey: ["lookup-departments"],
    queryFn: () => getLookup("departments"),
    enabled: !!me,
    staleTime: 5 * 60_000,
  });

  const { data: branches } = useQuery({
    queryKey: ["lookup-branches"],
    queryFn: () => getLookup("branches"),
    enabled: !!me,
    staleTime: 5 * 60_000,
  });

  const canConfi = me?.user.permissions.includes("employee.view.sensitive") ?? false;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["employees", { empNo: debEmpNo, name: debName, departmentId, branchId, isConfidential, page }],
    queryFn: () => listEmployees({ employeeNo: debEmpNo, name: debName, departmentId, branchId, isConfidential, page, perPage: 50 }),
    enabled: !!me,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });

  const rows = data?.data ?? [];

  // Employees on this page that can still be invited (no active account yet)
  const invitableIds = rows.filter((e) => e.login_status !== "active").map((e) => e.id);
  const allInvitableSelected = invitableIds.length > 0 && invitableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allInvitableSelected) {
      setSelected((s) => { const n = new Set(s); invitableIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((s) => new Set([...s, ...invitableIds]));
    }
  };

  const toggleOne = (id: number) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const bulkInvite = useMutation({
    mutationFn: () => invitationsApi.bulkSend(Array.from(selected)),
    onSuccess: (res) => {
      setBulkResult(res);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });

  const onExport = () => {
    const a = document.createElement("a");
    a.href = employeeExportUrl({ employeeNo: debEmpNo, name: debName, departmentId });
    a.download = "employees.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const hasFilters = empNo !== "" || name !== "" || departmentId !== "" || branchId !== "" || isConfidential !== "";
  const advancedCount = [departmentId, branchId].filter((v) => v !== "").length + (isConfidential !== "" ? 1 : 0);
  const clearFilters = () => {
    setEmpNo(""); setName(""); setDepartmentId(""); setBranchId(""); setIsConfidential(""); setPage(1);
  };

  // Keep filters in the URL so refresh/back and shared links preserve them.
  const didInitFromUrl = useRef(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const num = (v: string | null) => { const n = Number(v); return v && Number.isFinite(n) && n > 0 ? n : null; };
    const dept = num(p.get("dept")); if (dept) setDepartmentId(dept);
    const branch = num(p.get("branch")); if (branch) setBranchId(branch);
    if (p.get("confi") === "1" || p.get("confi") === "0") setIsConfidential(p.get("confi") === "1");
    if (p.get("q")) { setName(p.get("q")!); setDebName(p.get("q")!); }
    const pg = num(p.get("page")); if (pg) setPage(pg);
    didInitFromUrl.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!didInitFromUrl.current) return;
    const p = new URLSearchParams();
    if (departmentId !== "") p.set("dept", String(departmentId));
    if (branchId !== "") p.set("branch", String(branchId));
    if (isConfidential !== "") p.set("confi", isConfidential ? "1" : "0");
    if (debName) p.set("q", debName);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [departmentId, branchId, isConfidential, debName, page]);

  const COLS = 13; // checkbox + Company + 10 data cols + access

  return (
    <div className="relative space-y-4">
      <PageHeader
        title="Employees"
        actions={
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import
            </button>
            <button type="button" onClick={onExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Export
            </button>
            <Link href="/employee-registration"
              className="inline-flex items-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800">
              + New employee
            </Link>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EmpStat
          label={hasFilters ? "Matching filter" : "Total employees"}
          value={data?.meta.total ?? adminStats?.headcount ?? null}
          color="slate"
        />
        <EmpStat
          label="No portal access"
          value={adminStats?.no_access ?? null}
          color="amber"
        />
        <EmpStat
          label="Present today"
          value={adminStats?.today_present ?? null}
          color="emerald"
        />
        <EmpStat
          label="Pending leaves"
          value={adminStats?.pending_leaves ?? null}
          color="sky"
        />
      </div>

      {/* Search + filter bar */}
      <div className="space-y-2">
        <div className="flex gap-2">
          {/* Name search — primary */}
          <div className="relative flex-1">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="search"
              placeholder="Search by name or employee ID…"
              value={name || empNo}
              onChange={(e) => {
                const v = e.target.value;
                // Numeric-looking input → employee ID, else name
                if (/^\d/.test(v)) { setEmpNo(v); setName(""); }
                else { setName(v); setEmpNo(""); }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
            />
          </div>

          {/* Filter toggle button */}
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition ${
              showFilters || advancedCount > 0
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 8h10M11 12h2" />
            </svg>
            Filters
            {advancedCount > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-900">
                {advancedCount}
              </span>
            )}
          </button>

          {/* Clear all — only when anything is active */}
          {hasFilters && (
            <button type="button" onClick={clearFilters}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-900">
              Clear
            </button>
          )}
        </div>

        {/* Collapsible advanced filters */}
        {showFilters && (
          <div className="grid gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Department</label>
              <select className={inputCls} value={departmentId}
                onChange={(e) => { setDepartmentId(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }}>
                <option value="">All departments</option>
                {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <select className={inputCls} value={branchId}
                onChange={(e) => { setBranchId(e.target.value === "" ? "" : Number(e.target.value)); setPage(1); }}>
                <option value="">All locations</option>
                {branches?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            {canConfi && (
              <div>
                <label className={labelCls}>Payroll group</label>
                <select className={inputCls} value={isConfidential === "" ? "" : isConfidential ? "1" : "0"}
                  onChange={(e) => { setIsConfidential(e.target.value === "" ? "" : e.target.value === "1"); setPage(1); }}>
                  <option value="">All</option>
                  <option value="1">Confidential</option>
                  <option value="0">Non-confidential</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {advancedCount > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {departmentId !== "" && (
              <FilterChip
                label={departments?.find((d) => d.id === departmentId)?.name ?? "Department"}
                onRemove={() => { setDepartmentId(""); setPage(1); }}
              />
            )}
            {branchId !== "" && (
              <FilterChip
                label={branches?.find((b) => b.id === branchId)?.name ?? "Location"}
                onRemove={() => { setBranchId(""); setPage(1); }}
              />
            )}
            {isConfidential !== "" && (
              <FilterChip
                label={isConfidential ? "Confidential" : "Non-confidential"}
                onRemove={() => { setIsConfidential(""); setPage(1); }}
              />
            )}
          </div>
        )}
      </div>

      <TableShell>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              {canManageUsers && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allInvitableSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    title="Select all invitable employees on this page"
                  />
                </th>
              )}
              <Th>Employee #</Th>
              <Th>Company</Th>
              <Th>Last Name</Th>
              <Th>First Name</Th>
              <Th>Department</Th>
              <Th>Location</Th>
              <Th>Email</Th>
              <Th>Position</Th>
              <Th>Type</Th>
              <Th>Hired</Th>
              <Th>Status</Th>
              <Th>Access</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {Array.from({ length: COLS }).map((_, j) => (
                  <Td key={j}><div className="h-4 w-20 rounded bg-slate-200" /></Td>
                ))}
              </tr>
            ))}
            {isError && (
              <tr>
                <td colSpan={COLS} className="px-4 py-6 text-center text-red-600">
                  Could not load employees. Refresh the page.
                </td>
              </tr>
            )}
            {!isLoading && !isError && rows.length === 0 && (
              <tr>
                <td colSpan={COLS} className="px-4 py-6 text-center text-slate-500">
                  No employees yet.{" "}
                  <Link href="/employee-registration" className="text-slate-900 underline">Add the first one</Link>.
                </td>
              </tr>
            )}
            {rows.map((emp) => {
              const isSelected = selected.has(emp.id);
              const canSelect = emp.login_status !== "active";
              return (
                <tr
                  key={emp.id}
                  onClick={() => setPreviewEmployee(emp)}
                  tabIndex={0}
                  aria-label={`View details for ${emp.full_name}`}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreviewEmployee(emp); } }}
                  className={`cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${isSelected ? "bg-slate-50" : "hover:bg-slate-50"}`}
                >
                  {canManageUsers && (
                    <Td>
                      <span onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canSelect}
                          onChange={() => toggleOne(emp.id)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 disabled:opacity-30"
                        />
                      </span>
                    </Td>
                  )}
                  <Td><span className="font-mono text-slate-900 font-medium">{emp.employee_no}</span></Td>
                  <Td>{emp.company?.code ?? emp.company?.name ?? "—"}</Td>
                  <Td><span className="font-medium text-slate-900">{emp.last_name ?? "—"}</span></Td>
                  <Td><span className="font-medium text-slate-900">{emp.first_name ?? "—"}</span></Td>
                  <Td>{emp.department?.name ?? "—"}</Td>
                  <Td>{emp.branch?.name ?? "—"}</Td>
                  <Td>{emp.email_company ?? emp.email_personal ?? "—"}</Td>
                  <Td>{emp.position?.title ?? "—"}</Td>
                  <Td>{emp.employment_type?.name ?? "—"}</Td>
                  <Td>{emp.date_hired ?? "—"}</Td>
                  <Td>
                    <StatusBadge active={emp.is_active}>{emp.is_active ? "Active" : "Inactive"}</StatusBadge>
                  </Td>
                  <Td><AccessBadge status={emp.login_status} /></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableShell>

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Page {data.meta.current_page} of {data.meta.last_page}</span>
          <div className="flex gap-2">
            <AppButton variant="secondary" disabled={!data.links.prev} onClick={() => setPage((p) => p - 1)}>Previous</AppButton>
            <AppButton variant="secondary" disabled={!data.links.next} onClick={() => setPage((p) => p + 1)}>Next</AppButton>
          </div>
        </div>
      )}

      {/* Bulk invite action bar */}
      {canManageUsers && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-xl">
            <span className="text-sm font-medium text-slate-700">
              {selected.size} employee{selected.size !== 1 ? "s" : ""} selected
            </span>
            <button
              onClick={() => { setBulkResult(null); bulkInvite.mutate(); }}
              disabled={bulkInvite.isPending}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {bulkInvite.isPending ? "Sending…" : "Send invitations"}
            </button>
            <button onClick={() => setSelected(new Set())} className="text-sm text-slate-400 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bulk invite result toast */}
      {bulkResult && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 shadow-xl">
            <span className="text-sm font-medium text-emerald-800">
              Sent {bulkResult.sent} invitation{bulkResult.sent !== 1 ? "s" : ""}
              {bulkResult.skipped > 0 ? `, ${bulkResult.skipped} skipped` : ""}
              {bulkResult.errors.length > 0 ? `, ${bulkResult.errors.length} failed` : ""}
            </span>
            <button onClick={() => setBulkResult(null)} className="text-sm text-emerald-600 hover:text-emerald-800">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal companies={companies ?? []} onClose={() => setShowImport(false)} onDone={() => qc.invalidateQueries({ queryKey: ["employees"] })} />
      )}

      {/* Record preview drawer */}
      {previewEmployee && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity" onClick={() => setPreviewEmployee(null)} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header — avatar + name + company + badges for instant identification */}
            <div className="flex items-start gap-4 border-b border-slate-100 p-6">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-xl font-semibold text-white shadow-sm">
                {empInitials(previewEmployee.first_name, previewEmployee.last_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-xl font-bold text-slate-900">{previewEmployee.full_name}</h2>
                  {previewEmployee.company && (
                    <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600" title={previewEmployee.company.name}>
                      {previewEmployee.company.code}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-sm text-slate-500">#{previewEmployee.employee_no}</p>
                {previewEmployee.position?.title && (
                  <p className="mt-1 text-sm text-slate-600">{previewEmployee.position.title}</p>
                )}
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <StatusBadge active={previewEmployee.is_active}>{previewEmployee.is_active ? "Active" : "Inactive"}</StatusBadge>
                  <AccessBadge status={previewEmployee.login_status} />
                </div>
              </div>
              <button onClick={() => setPreviewEmployee(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body — grouped, scannable sections */}
            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <PreviewSection title="Employment">
                <PreviewField label="Department" value={previewEmployee.department?.name} strong />
                <PreviewField label="Position" value={previewEmployee.position?.title} />
                <PreviewField label="Employment Type" value={previewEmployee.employment_type?.name} />
                <PreviewField label="Location" value={previewEmployee.branch?.name} />
                <PreviewField label="Company" value={previewEmployee.company?.name} />
                <PreviewField label="Date Hired" value={previewEmployee.date_hired} />
              </PreviewSection>

              <PreviewSection title="Personal">
                <PreviewField label="Gender" value={previewEmployee.gender} capitalize />
                <PreviewField label="Civil Status" value={previewEmployee.civil_status} capitalize />
              </PreviewSection>

              <PreviewSection title="Contact">
                <PreviewField label="Company Email" value={previewEmployee.email_company} full mono />
                <PreviewField label="Personal Email" value={previewEmployee.email_personal} full mono />
              </PreviewSection>
            </div>

            {/* Footer actions */}
            <div className="flex gap-2 border-t border-slate-100 p-4">
              <Link href={`/employees/${previewEmployee.id}`}
                className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-center text-sm font-medium text-white shadow-sm transition hover:bg-slate-800">
                View Full Profile
              </Link>
              <AppButton variant="secondary" onClick={() => router.push(`/employees/${previewEmployee.id}/edit`)}
                className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </AppButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const EMP_STAT_COLORS = {
  slate:   { card: "bg-slate-50 border-slate-200",     num: "text-slate-900",   label: "text-slate-500" },
  amber:   { card: "bg-amber-50 border-amber-200",     num: "text-amber-800",   label: "text-amber-600" },
  emerald: { card: "bg-emerald-50 border-emerald-200", num: "text-emerald-800", label: "text-emerald-600" },
  sky:     { card: "bg-sky-50 border-sky-200",         num: "text-sky-800",     label: "text-sky-600" },
} as const;

function EmpStat({
  label, value, color,
}: {
  label: string; value: number | null; color: keyof typeof EMP_STAT_COLORS;
}) {
  const c = EMP_STAT_COLORS[color];
  return (
    <div className={`flex flex-col rounded-xl border p-4 ${c.card}`}>
      <span className={`text-xs font-medium uppercase tracking-wide ${c.label}`}>{label}</span>
      <span className={`mt-1.5 text-3xl font-bold tabular-nums ${c.num}`}>
        {value === null ? (
          <span className="inline-block h-8 w-14 animate-pulse rounded bg-current opacity-20" />
        ) : (
          value
        )}
      </span>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-slate-700">
      {label}
      <button type="button" onClick={onRemove}
        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-slate-200 transition">
        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

function empInitials(first?: string | null, last?: string | null): string {
  const i = `${(first ?? "").trim()[0] ?? ""}${(last ?? "").trim()[0] ?? ""}`.toUpperCase();
  return i || "?";
}

function PreviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5">{children}</dl>
    </div>
  );
}

function PreviewField({
  label, value, strong, full, mono, capitalize,
}: {
  label: string;
  value?: string | null;
  strong?: boolean;
  full?: boolean;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className={full ? "col-span-2 min-w-0" : "min-w-0"}>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd
        className={`mt-0.5 truncate text-sm ${strong ? "font-semibold text-slate-900" : "font-medium text-slate-700"} ${mono ? "font-mono text-xs" : ""} ${capitalize ? "capitalize" : ""}`}
        title={value ?? undefined}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function ImportModal({ companies, onClose, onDone }: { companies: { id: number; name?: string }[]; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [companyId, setCompanyId] = useState<number | "">("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = useMutation({
    mutationFn: () => importEmployees(file!, companyId),
    onSuccess: (res) => {
      setResult(res);
      if (res.created > 0 || res.updated > 0) onDone();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Import employees</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload a CSV or Excel (.xlsx / .xls) file. Columns: Employee ID, Last Name, Middle Name, First Name, Gender, Civil
          Status, Department, Location, Email, Position, Employment Type, Date Hired, Birth Date. Missing
          departments, locations, positions and employment types are created automatically. Existing employee IDs are
          updated (blank cells never overwrite existing data); new IDs are created.
        </p>
        <a href={employeeImportTemplateUrl}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2z" />
          </svg>
          Download template
        </a>
        {!result && (
          <div className="mt-4 space-y-3">
            {companies.length > 1 && (
              <div>
                <label className={labelCls}>Import into company</label>
                <select className={inputCls} value={companyId} onChange={(e) => setCompanyId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">Current company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name ?? `Company ${c.id}`}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-400">Pick the company these employees belong to — no need to switch your active company.</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800" />
            {file && <p className="mt-2 text-xs text-slate-500">Selected: {file.name}</p>}
          </div>
        )}
        {result && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <Stat label="Created" value={result.created} tone="emerald" />
              <Stat label="Updated" value={result.updated} tone="sky" />
              <Stat label="Skipped" value={result.skipped} tone="amber" />
              <Stat label="Duplicates" value={result.warnings?.length ?? 0} tone="amber" />
              <Stat label="Errors" value={result.errors.length} tone="red" />
            </div>
            {result.warnings && result.warnings.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="mb-1 font-semibold">Possible duplicates — imported, please verify:</p>
                {result.warnings.map((w, i) => <div key={i}>Row {w.row}: {w.message}</div>)}
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-red-700">
                {result.errors.map((e, i) => <div key={i}>Row {e.row}: {e.message}</div>)}
              </div>
            )}
            <p className="text-xs text-slate-500">Any columns left blank can be completed later in each profile (or in a follow-up import).</p>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {result ? (
            <AppButton onClick={onClose}>Done</AppButton>
          ) : (
            <>
              <AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
              <AppButton onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
                {upload.isPending ? "Importing…" : "Import"}
              </AppButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "sky" | "amber" | "red" }) {
  const tones = { emerald: "bg-emerald-50 text-emerald-700", sky: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" };
  return (
    <div className={`flex-1 rounded-lg px-3 py-2 text-center ${tones[tone]}`}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}
