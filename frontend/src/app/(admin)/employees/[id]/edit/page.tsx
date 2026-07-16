"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import { getEmployee, updateEmployee, getLookup, type EmployeeCreateInput } from "@/lib/employees";
import { getMe } from "@/lib/auth";

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
    });
  }

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canConfi = me?.user.permissions.includes("employee.view.sensitive") ?? false;

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
            <select name="gender" value={form.gender} onChange={set} className={inp}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Civil status">
            <select name="civil_status" value={form.civil_status} onChange={set} className={inp}>
              <option value="">Select</option>
              <option value="single">Single</option>
              <option value="married">Married</option>
              <option value="widowed">Widowed</option>
              <option value="separated">Separated</option>
              <option value="divorced">Divorced</option>
            </select>
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
      <FormSection title="Employment details" description="Department, position, branch and employment dates.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Branch">
            <select name="branch_id" value={form.branch_id} onChange={set} className={inp}>
              <option value="">— Select branch —</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select name="department_id" value={form.department_id} onChange={set} className={inp}>
              <option value="">— Select department —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Position">
            <select name="position_id" value={form.position_id} onChange={set} className={inp}>
              <option value="">— Select position —</option>
              {positions.map((p) => <option key={p.id} value={p.id}>{p.name ?? (p as any).title}</option>)}
            </select>
          </Field>
          <Field label="Employment type">
            <select name="employment_type_id" value={form.employment_type_id} onChange={set} className={inp}>
              <option value="">— Select type —</option>
              {empTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
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
