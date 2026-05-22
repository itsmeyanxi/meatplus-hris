"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { listEmployees } from "@/lib/employees";

export default function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["employees", { search, page }],
    queryFn: () => listEmployees({ q: search, page, perPage: 25 }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Employees</h2>
          <p className="text-sm text-slate-500">
            {data ? `${data.meta.total} total` : "Loading…"}
          </p>
        </div>
        <Link
          href="/employees/new"
          className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          + New employee
        </Link>
      </div>

      <input
        type="search"
        placeholder="Search by name, employee no, or email…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
      />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {data?.data.length === 0 && (
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
              <tr key={emp.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/employees/${emp.id}`} className="font-mono text-slate-900 hover:underline">
                    {emp.employee_no}
                  </Link>
                </Td>
                <Td>
                  <Link href={`/employees/${emp.id}`} className="font-medium hover:underline">
                    {emp.full_name}
                  </Link>
                </Td>
                <Td>{emp.department?.name ?? "—"}</Td>
                <Td>{emp.position?.title ?? "—"}</Td>
                <Td>{emp.employment_type?.name ?? "—"}</Td>
                <Td>{emp.date_hired ?? "—"}</Td>
                <Td>
                  <span
                    className={
                      emp.is_active
                        ? "rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800"
                        : "rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                    }
                  >
                    {emp.is_active ? "Active" : "Inactive"}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.meta.last_page > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">
            Page {data.meta.current_page} of {data.meta.last_page}
          </span>
          <div className="flex gap-2">
            <button
              disabled={!data.links.prev}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Previous
            </button>
            <button
              disabled={!data.links.next}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
