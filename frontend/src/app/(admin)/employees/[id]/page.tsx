"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProvisionLoginButton } from "@/components/employees/ProvisionLoginButton";
import { getEmployee } from "@/lib/employees";

export default function EmployeeOverviewPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  const { data, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => getEmployee(id),
    enabled: !!id,
  });

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-slate-100" />)}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">

      {/* ── Employment summary banner ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-white">
              {data.first_name?.[0]}{data.last_name?.[0]}
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">{data.full_name}</p>
              <p className="text-sm text-slate-500">{data.position?.title ?? "—"} · {data.department?.name ?? "—"}</p>
              <p className="mt-0.5 text-xs font-mono text-slate-400">{data.employee_no}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label="Branch" value={data.branch?.name} />
            <Chip label="Type" value={data.employment_type?.name} />
            <Chip label="Hired" value={data.date_hired} />
            <Chip label="Status" value={data.is_active ? "Active" : "Inactive"} active={data.is_active} />
          </div>
        </div>
      </div>

      {/* ── Main info grid ── */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* Personal */}
        <Section title="Personal">
          <Field label="First name" value={data.first_name} />
          <Field label="Middle name" value={data.middle_name} />
          <Field label="Last name" value={data.last_name} />
          <Field label="Suffix" value={data.suffix} />
          <Field label="Birth date" value={data.birth_date} />
          <Field label="Gender" value={data.gender} />
          <Field label="Civil status" value={data.civil_status} />
          <Field label="Nationality" value={data.nationality} />
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <Field label="Company email" value={data.email_company} />
          <Field label="Personal email" value={data.email_personal} />
          <Field label="Mobile" value={data.mobile} />
          <Field label="Home phone" value={data.phone_home} />
          <div className="pt-2 border-t border-slate-100">
            <p className="mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Address</p>
            <Field label="Line 1" value={data.address?.line1} />
            <Field label="Line 2" value={data.address?.line2} />
            <Field label="City" value={data.address?.city} />
            <Field label="Province" value={data.address?.province} />
            <Field label="Postal" value={data.address?.postal_code} />
          </div>
        </Section>

        {/* Employment */}
        <Section title="Employment">
          <Field label="Branch" value={data.branch?.name} />
          <Field label="Department" value={data.department?.name} />
          <Field label="Position" value={data.position?.title} />
          <Field label="Employment type" value={data.employment_type?.name} />
          <Field label="Manager" value={data.manager?.full_name} />
          <Field label="Date hired" value={data.date_hired} />
          <Field label="Date regularized" value={data.date_regularized} />
          {data.date_separated && (
            <>
              <Field label="Date separated" value={data.date_separated} />
              <Field label="Separation reason" value={data.separation_reason} />
            </>
          )}
        </Section>
      </div>

      {/* ── Login access ── */}
      <ProvisionLoginButton employeeId={data.id} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-50 py-2 text-sm last:border-b-0">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="text-right font-medium text-slate-800">{value || "—"}</span>
    </div>
  );
}

function Chip({ label, value, active }: { label: string; value?: string | null; active?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-1.5 text-center ${active === false ? "bg-slate-100" : active === true ? "bg-green-50" : "bg-slate-50"}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-xs font-semibold ${active === true ? "text-green-700" : "text-slate-700"}`}>{value ?? "—"}</p>
    </div>
  );
}
