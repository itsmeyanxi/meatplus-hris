"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import {
  cancelAccessRequest,
  createAccessRequest,
  getMyAccessRequests,
  type AccessRequest,
} from "@/lib/access-requests";
import { inputCls as inputClass, labelCls as labelClass } from "@/lib/form-classes";

function Req() {
  return <span className="text-red-500">*</span>;
}

function SectionCard({
  letter,
  title,
  description,
  children,
}: {
  letter: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
      <div className="flex items-start gap-3 border-b border-slate-100 px-6 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
          {letter}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-5 px-6 py-5">{children}</div>
    </fieldset>
  );
}

function OptionCards({
  name,
  options,
  required,
}: {
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-sm transition hover:border-slate-400 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50 has-[:checked]:ring-1 has-[:checked]:ring-slate-900"
        >
          <input
            type="radio"
            name={name}
            value={opt.value}
            required={required}
            className="h-4 w-4 accent-slate-900"
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </div>
  );
}

const MODULES = [
  { key: "ess", label: "Employee Self-Service (ESS)" },
  { key: "timekeeping", label: "Timekeeping & Attendance" },
  { key: "payroll", label: "Payroll" },
  { key: "leave", label: "Leave Management" },
  { key: "recruitment", label: "Recruitment" },
  { key: "performance", label: "Performance Management" },
  { key: "reports", label: "Reports & Analytics" },
  { key: "admin", label: "System Administration" },
];
const ACCESS_LEVELS = ["View", "User", "Approver", "Admin"];

export default function RequestAccessPage() {
  const qc = useQueryClient();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const modules: Record<string, string[]> = {};
    for (const mod of MODULES) {
      const levels = fd.getAll(`c-${mod.key}`).map(String);
      if (levels.length) modules[mod.key] = levels;
    }

    try {
      await createAccessRequest({
        request_type: String(fd.get("a-request-type") ?? ""),
        effective_date: String(fd.get("effective_date") ?? ""),
        ticket_number: (fd.get("ticket_number") as string) || null,
        employee_name: String(fd.get("employee_name") ?? ""),
        employee_id_number: String(fd.get("employee_id_number") ?? ""),
        position: String(fd.get("position") ?? ""),
        department: String(fd.get("department") ?? ""),
        employment_status: String(fd.get("b-employment-status") ?? ""),
        immediate_supervisor: String(fd.get("immediate_supervisor") ?? ""),
        company_email: String(fd.get("company_email") ?? ""),
        contact_number: String(fd.get("contact_number") ?? ""),
        justification: String(fd.get("justification") ?? ""),
        modules,
      });
      qc.invalidateQueries({ queryKey: ["my-access-requests"] });
      setSubmitted(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Could not submit the request. Please try again.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          System Access Request Form
        </h1>
        <p className="mt-2 max-w-prose text-sm text-slate-500">
          Complete all required fields. Your request will go through the
          approval chain below.
        </p>

        {/* Approval flow indicator */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600">
          {["Supervisor", "HR", "IT"].map((step, i) => (
            <div key={step} className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">
                  {i + 1}
                </span>
                {step}
              </span>
              {i < 2 && <span className="text-slate-300">&rarr;</span>}
            </div>
          ))}
        </div>
      </div>

      {submitted ? (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-6 w-6"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.1 3.1 6.8-6.8a1 1 0 011.4 0z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-slate-900">
            Request submitted
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Your access request has been noted and will be routed for
            supervisor, HR, and IT approval.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="inline-flex rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Submit another
            </button>
            <Link
              href="/dashboard"
              className="inline-flex rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          {/* Section A — Request Information */}
          <SectionCard
            letter="A"
            title="Request Information"
            description="What kind of access are you requesting?"
          >
            <div>
              <span className={labelClass}>
                Request type <Req />
              </span>
              <OptionCards
                name="a-request-type"
                required
                options={[
                  { value: "new_access", label: "New access" },
                  { value: "access_modification", label: "Access modification" },
                  { value: "access_removal", label: "Access removal" },
                  { value: "temporary_access", label: "Temporary access" },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="a-effective-date" className={labelClass}>
                  Effective date <Req />
                </label>
                <input
                  id="a-effective-date"
                  name="effective_date"
                  type="date"
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="a-ticket" className={labelClass}>
                  Ticket / reference number{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <input id="a-ticket" name="ticket_number" type="text" className={inputClass} />
              </div>
            </div>
          </SectionCard>

          {/* Section B — Employee Information */}
          <SectionCard
            letter="B"
            title="Employee Information"
            description="Tell us who the access is for."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="b-name" className={labelClass}>
                  Employee name <Req />
                </label>
                <input id="b-name" name="employee_name" type="text" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="b-empid" className={labelClass}>
                  Employee ID number <Req />
                </label>
                <input id="b-empid" name="employee_id_number" type="text" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="b-position" className={labelClass}>
                  Position / designation <Req />
                </label>
                <input id="b-position" name="position" type="text" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="b-department" className={labelClass}>
                  Department <Req />
                </label>
                <input id="b-department" name="department" type="text" required className={inputClass} />
              </div>
            </div>

            <div>
              <span className={labelClass}>
                Employment status <Req />
              </span>
              <OptionCards
                name="b-employment-status"
                required
                options={[
                  { value: "regular", label: "Regular" },
                  { value: "probationary", label: "Probationary" },
                  { value: "contractual", label: "Contractual" },
                  { value: "ojt_intern", label: "OJT / Intern" },
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="b-supervisor" className={labelClass}>
                  Immediate supervisor <Req />
                </label>
                <input id="b-supervisor" name="immediate_supervisor" type="text" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="b-email" className={labelClass}>
                  Company email address <Req />
                </label>
                <input id="b-email" name="company_email" type="email" required className={inputClass} />
              </div>
              <div>
                <label htmlFor="b-contact" className={labelClass}>
                  Contact number <Req />
                </label>
                <input id="b-contact" name="contact_number" type="tel" required className={inputClass} />
              </div>
            </div>
          </SectionCard>

          {/* Section C — Requested HRIS Module Access */}
          <SectionCard
            letter="C"
            title="Requested HRIS Module Access"
            description="Tick the access level needed per module."
          >
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-600">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide">
                      Module
                    </th>
                    {ACCESS_LEVELS.map((lvl) => (
                      <th
                        key={lvl}
                        className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide"
                      >
                        {lvl}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODULES.map((mod) => (
                    <tr
                      key={mod.key}
                      className="border-t border-slate-100 transition hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-700">
                        {mod.label}
                      </td>
                      {ACCESS_LEVELS.map((lvl) => (
                        <td key={lvl} className="px-2 py-2.5 text-center">
                          <input
                            type="checkbox"
                            name={`c-${mod.key}`}
                            value={lvl.toLowerCase()}
                            aria-label={`${mod.label} — ${lvl}`}
                            className="h-4 w-4 accent-slate-900"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Section D — Justification / Business Requirement */}
          <SectionCard letter="D" title="Justification / Business Requirement">
            <div>
              <label htmlFor="d-reason" className={labelClass}>
                Reason for requested access <Req />
              </label>
              <textarea
                id="d-reason"
                name="justification"
                rows={4}
                required
                placeholder="Please provide reason for the requested access..."
                className={`${inputClass} resize-y`}
              />
            </div>
          </SectionCard>

          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/dashboard"
              className="inline-flex justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex justify-center rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {saving ? "Submitting…" : "Submit request"}
            </button>
          </div>

          <p className="pb-4 text-center text-xs text-slate-400">
            Fields marked <Req /> are required.
          </p>
        </form>
      )}

      <MyRequests />
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-slate-200 text-slate-700",
};

function MyRequests() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["my-access-requests"],
    queryFn: getMyAccessRequests,
  });

  const cancel = useMutation({
    mutationFn: (id: number) => cancelAccessRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-access-requests"] }),
  });

  if (isLoading || items.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-slate-800">My requests</h2>
      <p className="mt-1 text-sm text-slate-500">Track and withdraw requests you have submitted.</p>

      <div className="mt-4 space-y-2">
        {items.map((r: AccessRequest) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {r.employee_name} <span className="font-normal text-slate-400">— {r.request_type}</span>
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—"}
                {r.status === "pending" && r.current_stage !== "done" && (
                  <span className="ml-1">· awaiting {r.current_stage}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                {r.status}
              </span>
              {r.status === "pending" && (
                <button
                  type="button"
                  onClick={() => cancel.mutate(r.id)}
                  disabled={cancel.isPending}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
