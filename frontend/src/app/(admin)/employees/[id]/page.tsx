"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ProvisionLoginButton } from "@/components/employees/ProvisionLoginButton";
import { getEmployee } from "@/lib/employees";
import { branchTermFor } from "@/lib/terminology";

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

  const branch = branchTermFor(data.company?.code);

  return (
    <div className="space-y-6">

      {/* ── Employment summary banner ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-slate-700 to-slate-900 text-lg font-bold text-white shadow-sm">
              {(data.first_name?.[0] ?? "") + (data.last_name?.[0] ?? "") || "?"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold text-slate-900">{data.full_name}</p>
                {data.company && (
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600" title={data.company.name}>
                    {data.company.code}
                  </span>
                )}
                {data.is_confidential && (
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700" title="Confidential payroll group — pay visible to senior HR / IT only">
                    Confidential
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500">{data.position?.title ?? "—"} · {data.department?.name ?? "—"}</p>
              <p className="mt-0.5 font-mono text-xs text-slate-400">#{data.employee_no}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Chip label={branch.Singular} value={data.branch?.name} />
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
          <Field label="Gender" value={data.gender} capitalize />
          <Field label="Civil status" value={data.civil_status} capitalize />
          <Field label="Nationality" value={data.nationality} capitalize />
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <Field label="Company email" value={data.email_company} mono />
          <Field label="Personal email" value={data.email_personal} mono />
          {data.account && (
            <div className="min-w-0 rounded-lg bg-sky-50 px-2.5 py-1.5">
              <dt className="flex items-center gap-1.5 text-xs text-sky-700/80">
                Login email
                <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                  account made
                </span>
              </dt>
              <dd className="mt-0.5 break-all font-mono text-sm text-sky-900">{data.account.email}</dd>
              {data.account.email !== data.email_company && data.account.email !== data.email_personal && (
                <dd className="mt-1 text-[11px] text-amber-600">Differs from the emails on file above — this is the address they actually sign in with.</dd>
              )}
            </div>
          )}
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
          {data.basic_pay != null && (
            <div className="min-w-0 rounded-lg bg-emerald-50 px-2.5 py-1.5">
              <dt className="text-xs text-emerald-700/70">Basic pay</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-800">
                ₱{Number(data.basic_pay).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </dd>
            </div>
          )}
          <Field label={branch.Singular} value={data.branch?.name} />
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
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Field({
  label, value, mono, capitalize,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm font-medium text-slate-800 ${mono ? "font-mono text-xs" : ""} ${capitalize ? "capitalize" : ""}`}>
        {value || "—"}
      </dd>
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
