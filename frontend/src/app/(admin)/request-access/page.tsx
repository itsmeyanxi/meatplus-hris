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
import { listEmployees, getEmployee } from "@/lib/employees";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import { inputCls, labelCls } from "@/lib/form-classes";

// ── Constants ─────────────────────────────────────────────────────────────

const MODULES = [
  { key: "ess",         label: "Employee Self-Service"    },
  { key: "timekeeping", label: "Timekeeping & Attendance" },
  { key: "payroll",     label: "Payroll"                  },
  { key: "leave",       label: "Leave Management"         },
  { key: "recruitment", label: "Recruitment"              },
  { key: "performance", label: "Performance Management"   },
  { key: "reports",     label: "Reports & Analytics"      },
  { key: "admin",       label: "System Administration"    },
];

const ACCESS_LEVELS = [
  { value: "view",     label: "View",     description: "Read-only access" },
  { value: "user",     label: "User",     description: "Create and edit records" },
  { value: "approver", label: "Approver", description: "Approve requests" },
  { value: "admin",    label: "Admin",    description: "Full module control" },
];

const REQUEST_TYPES = [
  { value: "new_access",          label: "New access",          desc: "First-time HRIS access" },
  { value: "access_modification", label: "Modify access",       desc: "Change existing permissions" },
  { value: "access_removal",      label: "Remove access",       desc: "Revoke system access" },
  { value: "temporary_access",    label: "Temporary access",    desc: "Limited-time access" },
];

const EMPLOYMENT_STATUSES = [
  { value: "regular",      label: "Regular" },
  { value: "probationary", label: "Probationary" },
  { value: "contractual",  label: "Contractual" },
  { value: "ojt_intern",   label: "OJT / Intern" },
];

const SECTIONS = [
  { letter: "A", title: "Request Info" },
  { letter: "B", title: "Employee Info" },
  { letter: "C", title: "Module Access" },
  { letter: "D", title: "Justification" },
];

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  pending:   { bg: "bg-amber-50",   text: "text-amber-800",  dot: "bg-amber-400" },
  approved:  { bg: "bg-emerald-50", text: "text-emerald-800",dot: "bg-emerald-500" },
  rejected:  { bg: "bg-red-50",     text: "text-red-700",    dot: "bg-red-400" },
  cancelled: { bg: "bg-slate-100",  text: "text-slate-600",  dot: "bg-slate-400" },
};

// ── Page ──────────────────────────────────────────────────────────────────

export default function RequestAccessPage() {
  const qc = useQueryClient();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("A");

  // ── Employee autocomplete state ────────────────────────────────────────
  const [empName, setEmpName] = useState("");
  const [empIdNo, setEmpIdNo] = useState("");
  const [empPosition, setEmpPosition] = useState("");
  const [empDepartment, setEmpDepartment] = useState("");

  const { data: empPage } = useQuery({
    queryKey: ["employees-lookup"],
    queryFn: () => listEmployees({ perPage: 200 }),
  });
  const employees = empPage?.data ?? [];
  const [selectedEmpId, setSelectedEmpId] = useState<number | "">("");

  async function handleEmpSelect(id: number | "") {
    setSelectedEmpId(id);
    if (!id) return;
    // Prefer the already-loaded list; fall back to fetching the full record so
    // employees outside the first page still auto-fill.
    const emp = employees.find((em) => em.id === id) ?? (await getEmployee(id).catch(() => null));
    if (!emp) return;
    setEmpName(emp.full_name);
    setEmpIdNo(emp.employee_no);
    setEmpPosition(emp.position?.title ?? "");
    setEmpDepartment(emp.department?.name ?? "");
  }

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
        request_type:        String(fd.get("a-request-type") ?? ""),
        effective_date:      String(fd.get("effective_date") ?? ""),
        ticket_number:       (fd.get("ticket_number") as string) || null,
        employee_name:       String(fd.get("employee_name") ?? ""),
        employee_id_number:  String(fd.get("employee_id_number") ?? ""),
        position:            String(fd.get("position") ?? ""),
        department:          String(fd.get("department") ?? ""),
        employment_status:   String(fd.get("b-employment-status") ?? ""),
        immediate_supervisor:String(fd.get("immediate_supervisor") ?? ""),
        company_email:       String(fd.get("company_email") ?? ""),
        contact_number:      String(fd.get("contact_number") ?? ""),
        justification:       String(fd.get("justification") ?? ""),
        modules,
      });
      qc.invalidateQueries({ queryKey: ["my-access-requests"] });
      setSubmitted(true);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Could not submit the request. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (submitted) return <SuccessState onReset={() => setSubmitted(false)} />;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">

      {/* ── Header ── */}
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">HRIS System</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Access Request Form</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Complete all sections. Your request routes through three approval stages before access is granted.
        </p>

        {/* Approval pipeline */}
        <div className="mt-5 flex items-center gap-0">
          {(["Supervisor", "HR", "IT"] as const).map((stage, i) => (
            <div key={stage} className="flex items-center">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">{i + 1}</span>
                <span className="text-xs font-medium text-slate-700">{stage}</span>
              </div>
              {i < 2 && (
                <div className="flex items-center px-1">
                  <div className="h-px w-6 bg-slate-300" />
                  <svg className="h-3 w-3 text-slate-300" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center">
            <div className="flex items-center px-1">
              <div className="h-px w-6 bg-slate-200" />
              <svg className="h-3 w-3 text-slate-200" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-bold text-slate-400">4</span>
              <span className="text-xs font-medium text-slate-400">Access granted</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section nav pills ── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SECTIONS.map((s) => (
          <button
            key={s.letter}
            type="button"
            onClick={() => setActiveSection(s.letter)}
            className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
              activeSection === s.letter
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${activeSection === s.letter ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"}`}>{s.letter}</span>
            {s.title}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-5" noValidate>

        {/* ── Section A: Request Information ── */}
        <Section id="A" title="Request Information" description="What kind of access change are you requesting?" onView={setActiveSection}>
          <div>
            <label className={labelCls}>Request type <Req /></label>
            <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REQUEST_TYPES.map((rt) => (
                <label key={rt.value} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition hover:border-slate-300 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50 has-[:checked]:ring-1 has-[:checked]:ring-slate-900">
                  <input type="radio" name="a-request-type" value={rt.value} required className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{rt.label}</p>
                    <p className="text-xs text-slate-500">{rt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Effective date" required>
              <input name="effective_date" type="date" required className={inputCls} />
            </Field>
            <div>
              <label className={labelCls}>Ticket number</label>
              <div className="mt-1 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
                <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z" /></svg>
                <span className="text-xs text-slate-500">Auto-assigned on submission — sent to your email</span>
              </div>
            </div>
          </div>
        </Section>

        {/* ── Section B: Employee Information ── */}
        <Section id="B" title="Employee Information" description="Who is this access request for?" onView={setActiveSection}>
          {/* Employee lookup — auto-fills fields below */}
          <div className="sm:col-span-2">
            <label className={labelCls}>
              Look up employee
              <span className="ml-1 font-normal text-slate-400">(optional — auto-fills fields below)</span>
            </label>
            <div className="mt-1">
              <EmployeeSearchSelect
                value={selectedEmpId}
                onChange={handleEmpSelect}
                placeholder="Search employee by name or number…"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee name" required>
              <input
                name="employee_name"
                type="text"
                required
                placeholder="Full name"
                className={inputCls}
                value={empName}
                onChange={(e) => setEmpName(e.target.value)}
              />
            </Field>
            <Field label="Employee ID number" required>
              <input
                name="employee_id_number"
                type="text"
                required
                placeholder="e.g. MPP-001"
                className={inputCls}
                value={empIdNo}
                onChange={(e) => setEmpIdNo(e.target.value)}
              />
            </Field>
            <Field label="Position / designation" required>
              <input
                name="position"
                type="text"
                required
                placeholder="e.g. Sales Associate"
                className={inputCls}
                value={empPosition}
                onChange={(e) => setEmpPosition(e.target.value)}
              />
            </Field>
            <Field label="Department" required>
              <input
                name="department"
                type="text"
                required
                placeholder="e.g. Operations"
                className={inputCls}
                value={empDepartment}
                onChange={(e) => setEmpDepartment(e.target.value)}
              />
            </Field>
          </div>

          <div>
            <label className={labelCls}>Employment status <Req /></label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EMPLOYMENT_STATUSES.map((es) => (
                <label key={es.value} className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 has-[:checked]:border-slate-900 has-[:checked]:bg-slate-900 has-[:checked]:text-white has-[:checked]:shadow-md">
                  <input type="radio" name="b-employment-status" value={es.value} required className="sr-only" />
                  {es.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Immediate supervisor" required>
              <input name="immediate_supervisor" type="text" required placeholder="Supervisor's name" className={inputCls} />
            </Field>
            <Field label="Company email address" required>
              <input name="company_email" type="email" required placeholder="name@meatplus.ph" className={inputCls} />
            </Field>
            <Field label="Contact number" required>
              <input name="contact_number" type="tel" required placeholder="09XX XXX XXXX" className={inputCls} />
            </Field>
          </div>
        </Section>

        {/* ── Section C: Module Access ── */}
        <Section id="C" title="Module Access" description="Select the access level required for each HRIS module." onView={setActiveSection}>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            {/* Header row */}
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: "1fr repeat(4, auto)" }}>
              <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Module</div>
              {ACCESS_LEVELS.map((lvl) => (
                <div key={lvl.value} className="w-20 px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{lvl.label}</div>
              ))}
            </div>
            {/* Module rows */}
            {MODULES.map((mod, i) => (
              <div key={mod.key} className={`grid items-center border-b border-slate-100 last:border-0 transition hover:bg-slate-50/60 ${i % 2 === 0 ? "" : "bg-slate-50/30"}`} style={{ gridTemplateColumns: "1fr repeat(4, auto)" }}>
                <div className="flex items-center px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{mod.label}</span>
                </div>
                {ACCESS_LEVELS.map((lvl) => (
                  <div key={lvl.value} className="flex w-20 items-center justify-center py-3">
                    <label className="flex cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        name={`c-${mod.key}`}
                        value={lvl.value}
                        aria-label={`${mod.label} — ${lvl.label}`}
                        className="h-4 w-4 rounded accent-slate-900"
                      />
                    </label>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">Leave all unchecked for modules you don&apos;t need access to.</p>
        </Section>

        {/* ── Section D: Justification ── */}
        <Section id="D" title="Justification" description="Explain the business need for this access request." onView={setActiveSection}>
          <Field label="Reason for requested access" required>
            <textarea
              name="justification"
              rows={5}
              required
              placeholder="Describe why this access is needed, how it will be used, and the business impact if not granted…"
              className={`${inputCls} resize-y`}
            />
          </Field>
        </Section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
            {error}
          </div>
        )}

        {/* ── Actions ── */}
        <div className="flex flex-col-reverse items-center gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-between">
          <p className="text-xs text-slate-400">Fields marked <span className="text-red-500">*</span> are required.</p>
          <div className="flex gap-3">
            <Link href="/dashboard" className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {saving ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />Submitting…</>
              ) : "Submit request"}
            </button>
          </div>
        </div>
      </form>

      <MyRequests />
    </div>
  );
}

// ── Success state ─────────────────────────────────────────────────────────

function SuccessState({ onReset }: { onReset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
        <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-slate-900">Request submitted</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
        Your access request has been filed. A ticket number confirmation has been sent to your email — check your inbox.
      </p>

      {/* Mini pipeline */}
      <div className="mt-6 flex items-center justify-center gap-1.5">
        {["Supervisor", "HR", "IT"].map((s, i) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              <span className="text-xs font-medium text-amber-700">{s}</span>
            </div>
            {i < 2 && <span className="text-slate-300">›</span>}
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center gap-3">
        <button onClick={onReset} className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50">
          Submit another
        </button>
        <Link href="/dashboard" className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

// ── My requests ───────────────────────────────────────────────────────────

function MyRequests() {
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery({ queryKey: ["my-access-requests"], queryFn: getMyAccessRequests });
  const cancel = useMutation({
    mutationFn: (id: number) => cancelAccessRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-access-requests"] }),
  });
  if (isLoading || items.length === 0) return null;

  const STAGES = ["supervisor", "hr", "it"];

  return (
    <div className="border-t border-slate-200 pt-8">
      <h2 className="text-sm font-semibold text-slate-800">My submitted requests</h2>
      <p className="mt-0.5 text-xs text-slate-500">Track and withdraw requests you have filed.</p>
      <div className="mt-4 space-y-3">
        {items.map((r: AccessRequest) => {
          const s = STATUS_STYLES[r.status] ?? STATUS_STYLES.cancelled;
          const currentStageIdx = STAGES.indexOf(r.current_stage ?? "");
          return (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{r.employee_name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.request_type?.replace(/_/g, " ")} · {r.department}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                    {r.status === "rejected" ? "Disapproved" : r.status}
                  </span>
                  {r.status === "pending" && (
                    <button
                      onClick={() => {
                        if (window.confirm("Withdraw this access request?")) cancel.mutate(r.id);
                      }}
                      disabled={cancel.isPending}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </div>

              {/* Stage tracker */}
              {r.status === "pending" && (
                <div className="mt-3 flex items-center gap-1.5">
                  {STAGES.map((stage, i) => {
                    const done = i < currentStageIdx;
                    const active = i === currentStageIdx;
                    return (
                      <div key={stage} className="flex items-center gap-1.5">
                        <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                          done   ? "bg-emerald-50 text-emerald-700" :
                          active ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" :
                                   "bg-slate-50 text-slate-400"
                        }`}>
                          {stage.charAt(0).toUpperCase() + stage.slice(1)}
                        </div>
                        {i < 2 && <span className="text-slate-200">›</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-2 text-xs text-slate-400">
                Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—"}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────────────────

function Section({ id, title, description, children, onView }: {
  id: string; title: string; description?: string;
  children: React.ReactNode; onView: (id: string) => void;
}) {
  return (
    <fieldset
      className="group rounded-2xl border border-slate-200 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.04)] backdrop-blur"
      onClick={() => onView(id)}
    >
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white">{id}</span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      <div className="space-y-5 px-5 py-5">{children}</div>
    </fieldset>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
        {hint && <span className="ml-1 font-normal text-slate-400">({hint})</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Req() { return <span className="text-red-500">*</span>; }
