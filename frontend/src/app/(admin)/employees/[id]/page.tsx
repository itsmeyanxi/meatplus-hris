"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
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

  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <ProvisionLoginButton employeeId={data.id} />
      <div className="grid gap-4 md:grid-cols-2">
      <Card title="Identity">
        <Row label="First name" value={data.first_name} />
        <Row label="Middle name" value={data.middle_name} />
        <Row label="Last name" value={data.last_name} />
        <Row label="Suffix" value={data.suffix} />
        <Row label="Birth date" value={data.birth_date} />
        <Row label="Gender" value={data.gender} />
        <Row label="Civil status" value={data.civil_status} />
        <Row label="Nationality" value={data.nationality} />
      </Card>

      <Card title="Contact">
        <Row label="Personal email" value={data.email_personal} />
        <Row label="Company email" value={data.email_company} />
        <Row label="Mobile" value={data.mobile} />
        <Row label="Home phone" value={data.phone_home} />
      </Card>

      <Card title="Current address">
        <Row label="Line 1" value={data.address.line1} />
        <Row label="Line 2" value={data.address.line2} />
        <Row label="City" value={data.address.city} />
        <Row label="Province" value={data.address.province} />
        <Row label="Postal" value={data.address.postal_code} />
        <Row label="Country" value={data.address.country} />
      </Card>

      <Card title="Employment">
        <Row label="Branch" value={data.branch?.name} />
        <Row label="Department" value={data.department?.name} />
        <Row label="Position" value={data.position?.title} />
        <Row label="Employment type" value={data.employment_type?.name} />
        <Row label="Manager" value={data.manager?.full_name ?? null} />
        <Row label="Date hired" value={data.date_hired} />
        <Row label="Date regularized" value={data.date_regularized} />
        <Row label="Date separated" value={data.date_separated} />
        <Row label="Separation reason" value={data.separation_reason} />
      </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-b-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}
