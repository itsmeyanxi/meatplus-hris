"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import { getEmployee, updateEmployee, getLookup, type EmployeeCreateInput } from "@/lib/employees";
import { getMe } from "@/lib/auth";
import { useBranchTerm } from "@/lib/terminology";
import { SearchSelect } from "@/components/SearchSelect";

export default function EditEmployeePage() {
  const router = useRouter();
  const { id } = useParams();
  const employeeId = Number(id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    first_name: "", middle_name: "", last_name: "", suffix: "",
    birth_date: "", gender: "", civil_status: "", nationality: "",
    email_personal: "", email_company: "", mobile: "", phone_home: "",
    biometric_user_id: "",
    branch_id: 0,
    department_id: 0,
    position_id: 0,
    employment_type_id: 0,
    date_hired: "", date_regularized: "",
    is_active: true,
    is_confidential: false,
    time_in_out_required: true,
  });

  const [hydrated, setHydrated] = useState(false);
  const { data: emp, isLoading } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployee(employeeId),
    enabled: !!employeeId,
  });

  if (emp && !hydrated) {
    setHydrated(true);
    setForm({
      first_name: emp.first_name ?? "",
      middle_name: emp.middle_name ?? "",
      last_name: emp.last_name ?? "",
      suffix: emp.suffix ?? "",
      birth_date: emp.birth_date ?? "",
      gender: emp.gender ?? "",
      civil_status: emp.civil_status ?? "",
      nationality: emp.nationality ?? "",
      email_personal: emp.email_personal ?? "",
      email_company: emp.email_company ?? "",
      mobile: emp.mobile ?? "",
      phone_home: emp.phone_home ?? "",
      biometric_user_id: emp.biometric_user_id ?? "",
      branch_id: emp.branch?.id ?? 0,
      department_id: emp.department?.id ?? 0,
      position_id: emp.position?.id ?? 0,
      employment_type_id: emp.employment_type?.id ?? 0,
      date_hired: emp.date_hired ?? "",
      date_regularized: emp.date_regularized ?? "",
      is_active: emp.is_active,
      is_confidential: emp.is_confidential,
      time_in_out_required: emp.time_in_out_required ?? true,
    });
  }

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canConfi = me?.user.permissions.includes("employee.view.sensitive") ?? false;
  const branch = useBranchTerm();

  const { data: departments = [] } = useQuery({ queryKey: ["lookup-departments"], queryFn: () => getLookup("departments"), staleTime: 300_000 });
  const { data: branches = [] } = useQuery({ queryKey: ["lookup-branches"], queryFn: () => getLookup("branches"), staleTime: 300_000 });
  const { data: positions = [] } = useQuery({ queryKey: ["lookup-positions"], queryFn: () => getLookup("positions"), staleTime: 300_000 });
  const { data: empTypes = [] } = useQuery({ queryKey: ["lookup-employment-types"], queryFn: () => getLookup("employment-types"), staleTime: 300_000 });

  const mutation = useMutation({
    mutationFn: () => updateEmployee(employeeId, {
      ...form,
      gender: form.gender as EmployeeCreateInput["gender"],
      civil_status: form.civil_status as EmployeeCreateInput["civil_status"],
      branch_id: form.branch_id ? Number(form.branch_id) : undefined,
      department_id: form.department_id ? Number(form.department_id) : undefined,
      position_id: form.position_id ? Number(form.position_id) : undefined,
      employment_type_id: form.employment_type_id ? Number(form.employment_type_id) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setSaved(true);
      setTimeout(() => {
        router.push(`/employees/${employeeId}`);
      }, 800);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed to save");
    },
  });

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  if (isLoading) return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100" />)}</div>;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); setError(null); mutation.mutate(); }}
      className="space-y-6"
    >
      {/* ── Section: Identity ── */}
      <FormSection title="Personal information" description="Name, birth date, gender and civil status.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="First name" required>
            <input name="first_name" value={form.first_name} onChange={set} required className={inp} />
          </Field>
          <Field label="Middle name">
            <input name="middle_name" value={form.middle_name} onChange={set} className={inp} />
          </Field>
          <Field label="Last name" required>
            <input name="last_name" value={form.last_name} onChange={set} required className={inp} />
          </Field>
          <Field label="Suffix">
            <input name="suffix" value={form.suffix} onChange={set} placeholder="Jr., Sr., III…" className={inp} />
          </Field>
          <Field label="Birth date">
            <input type="date" name="birth_date" value={form.birth_date} onChange={set} className={inp} />
          </Field>
          <Field label="Gender">
            <SearchSelect
              className={inp}
              value={form.gender}
              onChange={(v) => setForm((p) => ({ ...p, gender: v }))}
              placeholder="Select"
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
          <Field label="Civil status">
            <SearchSelect
              className={inp}
              value={form.civil_status}
              onChange={(v) => setForm((p) => ({ ...p, civil_status: v }))}
              placeholder="Select"
              options={[
                { value: "single", label: "Single" },
                { value: "married", label: "Married" },
                { value: "widowed", label: "Widowed" },
                { value: "separated", label: "Separated" },
                { value: "divorced", label: "Divorced" },
              ]}
            />
          </Field>
          <Field label="Nationality">
            <input name="nationality" value={form.nationality} onChange={set} className={inp} />
          </Field>
        </div>
      </FormSection>

      {/* ── Section: Contact ── */}
      <FormSection title="Contact information" description="Email addresses and phone numbers.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Company email">
            <input type="email" name="email_company" value={form.email_company} onChange={set} className={inp} />
          </Field>
          <Field label="Personal email">
            <input type="email" name="email_personal" value={form.email_personal} onChange={set} className={inp} />
          </Field>
          <Field label="Mobile">
            <input name="mobile" value={form.mobile} onChange={set} className={inp} />
          </Field>
          <Field label="Home phone">
            <input name="phone_home" value={form.phone_home} onChange={set} className={inp} />
          </Field>
        </div>
      </FormSection>

      {/* ── Section: Employment ── */}
      <FormSection title="Employment details" description={`Department, position, ${branch.singular} and employment dates.`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={branch.Singular}>
            <SearchSelect
              className={inp}
              value={form.branch_id}
              onChange={(v) => setForm((p) => ({ ...p, branch_id: v ? Number(v) : 0 }))}
              placeholder={`— Select ${branch.singular} —`}
              options={branches.filter((b) => !b.is_agency || b.id === form.branch_id).map((b) => ({ value: String(b.id), label: b.name }))}
            />
          </Field>
          <Field label="Department">
            <SearchSelect
              className={inp}
              value={form.department_id}
              onChange={(v) => setForm((p) => ({ ...p, department_id: v ? Number(v) : 0 }))}
              placeholder="— Select department —"
              options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
            />
          </Field>
          <Field label="Position">
            <SearchSelect
              className={inp}
              value={form.position_id}
              onChange={(v) => setForm((p) => ({ ...p, position_id: v ? Number(v) : 0 }))}
              placeholder="— Select position —"
              options={positions.map((p) => ({ value: String(p.id), label: p.name ?? (p as any).title }))}
            />
          </Field>
          <Field label="Employment type">
            <SearchSelect
              className={inp}
              value={form.employment_type_id}
              onChange={(v) => setForm((p) => ({ ...p, employment_type_id: v ? Number(v) : 0 }))}
              placeholder="— Select type —"
              options={empTypes.map((t) => ({ value: String(t.id), label: t.name }))}
            />
          </Field>
          <Field label="Date hired">
            <input type="date" name="date_hired" value={form.date_hired} onChange={set} className={inp} />
          </Field>
          <Field label="Date regularized">
            <input type="date" name="date_regularized" value={form.date_regularized} onChange={set} className={inp} />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.is_active}
            onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? "bg-slate-900" : "bg-slate-300"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <span className="text-sm font-medium text-slate-700">{form.is_active ? "Active employee" : "Inactive / separated"}</span>
        </div>

        {canConfi && (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={form.is_confidential}
              onClick={() => setForm((p) => ({ ...p, is_confidential: !p.is_confidential }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_confidential ? "bg-amber-600" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_confidential ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <div>
              <span className="text-sm font-medium text-slate-700">Payroll group: {form.is_confidential ? "Confidential" : "Non-confidential"}</span>
              <p className="text-xs text-slate-400">Confidential-group pay is visible to senior HR / IT only (hidden from HR Officers).</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={form.time_in_out_required}
            onClick={() => setForm((p) => ({ ...p, time_in_out_required: !p.time_in_out_required }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.time_in_out_required ? "bg-slate-900" : "bg-teal-600"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.time_in_out_required ? "translate-x-6" : "translate-x-1"}`} />
          </button>
          <div>
            <span className="text-sm font-medium text-slate-700">Time in/out required: {form.time_in_out_required ? "Yes" : "No — always present"}</span>
            <p className="text-xs text-slate-400">Turn off for supervisors/office staff who don&apos;t punch. They&apos;re never marked absent and are credited their scheduled hours automatically.</p>
          </div>
        </div>
      </FormSection>

      {/* ── Section: System ── */}
      <FormSection title="System" description="Biometric device ID for attendance tracking.">
        <div className="max-w-sm">
          <Field label="Biometric ID">
            <input name="biometric_user_id" value={form.biometric_user_id} onChange={set} placeholder="Leave blank to use Employee No." className={inp} />
          </Field>
          <p className="mt-1 text-xs text-slate-400">Matches this person to their punches on the biometric terminal.</p>
        </div>
      </FormSection>

      {/* ── Footer ── */}
      {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between border-t border-slate-200 pt-5">
        <button type="button" onClick={() => router.back()} className="text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending || saved}
          className="rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60 transition"
        >
          {saved ? "Saved ✓" : mutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

const inp = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 transition";

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <div className="mb-5 border-b border-slate-100 pb-4">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-400">{description}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
