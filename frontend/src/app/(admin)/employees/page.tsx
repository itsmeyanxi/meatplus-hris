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
} from "@/lib/employees";
import { AppButton, AppInput, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

export default function EmployeesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [empNo, setEmpNo] = useState("");
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [companyId, setCompanyId] = useState<number | "">("");
  const [debEmpNo, setDebEmpNo] = useState("");
  const [debName, setDebName] = useState("");
  const [page, setPage] = useState(1);
  const [previewEmployee, setPreviewEmployee] = useState<any | null>(null);

  // Debounce the free-text filters; the company dropdown applies immediately.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebEmpNo(empNo);
      setDebName(name);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [empNo, name]);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["employees", { empNo: debEmpNo, name: debName, departmentId, companyId, page }],
    queryFn: () => listEmployees({ employeeNo: debEmpNo, name: debName, departmentId, companyId, page, perPage: 25 }),
    enabled: !!me,
    staleTime: 30_000,
  });

  const onExport = () => {
    const a = document.createElement("a");
    a.href = employeeExportUrl({ employeeNo: debEmpNo, name: debName, departmentId, companyId });
    a.download = "employees.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const hasFilters = empNo !== "" || name !== "" || departmentId !== "" || companyId !== "";
  const clearFilters = () => {
    setEmpNo("");
    setName("");
    setDepartmentId("");
    setCompanyId("");
    setPage(1);
  };

  return (
    <div className="relative space-y-4">
      <PageHeader
        title="Employees"
        description={data ? `${data.meta.total} total employees` : "Loading employees…"}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Import
            </button>
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Export
            </button>
            <Link
              href="/employees/new"
              className="inline-flex items-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              + New employee
            </Link>
          </div>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white/70 p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelCls}>Employee ID</label>
            <AppInput
              type="search"
              placeholder="e.g. EMP-0002"
              value={empNo}
              onChange={(e) => setEmpNo(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Employee Name</label>
            <AppInput
              type="search"
              placeholder="Search name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>Department</label>
            <select
              className={inputCls}
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value === "" ? "" : Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Company</label>
            <select
              className={inputCls}
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value === "" ? "" : Number(e.target.value));
                setPage(1);
              }}
            >
              <option value="">All companies</option>
              {companies?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} — ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {hasFilters && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <TableShell>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <Th>Employee #</Th>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Department</Th>
              <Th>Position</Th>
              <Th>Type</Th>
              <Th>Hired</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <Td><div className="h-4 w-20 rounded bg-slate-200" /></Td>
                    <Td><div className="h-4 w-40 rounded bg-slate-200" /></Td>
                    <Td><div className="h-4 w-24 rounded bg-slate-200" /></Td>
                    <Td><div className="h-4 w-32 rounded bg-slate-200" /></Td>
                    <Td><div className="h-4 w-32 rounded bg-slate-200" /></Td>
                    <Td><div className="h-4 w-20 rounded bg-slate-200" /></Td>
                    <Td><div className="h-4 w-20 rounded bg-slate-200" /></Td>
                    <Td><div className="h-4 w-20 rounded bg-slate-200" /></Td>
                  </tr>
                ))}
              </>
            )}
            {isError && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-red-600">
                  Could not load employees (check you are signed in and have employee.view permission). Refresh the page.
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.data.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  No employees yet.{" "}
                  <Link href="/employees/new" className="text-slate-900 underline">
                    Add the first one
                  </Link>
                  .
                </td>
              </tr>
            )}
            {data?.data.map((emp) => (
              <tr 
                key={emp.id} 
                onClick={() => setPreviewEmployee(emp)}
                // Accessibility keyboard additions
                tabIndex={0}
                aria-label={`View details for ${emp.full_name}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreviewEmployee(emp);
                  }
                }}
                className="hover:bg-slate-50 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                <Td>
                  <span className="font-mono text-slate-900 font-medium">
                    {emp.employee_no}
                  </span>
                </Td>
                <Td>
                  <span className="font-medium text-slate-900">
                    {emp.full_name}
                  </span>
                </Td>
                <Td>{emp.company?.name ?? "—"}</Td>
                <Td>{emp.department?.name ?? "—"}</Td>
                <Td>{emp.position?.title ?? "—"}</Td>
                <Td>{emp.employment_type?.name ?? "—"}</Td>
                <Td>{emp.date_hired ?? "—"}</Td>
                <Td>
                  <StatusBadge active={emp.is_active}>
                    {emp.is_active ? "Active" : "Inactive"}
                  </StatusBadge>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableShell>

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {data.meta.current_page} of {data.meta.last_page}
          </span>
          <div className="flex gap-2">
            <AppButton
              variant="secondary"
              disabled={!data.links.prev}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </AppButton>
            <AppButton
              variant="secondary"
              disabled={!data.links.next}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </AppButton>
          </div>
        </div>
      )}

      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => qc.invalidateQueries({ queryKey: ["employees"] })}
        />
      )}

      {/* RECORD PREVIEW DRAWER OVERLAY */}
      {previewEmployee && (
        <>
          {/* Backdrop Blur blur-shield */}
          <div 
            className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm transition-opacity"
            onClick={() => setPreviewEmployee(null)}
          />

          {/* Drawer Body panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-slate-200 bg-white p-6 shadow-2xl flex flex-col justify-between transform transition-transform animate-in slide-in-from-right duration-200">
            <div>
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="font-mono text-xs font-semibold tracking-wider text-slate-400 uppercase">Employee Details</p>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">{previewEmployee.full_name}</h2>
                  <p className="text-sm font-mono text-slate-500 mt-0.5">ID: {previewEmployee.employee_no}</p>
                </div>
                <button 
                  onClick={() => setPreviewEmployee(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                  aria-label="Close drawer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Data Content Fields */}
              <div className="mt-6 space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Status</label>
                    <div className="mt-1">
                      <StatusBadge active={previewEmployee.is_active}>
                        {previewEmployee.is_active ? "Active" : "Inactive"}
                      </StatusBadge>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Date Hired</label>
                    <p className="mt-1 text-sm font-medium text-slate-800">{previewEmployee.date_hired ?? "—"}</p>
                  </div>
                </div>

                <div className="border-t border-slate-50 pt-4">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Department</label>
                  <p className="mt-1 text-base font-semibold text-slate-900">{previewEmployee.department?.name ?? "—"}</p>
                </div>

                <div className="border-t border-slate-50 pt-4">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Job Position</label>
                  <p className="mt-1 text-base font-medium text-slate-800">{previewEmployee.position?.title ?? "—"}</p>
                </div>

                <div className="border-t border-slate-50 pt-4">
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Employment Type</label>
                  <p className="mt-1 text-sm font-medium text-slate-800">{previewEmployee.employment_type?.name ?? "—"}</p>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t border-slate-100 pt-4 flex gap-2">
              <Link 
                href={`/employees/${previewEmployee.id}`}
                className="flex-1 inline-flex items-center justify-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 text-center"
              >
                View Profile
              </Link>
              
              <AppButton
                variant="secondary"
                onClick={() => router.push(`/employees/${previewEmployee.id}/edit`)}
                className="flex items-center gap-1.5"
                aria-label={`Edit profile for ${previewEmployee.full_name}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Edit
              </AppButton>

              <button 
                onClick={() => setPreviewEmployee(null)}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = useMutation({
    mutationFn: () => importEmployees(file!),
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
          Upload a CSV or Excel (.xlsx) file. Columns: Employee ID, Last Name, Middle Name, First Name, Gender, Civil
          Status, Department, Location, Email, Position, Employment Type, Date Hired, Birth Date. Missing
          departments, locations, positions and employment types are created automatically. Existing employee IDs are
          updated (blank cells never overwrite existing data); new IDs are created.
        </p>

        <a
          href={employeeImportTemplateUrl}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v9a2 2 0 01-2 2z" />
          </svg>
          Download template
        </a>

        {!result && (
          <div className="mt-4">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            />
            {file && <p className="mt-2 text-xs text-slate-500">Selected: {file.name}</p>}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <div className="flex gap-3">
              <Stat label="Created" value={result.created} tone="emerald" />
              <Stat label="Updated" value={result.updated} tone="sky" />
              <Stat label="Skipped" value={result.skipped} tone="amber" />
              <Stat label="Errors" value={result.errors.length} tone="red" />
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-red-100 bg-red-50/50 p-3 text-xs text-red-700">
                {result.errors.map((e, i) => (
                  <div key={i}>Row {e.row}: {e.message}</div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">
              Any columns left blank can be completed later in each profile (or in a follow-up import).
            </p>
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
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    sky: "bg-sky-50 text-sky-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <div className={`flex-1 rounded-lg px-3 py-2 text-center ${tones[tone]}`}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}