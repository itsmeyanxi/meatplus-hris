"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { forwardRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createEmployee, getLookup, type LookupItem } from "@/lib/employees";
import { usersApi, ROLE_LABELS, type Role } from "@/lib/users";

// ── schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  employee_no:        z.string().min(1, "Required").max(30),
  first_name:         z.string().min(1, "Required"),
  middle_name:        z.string().optional(),
  last_name:          z.string().min(1, "Required"),
  suffix:             z.string().optional(),
  birth_date:         z.string().min(1, "Required"),
  gender:             z.enum(["male", "female", "other"]),
  civil_status:       z.enum(["single", "married", "widowed", "separated", "divorced"]),
  nationality:        z.string().default("Filipino"),
  email_personal:     z.string().email("Invalid email").optional().or(z.literal("")),
  email_company:      z.string().email("Invalid email").optional().or(z.literal("")),
  mobile:             z.string().optional(),
  city:               z.string().optional(),
  province:           z.string().optional(),
  branch_id:          z.coerce.number().min(1, "Required"),
  department_id:      z.coerce.number().min(1, "Required"),
  position_id:        z.coerce.number().min(1, "Required"),
  employment_type_id: z.coerce.number().min(1, "Required"),
  date_hired:         z.string().min(1, "Required"),
  create_account:     z.boolean().default(false),
  role:               z.string().optional(),
});

type FormInput  = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const ASSIGNABLE_ROLES: Role[] = [
  "hr_admin","hr_coordinator","payroll_officer","dept_head",
  "supervisor","team_lead","dept_admin","employee",
  "timekeeper","transport_access","sales_employee","garahe_teamlead",
];

type SectionKey = "basic" | "work" | "contact" | "portal";

type SectionDef = {
  key: SectionKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  isComplete: (v: Partial<FormValues>) => boolean;
};

// ── icons (white fill for header row) ────────────────────────────────────────

const IconBasic = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);
const IconWork = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const IconContact = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
const IconPortal = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

// ── page ──────────────────────────────────────────────────────────────────────

export default function EmployeeRegistrationPage() {
  const qc = useQueryClient();
  const [active, setActive]   = useState<SectionKey | null>(null);
  const [result, setResult]   = useState<RegistrationResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: branches }        = useQuery({ queryKey: ["branches"],         queryFn: () => getLookup("branches") });
  const { data: departments }     = useQuery({ queryKey: ["departments"],      queryFn: () => getLookup("departments") });
  const { data: employmentTypes } = useQuery({ queryKey: ["employment-types"], queryFn: () => getLookup("employment-types") });

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nationality: "Filipino", gender: "male", civil_status: "single", create_account: false },
  });

  const departmentId   = form.watch("department_id");
  const createAccount  = form.watch("create_account");
  const watched        = form.watch();

  const { data: positions } = useQuery({
    queryKey: ["positions", departmentId],
    queryFn: () => getLookup("positions", departmentId ? { department_id: Number(departmentId) } : {}),
    enabled: !!departmentId,
  });

  const SECTIONS: SectionDef[] = [
    {
      key: "basic", label: "Basic Information", description: "Name, birth date, gender & civil status",
      icon: <IconBasic />,
      isComplete: (v) => !!(v.employee_no && v.first_name && v.last_name && v.birth_date && v.gender && v.civil_status),
    },
    {
      key: "work", label: "Work Information", description: "Branch, department, position & hire date",
      icon: <IconWork />,
      isComplete: (v) => !!(v.branch_id && v.department_id && v.position_id && v.employment_type_id && v.date_hired),
    },
    {
      key: "contact", label: "Contact Information", description: "Email addresses, mobile & address",
      icon: <IconContact />,
      isComplete: (v) => !!(v.email_personal || v.email_company || v.mobile),
    },
    {
      key: "portal", label: "Portal Access & Role", description: "System login and role assignment (optional)",
      icon: <IconPortal />,
      isComplete: () => true,
    },
  ];

  const completedCount = SECTIONS.filter((s) => s.isComplete(watched as Partial<FormValues>)).length;
  const allRequired    = SECTIONS.slice(0, 2).every((s) => s.isComplete(watched as Partial<FormValues>));

  const register = useMutation({
    mutationFn: async (values: FormValues) => {
      const emp  = await createEmployee(values);
      let tempPassword: string | undefined;
      let userId: number | undefined;
      if (values.create_account) {
        const prov = await usersApi.provisionForEmployee(emp.id);
        tempPassword = prov.temporary_password;
        userId       = prov.user.id;
      }
      if (userId && values.role) {
        await usersApi.update(userId, { roles: [values.role as Role] });
      }
      return {
        employeeId:   emp.id,
        employeeName: `${emp.first_name} ${emp.last_name}`,
        employeeNo:   emp.employee_no,
        tempPassword,
        roleAssigned: values.role ? (ROLE_LABELS[values.role as Role] ?? values.role) : undefined,
      };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setResult(res);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const fieldErrors = e?.response?.data?.errors;
      if (fieldErrors) {
        Object.entries(fieldErrors).forEach(([k, msgs]) =>
          form.setError(k as keyof FormValues, { message: msgs[0] }),
        );
        // open the first section that has an error
        const errKey = Object.keys(fieldErrors)[0];
        const basicFields = ["employee_no","first_name","last_name","birth_date","gender","civil_status","middle_name","suffix","nationality"];
        const workFields  = ["branch_id","department_id","position_id","employment_type_id","date_hired"];
        if (basicFields.some((f) => fieldErrors[f])) setActive("basic");
        else if (workFields.some((f) => fieldErrors[f])) setActive("work");
        else setActive("contact");
        void errKey;
      }
      setServerError(e?.response?.data?.message ?? "Registration failed. Please check all required fields.");
    },
  });

  if (result) {
    return <SuccessScreen result={result} onAnother={() => { setResult(null); form.reset(); setActive(null); }} />;
  }

  const toggle = (key: SectionKey) => setActive((prev) => (prev === key ? null : key));

  return (
    <div className="max-w-2xl space-y-0">

      {/* ── Module header (reference-style) ── */}
      <div className="rounded-t-2xl overflow-hidden bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-950 dark:to-slate-900 px-6 py-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white tracking-tight">Employee Registration</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {completedCount} of {SECTIONS.length} sections filled
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress ring */}
          <div className="relative h-10 w-10">
            <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke={allRequired ? "#34d399" : "#60a5fa"}
                strokeWidth="3"
                strokeDasharray={`${(completedCount / SECTIONS.length) * 94.2} 94.2`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
              {completedCount}/{SECTIONS.length}
            </span>
          </div>
          <Link
            href="/employees"
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
          >
            ← Back
          </Link>
        </div>
      </div>

      {/* ── Section list ── */}
      <form onSubmit={form.handleSubmit((v) => { setServerError(null); register.mutate(v); })} noValidate>
        <div className="border-x border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
          {SECTIONS.map((section, idx) => {
            const isOpen      = active === section.key;
            const isComplete  = section.isComplete(watched as Partial<FormValues>);
            const hasError    = Object.keys(form.formState.errors).some((k) => {
              const basicFields   = ["employee_no","first_name","last_name","birth_date","gender","civil_status"];
              const workFields    = ["branch_id","department_id","position_id","employment_type_id","date_hired"];
              const contactFields = ["email_personal","email_company","mobile"];
              if (section.key === "basic")   return basicFields.includes(k);
              if (section.key === "work")    return workFields.includes(k);
              if (section.key === "contact") return contactFields.includes(k);
              return false;
            });

            return (
              <div key={section.key} className={`bg-white dark:bg-slate-900 ${isOpen ? "shadow-inner" : ""}`}>
                {/* Section row header */}
                <button
                  type="button"
                  onClick={() => toggle(section.key)}
                  className={`w-full flex items-center gap-4 px-5 py-4 text-left transition group ${
                    isOpen
                      ? "bg-slate-50 dark:bg-slate-800/60"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  {/* Number + icon */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                    isComplete
                      ? "bg-emerald-500 text-white"
                      : isOpen
                        ? "bg-slate-800 dark:bg-white text-white dark:text-slate-900"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}>
                    {isComplete ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      section.icon
                    )}
                  </div>

                  {/* Labels */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className={`text-sm font-semibold ${
                        hasError ? "text-red-600 dark:text-red-400" : "text-slate-800 dark:text-slate-100"
                      }`}>
                        {section.label}
                        {hasError && <span className="ml-2 text-xs font-normal text-red-500">· has errors</span>}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{section.description}</p>
                  </div>

                  {/* Status + chevron */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isComplete && !isOpen && (
                      <span className="rounded-full bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Done
                      </span>
                    )}
                    <svg
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-5">
                    {section.key === "basic"   && <BasicSection   form={form} />}
                    {section.key === "work"    && <WorkSection    form={form} branches={branches} departments={departments} positions={positions} employmentTypes={employmentTypes} />}
                    {section.key === "contact" && <ContactSection form={form} />}
                    {section.key === "portal"  && <PortalSection  form={form} createAccount={createAccount} />}
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActive(null)}
                        className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-700 dark:hover:bg-slate-100 transition"
                      >
                        Done with this section
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Bottom action bar ── */}
        <div className="rounded-b-2xl border border-t-0 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 px-5 py-4">
          {serverError && (
            <p className="mb-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {serverError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {allRequired
                ? "Basic & work info complete — ready to register."
                : "Complete Basic Information and Work Information to register."}
            </p>
            <div className="flex gap-2">
              <Link
                href="/employees"
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={register.isPending || !allRequired}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition"
              >
                {register.isPending ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Registering…
                  </>
                ) : "Save & Register"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Section contents ──────────────────────────────────────────────────────────

type FF = ReturnType<typeof useForm<FormInput, unknown, FormValues>>;

function BasicSection({ form }: { form: FF }) {
  const E = form.formState.errors;
  return (
    <Grid>
      <Field label="Employee No *" error={E.employee_no?.message}>
        <Input {...form.register("employee_no")} placeholder="e.g. 00453" />
      </Field>
      <Field label="First Name *" error={E.first_name?.message}>
        <Input {...form.register("first_name")} />
      </Field>
      <Field label="Middle Name">
        <Input {...form.register("middle_name")} />
      </Field>
      <Field label="Last Name *" error={E.last_name?.message}>
        <Input {...form.register("last_name")} />
      </Field>
      <Field label="Suffix">
        <Input {...form.register("suffix")} placeholder="Jr., III…" />
      </Field>
      <Field label="Birth Date *" error={E.birth_date?.message}>
        <Input type="date" {...form.register("birth_date")} />
      </Field>
      <Field label="Gender *">
        <Select {...form.register("gender")}>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </Select>
      </Field>
      <Field label="Civil Status *">
        <Select {...form.register("civil_status")}>
          <option value="single">Single</option>
          <option value="married">Married</option>
          <option value="widowed">Widowed</option>
          <option value="separated">Separated</option>
          <option value="divorced">Divorced</option>
        </Select>
      </Field>
      <Field label="Nationality">
        <Input {...form.register("nationality")} />
      </Field>
    </Grid>
  );
}

function WorkSection({ form, branches, departments, positions, employmentTypes }: {
  form: FF;
  branches?: LookupItem[];
  departments?: LookupItem[];
  positions?: LookupItem[];
  employmentTypes?: LookupItem[];
}) {
  const E = form.formState.errors;
  const deptId = form.watch("department_id");
  return (
    <Grid>
      <Field label="Branch *" error={E.branch_id?.message}>
        <Select {...form.register("branch_id")}>
          <option value="">Select branch…</option>
          {branches?.map((b) => <option key={b.id} value={b.id}>{b.name ?? b.title}</option>)}
        </Select>
      </Field>
      <Field label="Department *" error={E.department_id?.message}>
        <Select {...form.register("department_id")}>
          <option value="">Select department…</option>
          {departments?.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.title}</option>)}
        </Select>
      </Field>
      <Field label="Position *" error={E.position_id?.message}>
        <Select {...form.register("position_id")} disabled={!deptId}>
          <option value="">{deptId ? "Select position…" : "Pick department first"}</option>
          {positions?.map((p) => <option key={p.id} value={p.id}>{p.title ?? p.name}</option>)}
        </Select>
      </Field>
      <Field label="Employment Type *" error={E.employment_type_id?.message}>
        <Select {...form.register("employment_type_id")}>
          <option value="">Select type…</option>
          {employmentTypes?.map((t) => <option key={t.id} value={t.id}>{t.name ?? t.title}</option>)}
        </Select>
      </Field>
      <Field label="Date Hired *" error={E.date_hired?.message}>
        <Input type="date" {...form.register("date_hired")} />
      </Field>
    </Grid>
  );
}

function ContactSection({ form }: { form: FF }) {
  const E = form.formState.errors;
  return (
    <Grid>
      <Field label="Personal Email" error={E.email_personal?.message}>
        <Input type="email" {...form.register("email_personal")} />
      </Field>
      <Field label="Company Email" error={E.email_company?.message}>
        <Input type="email" {...form.register("email_company")} />
      </Field>
      <Field label="Mobile">
        <Input {...form.register("mobile")} placeholder="09XX XXX XXXX" />
      </Field>
      <Field label="City">
        <Input {...form.register("city")} />
      </Field>
      <Field label="Province">
        <Input {...form.register("province")} />
      </Field>
    </Grid>
  );
}

function PortalSection({ form, createAccount }: { form: FF; createAccount: boolean | undefined }) {
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
        <input type="checkbox" className="h-4 w-4 rounded accent-slate-900" {...form.register("create_account")} />
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Create portal account</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Generates a temporary password the employee uses to log in for the first time.</p>
        </div>
      </label>

      {createAccount && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2.5">
            <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              The temporary password will be shown after registration. Share it with the employee to complete their setup.
            </p>
          </div>
          <Field label="Assign System Role">
            <Select {...form.register("role")}>
              <option value="">No role yet</option>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

type RegistrationResult = {
  employeeId:   number;
  employeeName: string;
  employeeNo:   string;
  tempPassword?: string;
  roleAssigned?: string;
};

function SuccessScreen({ result, onAnother }: { result: RegistrationResult; onAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!result.tempPassword) return;
    navigator.clipboard.writeText(result.tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="max-w-lg mx-auto py-10 space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Employee Registered</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Record created successfully.</p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
        <ResultRow label="Name"        value={result.employeeName} />
        <ResultRow label="Employee No." value={result.employeeNo} mono />
        {result.tempPassword && (
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Temporary Password</p>
              <p className="mt-0.5 font-mono text-sm font-semibold tracking-widest text-slate-800 dark:text-slate-100">{result.tempPassword}</p>
            </div>
            <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
              {copied
                ? <><svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Copied</>
                : <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>}
            </button>
          </div>
        )}
        {result.roleAssigned && <ResultRow label="Role Assigned" value={result.roleAssigned} />}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/employees/${result.employeeId}`} className="flex-1 flex items-center justify-center rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition">
          View Profile
        </Link>
        <button onClick={onAnother} className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition">
          Register Another
        </button>
      </div>
    </div>
  );
}

function ResultRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`text-sm font-semibold text-slate-800 dark:text-slate-100 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

// ── primitives ────────────────────────────────────────────────────────────────

const baseCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-slate-500 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:focus:ring-slate-700 transition disabled:opacity-50 disabled:cursor-not-allowed";

const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => <input ref={ref} className={baseCls} {...props} />,
);
Input.displayName = "Input";

const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  (props, ref) => <select ref={ref} className={baseCls} {...props} />,
);
Select.displayName = "Select";

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">{children}</div>;
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
