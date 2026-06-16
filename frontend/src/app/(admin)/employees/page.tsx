"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/auth";
import { listEmployees } from "@/lib/employees";
import { AppButton, AppInput, PageHeader, StatusBadge, TableShell } from "@/components/ui";

export default function EmployeesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [previewEmployee, setPreviewEmployee] = useState<any | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["employees", { search: debouncedSearch, page }],
    queryFn: () => listEmployees({ q: debouncedSearch, page, perPage: 25 }),
    enabled: !!me,
    staleTime: 30_000,
  });

  return (
    <div className="relative space-y-4">
      <PageHeader
        title="Employees"
        description={data ? `${data.meta.total} total employees` : "Loading employees…"}
        actions={
          <Link
            href="/employees/new"
            className="inline-flex items-center rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
          >
            + New employee
          </Link>
        }
      />

      <AppInput
        type="search"
        placeholder="Search by name, employee no, email, or department…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      <TableShell>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <Th>Employee #</Th>
              <Th>Name</Th>
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
                <td colSpan={7} className="px-4 py-6 text-center text-red-600">
                  Could not load employees (check you are signed in and have employee.view permission). Refresh the page.
                </td>
              </tr>
            )}
            {!isLoading && !isError && data?.data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
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