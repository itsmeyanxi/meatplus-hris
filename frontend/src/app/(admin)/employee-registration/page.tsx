"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { forwardRef, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { employeeSchedulesApi, workSchedulesApi } from "@/lib/attendance";
import { getMe } from "@/lib/auth";
import { educationApi, employeeLocationsApi, governmentIdsApi, performanceApi, photoApi } from "@/lib/employee-relations";
import { createEmployee, getLookup, listEmployees, type EmployeeListItem, type LookupItem } from "@/lib/employees";
import { usersApi, ROLE_LABELS, type Role } from "@/lib/users";

// ── schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  // Basic
  employee_no:        z.string().min(1, "Required").max(30),
  first_name:         z.string().min(1, "Required"),
  middle_name:        z.string().optional(),
  last_name:          z.string().min(1, "Required"),
  suffix:             z.string().optional(),
  birth_date:         z.string().min(1, "Required"),
  gender:             z.enum(["male", "female", "other"]),
  civil_status:       z.enum(["single", "married", "widowed", "separated", "divorced"]),
  nationality:        z.string().default("Filipino"),

  // Work — Basic Job Information
  company_id:           z.coerce.number().min(1, "Required"),
  department_id:        z.coerce.number().min(1, "Required"),
  position_id:          z.coerce.number().min(1, "Required"),
  employee_type:        z.enum(["", "rank_and_file", "supervisory", "managerial", "executive"]).optional(),
  manager_employee_id:  z.union([z.coerce.number(), z.literal("")]).optional(),
  designated_workplace: z.string().optional(),

  // Work — Employment Details
  employment_type_id:   z.coerce.number().min(1, "Required"),   // "Employment Status" in the reference
  user_type:            z.enum(["", "employee", "manager", "admin"]).optional(),
  job_code:             z.string().optional(),
  job_grade:            z.string().optional(),
  client_name:          z.string().optional(),
  billability:          z.enum(["", "billable", "non_billable"]).optional(),
  date_hired:                  z.string().min(1, "Required"),
  expected_regularization_date: z.string().optional(),
  date_regularized:            z.string().optional(),

  // Work — Other Information
  // Biometric ID is *not* required, unlike the reference: only 2 of 113 existing
  // employees have one, and the server rule is nullable. Requiring it here would
  // block registering anyone who is not enrolled on a device.
  remarks:            z.string().max(300, "Maximum 300 characters").optional(),
  biometric_user_id:  z.string().optional(),
  payroll_run_type:   z.enum(["", "monthly", "semi_monthly", "weekly", "daily"]).optional(),

  // Locations
  branch_id:          z.coerce.number().min(1, "Required"),
  city:               z.string().optional(),
  province:           z.string().optional(),
  postal_code:        z.string().optional(),

  // Work schedule (optional — assigned after the employee exists)
  work_schedule_id:   z.union([z.coerce.number(), z.literal("")]).optional(),
  schedule_from:      z.string().optional(),

  // Government information (optional)
  tin:                z.string().optional(),
  sss_no:             z.string().optional(),
  philhealth_no:      z.string().optional(),
  pagibig_no:         z.string().optional(),
  prc_no:             z.string().optional(),
  prc_expiry:         z.string().optional(),

  // Educational background (optional — one entry at registration)
  edu_level:          z.enum(["", "elementary", "secondary", "vocational", "tertiary", "graduate"]).optional(),
  edu_school:         z.string().optional(),
  edu_degree:         z.string().optional(),
  edu_year_from:      z.string().optional(),
  edu_year_to:        z.string().optional(),
  edu_honors:         z.string().optional(),

  // Performance management (optional — one review at registration)
  perf_start:         z.string().optional(),
  perf_end:           z.string().optional(),
  perf_rating:        z.string().optional(),
  perf_rating_label:  z.string().optional(),
  perf_remarks:       z.string().optional(),
  perf_next_review:   z.string().optional(),

  // Contact
  email_personal:     z.string().email("Invalid email").optional().or(z.literal("")),
  email_company:      z.string().email("Invalid email").optional().or(z.literal("")),
  mobile:             z.string().optional(),
  phone_home:         z.string().optional(),

  // Portal
  create_account:     z.boolean().default(false),
  role:               z.string().optional(),
}).refine(
  (v) => !v.date_regularized || !v.date_hired || v.date_regularized >= v.date_hired,
  { path: ["date_regularized"], message: "Must be on or after the hire date" },
).refine(
  (v) => !v.expected_regularization_date || !v.date_hired || v.expected_regularization_date >= v.date_hired,
  { path: ["expected_regularization_date"], message: "Must be on or after the hire date" },
);

type FormInput  = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

const ASSIGNABLE_ROLES: Role[] = [
  "hr_admin","hr_coordinator","payroll_officer","dept_head",
  "supervisor","team_lead","dept_admin","employee",
  "timekeeper","transport_access","sales_employee","garahe_teamlead",
];

type SectionKey =
  | "basic" | "work" | "locations" | "schedule"
  | "government" | "education" | "performance" | "contact" | "portal";

type SectionDef = {
  key: SectionKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  required?: boolean;
  isComplete: (v: Partial<FormValues>) => boolean;
};

// ── icons ─────────────────────────────────────────────────────────────────────

const icon = (d: string) => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const IconBasic       = () => icon("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z");
const IconWork        = () => icon("M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z");
const IconLocation    = () => icon("M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z");
const IconSchedule    = () => icon("M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z");
const IconGovernment  = () => icon("M12 3l9 6H3l9-6zM5 10v8m4-8v8m6-8v8m4-8v8M3 21h18");
const IconEducation   = () => icon("M12 14l9-5-9-5-9 5 9 5zm0 0v7m-6-3.5V12l6 3 6-3v5.5");
const IconPerformance = () => icon("M3 3v18h18M7 15l3-3 3 3 5-6");
const IconContact     = () => icon("M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11 11 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z");
const IconPortal      = () => icon("M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z");

// Section layout follows the reference (one row per section, icon on the left),
// but the palette is this app's: slate surfaces, emerald for "done".

// ── page ──────────────────────────────────────────────────────────────────────

export default function EmployeeRegistrationPage() {
  const qc = useQueryClient();
  const [active, setActive]           = useState<SectionKey | null>("basic");
  const [result, setResult]           = useState<RegistrationResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // The photo can only be uploaded once the employee row exists, so hold the
  // chosen file (and a local preview) until after registration.
  const [photoFile, setPhotoFile]       = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError]     = useState<string | null>(null);

  // Worksites are rows, not a single select. The first is the primary and mirrors
  // employees.branch_id, which DTR and reports still read.
  type PickedLocation = { branch_id: number; designated_workplace: string };
  const [locations, setLocations] = useState<PickedLocation[]>([]);

  const addLocation = (branchId: number) => {
    if (!branchId || locations.some((l) => l.branch_id === branchId)) return;
    const next = [...locations, { branch_id: branchId, designated_workplace: "" }];
    setLocations(next);
    form.setValue("branch_id", next[0].branch_id, { shouldValidate: true });
  };
  const removeLocation = (branchId: number) => {
    const next = locations.filter((l) => l.branch_id !== branchId);
    setLocations(next);
    form.setValue("branch_id", (next[0]?.branch_id ?? "") as unknown as number, { shouldValidate: true });
  };
  const setWorkplace = (branchId: number, value: string) =>
    setLocations((ls) => ls.map((l) => (l.branch_id === branchId ? { ...l, designated_workplace: value } : l)));

  const pickPhoto = (file: File | null) => {
    setPhotoError(null);
    if (!file) { setPhotoFile(null); setPhotoPreview(null); return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setPhotoError("Use a JPG, PNG or WEBP image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("Image must be 2 MB or smaller.");
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const { data: workSchedules } = useQuery({ queryKey: ["work-schedules"], queryFn: () => workSchedulesApi.list() });
  const { data: me }           = useQuery({ queryKey: ["me"],             queryFn: getMe });
  const { data: companies }    = useQuery({ queryKey: ["companies"],      queryFn: () => getLookup("companies") });


  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nationality: "Filipino", gender: "male", civil_status: "single", create_account: false },
  });

  const companyId     = form.watch("company_id");
  const departmentId  = form.watch("department_id");
  const createAccount = form.watch("create_account");
  const watched       = form.watch();

  // Branch, department and position all belong to the chosen company, so every
  // lookup is keyed by it and refetches when it changes.
  const cid = companyId ? Number(companyId) : undefined;

  const { data: branches } = useQuery({
    queryKey: ["branches", cid],
    queryFn: () => getLookup("branches", cid ? { company_id: cid } : {}),
    enabled: !!cid,
  });
  const { data: departments } = useQuery({
    queryKey: ["departments", cid],
    queryFn: () => getLookup("departments", cid ? { company_id: cid } : {}),
    enabled: !!cid,
  });
  const { data: employmentTypes } = useQuery({
    queryKey: ["employment-types", cid],
    queryFn: () => getLookup("employment-types", cid ? { company_id: cid } : {}),
    enabled: !!cid,
  });
  const { data: positions } = useQuery({
    queryKey: ["positions", cid, departmentId],
    queryFn: () => getLookup("positions", {
      ...(cid ? { company_id: cid } : {}),
      ...(departmentId ? { department_id: Number(departmentId) } : {}),
    }),
    enabled: !!cid && !!departmentId,
  });

  // Immediate supervisor must be an employee of the chosen company.
  const { data: supervisors } = useQuery({
    queryKey: ["employees", "supervisor-options", cid],
    queryFn: () => listEmployees({ perPage: 200, onlyActive: true, companyId: cid }),
    enabled: !!cid,
  });

  // Default to the active company once /me resolves, without clobbering a choice.
  useEffect(() => {
    const active = me?.user.active_company?.id;
    if (active && !form.getValues("company_id")) {
      form.setValue("company_id", active);
    }
  }, [me, form]);

  // Branch, department, position and worksites belong to the previous company.
  const prevCompany = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (prevCompany.current !== undefined && prevCompany.current !== cid) {
      form.setValue("branch_id", "" as unknown as number);
      form.setValue("department_id", "" as unknown as number);
      form.setValue("position_id", "" as unknown as number);
      form.setValue("employment_type_id", "" as unknown as number);
      form.setValue("manager_employee_id", "");
      setLocations([]);
    }
    prevCompany.current = cid;
  }, [cid, form]);

  const SECTIONS: SectionDef[] = [
    { key: "basic", label: "Basic Information", description: "Name, birth date, gender & civil status",
      icon: <IconBasic />, required: true,
      isComplete: (v) => !!(v.employee_no && v.first_name && v.last_name && v.birth_date) },
    { key: "work", label: "Work Information", description: "Company, department, position & hire date",
      icon: <IconWork />, required: true,
      isComplete: (v) => !!(v.company_id && v.department_id && v.position_id && v.employment_type_id && v.date_hired) },
    { key: "locations", label: "Locations", description: "Branch or worksite & address",
      icon: <IconLocation />, required: true,
      isComplete: (v) => !!v.branch_id },
    { key: "schedule", label: "Work Schedule", description: "Shift pattern & effective date",
      icon: <IconSchedule />,
      isComplete: (v) => !!(v.work_schedule_id && v.schedule_from) },
    { key: "government", label: "Government Information", description: "TIN, SSS, PhilHealth & Pag-IBIG",
      icon: <IconGovernment />,
      isComplete: (v) => !!(v.tin || v.sss_no || v.philhealth_no || v.pagibig_no) },
    { key: "education", label: "Educational Background", description: "School, degree & years attended",
      icon: <IconEducation />,
      isComplete: (v) => !!(v.edu_level && v.edu_school) },
    { key: "performance", label: "Performance Management", description: "Review period, rating & remarks",
      icon: <IconPerformance />,
      isComplete: (v) => !!(v.perf_start && v.perf_end) },
    { key: "contact", label: "Contact Information", description: "Email addresses & phone numbers",
      icon: <IconContact />,
      isComplete: (v) => !!(v.email_personal || v.email_company || v.mobile) },
    { key: "portal", label: "Portal Access & Role", description: "System login and role assignment (optional)",
      icon: <IconPortal />,
      isComplete: (v) => !!v.create_account },
  ];

  const requiredDone = SECTIONS.filter((s) => s.required).every((s) => s.isComplete(watched as Partial<FormValues>));
  const filledCount  = SECTIONS.filter((s) => s.isComplete(watched as Partial<FormValues>)).length;

  const register = useMutation({
    mutationFn: async (v: FormValues) => {
      const emp = await createEmployee({
        company_id: v.company_id,
        employee_no: v.employee_no,
        first_name: v.first_name,
        middle_name: v.middle_name || null,
        last_name: v.last_name,
        suffix: v.suffix || null,
        birth_date: v.birth_date,
        gender: v.gender,
        civil_status: v.civil_status,
        nationality: v.nationality,
        email_personal: v.email_personal || null,
        email_company: v.email_company || null,
        mobile: v.mobile || null,
        phone_home: v.phone_home || null,
        city: v.city || null,
        province: v.province || null,
        postal_code: v.postal_code || null,
        branch_id: v.branch_id,
        department_id: v.department_id,
        position_id: v.position_id,
        employment_type_id: v.employment_type_id,
        manager_employee_id: v.manager_employee_id ? Number(v.manager_employee_id) : null,
        employee_type: v.employee_type || null,
        user_type: v.user_type || null,
        job_code: v.job_code || null,
        job_grade: v.job_grade || null,
        client_name: v.client_name || null,
        billability: v.billability || null,
        designated_workplace: v.designated_workplace || null,
        payroll_run_type: v.payroll_run_type || null,
        remarks: v.remarks || null,
        biometric_user_id: v.biometric_user_id || null,
        date_hired: v.date_hired,
        expected_regularization_date: v.expected_regularization_date || null,
        date_regularized: v.date_regularized || null,
      });

      // The employee record must exist before its related rows can be attached.
      // Each optional section is skipped when left blank; a failure here should
      // not discard the employee that was just created.
      const warnings: string[] = [];
      const attach = async (what: string, fn: () => Promise<unknown>) => {
        try { await fn(); } catch { warnings.push(what); }
      };

      if (photoFile) {
        await attach("Employee photo", () => photoApi.upload(emp.id, photoFile));
      }

      // Row 0 is the primary; the API keeps employees.branch_id in step.
      for (const [i, loc] of locations.entries()) {
        await attach(`Location ${i + 1}`, () =>
          employeeLocationsApi.create(emp.id, {
            branch_id: loc.branch_id,
            designated_workplace: loc.designated_workplace || null,
            is_primary: i === 0,
          }));
      }

      if (v.tin || v.sss_no || v.philhealth_no || v.pagibig_no || v.prc_no) {
        await attach("Government information", () =>
          governmentIdsApi.save(emp.id, {
            tin: v.tin || null,
            sss_no: v.sss_no || null,
            philhealth_no: v.philhealth_no || null,
            pagibig_no: v.pagibig_no || null,
            prc_no: v.prc_no || null,
            prc_expiry: v.prc_expiry || null,
          }));
      }

      if (v.edu_level && v.edu_school) {
        await attach("Educational background", () =>
          educationApi.create(emp.id, {
            level: v.edu_level as Exclude<FormValues["edu_level"], "" | undefined>,
            school: v.edu_school!,
            degree: v.edu_degree || null,
            year_from: v.edu_year_from ? Number(v.edu_year_from) : null,
            year_to: v.edu_year_to ? Number(v.edu_year_to) : null,
            honors: v.edu_honors || null,
          }));
      }

      if (v.perf_start && v.perf_end) {
        await attach("Performance review", () =>
          performanceApi.create(emp.id, {
            review_period_start: v.perf_start!,
            review_period_end: v.perf_end!,
            rating: v.perf_rating ? Number(v.perf_rating) : null,
            rating_label: v.perf_rating_label || null,
            remarks: v.perf_remarks || null,
            next_review_date: v.perf_next_review || null,
          }));
      }

      if (v.work_schedule_id && v.schedule_from) {
        await attach("Work schedule", () =>
          employeeSchedulesApi.create(emp.id, {
            work_schedule_id: Number(v.work_schedule_id),
            effective_from: v.schedule_from!,
          }));
      }

      let tempPassword: string | undefined;
      let userId: number | undefined;
      if (v.create_account) {
        const prov = await usersApi.provisionForEmployee(emp.id);
        tempPassword = prov.temporary_password;
        userId = prov.user.id;
      }
      if (userId && v.role) {
        await usersApi.update(userId, { roles: [v.role as Role] });
      }

      return {
        employeeId: emp.id,
        employeeName: `${emp.first_name} ${emp.last_name}`,
        employeeNo: emp.employee_no,
        tempPassword,
        roleAssigned: v.role ? (ROLE_LABELS[v.role as Role] ?? v.role) : undefined,
        warnings,
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
        const basic = ["employee_no","first_name","last_name","birth_date","gender","civil_status"];
        const work  = ["department_id","position_id","employment_type_id","date_hired"];
        if (basic.some((f) => fieldErrors[f])) setActive("basic");
        else if (work.some((f) => fieldErrors[f])) setActive("work");
        else if (fieldErrors.branch_id) setActive("locations");
        else setActive("contact");
      }
      setServerError(e?.response?.data?.message ?? "Registration failed. Please check the required fields.");
    },
  });

  // The photo lives outside react-hook-form, so it must be cleared explicitly —
  // otherwise it would silently attach to the next employee registered.
  const clearPhoto = () => { setPhotoFile(null); setPhotoPreview(null); setPhotoError(null); };

  if (result) {
    return (
      <SuccessScreen
        result={result}
        onAnother={() => { setResult(null); form.reset(); clearPhoto(); setLocations([]); setActive("basic"); }}
      />
    );
  }

  const toggle = (key: SectionKey) => setActive((prev) => (prev === key ? null : key));
  const reset  = () => { form.reset(); clearPhoto(); setLocations([]); setServerError(null); setActive("basic"); };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Module header */}
      <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5 dark:from-slate-950 dark:to-slate-900">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-white">Employee Registration</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {requiredDone
              ? "Required sections complete — ready to register."
              : "Basic, Work and Locations are required."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10">
            <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15" fill="none"
                stroke={requiredDone ? "#34d399" : "#60a5fa"}
                strokeWidth="3"
                strokeDasharray={`${(filledCount / SECTIONS.length) * 94.2} 94.2`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
              {filledCount}/{SECTIONS.length}
            </span>
          </div>
          <Link
            href="/employees"
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
          >
            ← Back
          </Link>
        </div>
      </div>

      <form onSubmit={form.handleSubmit((v) => { setServerError(null); register.mutate(v); })} noValidate>
        <div className="divide-y divide-slate-100 border-x border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {SECTIONS.map((section, idx) => {
            const isOpen     = active === section.key;
            const isComplete = section.isComplete(watched as Partial<FormValues>);

            return (
              <div key={section.key} className="bg-white dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => toggle(section.key)}
                  className={`flex w-full items-center gap-4 px-5 py-4 text-left transition ${
                    isOpen
                      ? "bg-slate-50 dark:bg-slate-800/60"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
                    isComplete
                      ? "bg-emerald-500 text-white"
                      : isOpen
                        ? "bg-slate-800 text-white dark:bg-white dark:text-slate-900"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {isComplete ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : section.icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {section.label}
                        {section.required && <span className="ml-1 text-red-500">*</span>}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{section.description}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isComplete && !isOpen && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                        Done
                      </span>
                    )}
                    <svg
                      className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-5 py-5 dark:border-slate-800">
                    {section.key === "basic"       && (
                      <BasicSection
                        form={form}
                        photoPreview={photoPreview}
                        photoError={photoError}
                        onPickPhoto={pickPhoto}
                      />
                    )}
                    {section.key === "work"        && (
                      <WorkSection
                        form={form}
                        companies={companies}
                        departments={departments}
                        positions={positions}
                        employmentTypes={employmentTypes}
                        supervisors={supervisors?.data}
                      />
                    )}
                    {section.key === "locations"   && (
                      <LocationsSection
                        form={form}
                        branches={branches}
                        locations={locations}
                        onAdd={addLocation}
                        onRemove={removeLocation}
                        onWorkplace={setWorkplace}
                      />
                    )}
                    {section.key === "schedule"    && <ScheduleSection form={form} workSchedules={workSchedules} />}
                    {section.key === "government"  && <GovernmentSection form={form} />}
                    {section.key === "education"   && <EducationSection form={form} />}
                    {section.key === "performance" && <PerformanceSection form={form} />}
                    {section.key === "contact"     && <ContactSection form={form} />}
                    {section.key === "portal"      && <PortalSection form={form} createAccount={createAccount} />}

                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActive(null)}
                        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
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

        {/* Action bar */}
        <div className="rounded-b-2xl border border-t-0 border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-900/80">
          {serverError && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
              {serverError}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Clear form
            </button>
            <div className="flex gap-2">
              <Link
                href="/employees"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={register.isPending || !requiredDone}
                className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
              >
                {register.isPending ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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

function BasicSection({ form, photoPreview, photoError, onPickPhoto }: {
  form: FF;
  photoPreview: string | null;
  photoError: string | null;
  onPickPhoto: (file: File | null) => void;
}) {
  const E = form.formState.errors;
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      {/* Photo */}
      <div className="shrink-0 md:w-44">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
          {photoPreview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoPreview} alt="Employee photo preview" className="h-44 w-full object-cover" />
          ) : (
            <div className="flex h-44 w-full items-center justify-center text-slate-300 dark:text-slate-600">
              <svg className="h-20 w-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>

        <label className="mt-2 flex cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
          {photoPreview ? "Change photo" : "Choose photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
          />
        </label>

        {photoPreview && (
          <button
            type="button"
            onClick={() => onPickPhoto(null)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Remove
          </button>
        )}

        {photoError
          ? <p className="mt-1 text-xs text-red-500">{photoError}</p>
          : <p className="mt-1 text-center text-[11px] text-slate-400 dark:text-slate-500">JPG, PNG or WEBP · max 2 MB</p>}
      </div>

      {/* Fields */}
      <div className="flex-1 space-y-4">
        <Grid>
          <Field label="First Name *" error={E.first_name?.message}>
            <Input {...form.register("first_name")} />
          </Field>
          <Field label="Middle Name"><Input {...form.register("middle_name")} /></Field>
          <Field label="Last Name *" error={E.last_name?.message}>
            <Input {...form.register("last_name")} />
          </Field>
        </Grid>

        <Grid>
          <Field label="System ID">
            <Input value="Assigned on save" disabled readOnly />
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
          <Field label="Date of Birth *" error={E.birth_date?.message}>
            <Input type="date" {...form.register("birth_date")} />
          </Field>
          <Field label="Employee ID *" error={E.employee_no?.message}>
            <Input {...form.register("employee_no")} placeholder="e.g. 00453" />
          </Field>
          <Field label="Suffix"><Input {...form.register("suffix")} placeholder="Jr., III…" /></Field>
          <Field label="Nationality"><Input {...form.register("nationality")} /></Field>
        </Grid>
      </div>
    </div>
  );
}

function WorkSection({ form, companies, departments, positions, employmentTypes, supervisors }: {
  form: FF;
  companies?: LookupItem[];
  departments?: LookupItem[];
  positions?: LookupItem[];
  employmentTypes?: LookupItem[];
  supervisors?: EmployeeListItem[];
}) {
  const E = form.formState.errors;
  const deptId = form.watch("department_id");
  const companySelected = !!form.watch("company_id");

  // Approvers are derived, not stored: HandlesApprovalWorkflow routes a request to
  // the employee's manager and to department heads. Show who that will actually be.
  const managerId = form.watch("manager_employee_id");
  const supervisorName = supervisors?.find((s) => String(s.id) === String(managerId))?.full_name;

  return (
    <div className="space-y-6">
      <div>
        <GroupTitle>Basic Job Information</GroupTitle>
        <Grid>
          <Field label="Company *" error={E.company_id?.message}>
            <Select {...form.register("company_id")}>
              <option value="">Please select…</option>
              {companies?.map((c) => (
                <option key={c.id} value={c.id}>{c.code ? `${c.code} — ${c.name}` : c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Department *" error={E.department_id?.message}>
            <Select {...form.register("department_id")} disabled={!companySelected}>
              <option value="">{companySelected ? "Please select…" : "Pick company first"}</option>
              {departments?.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.title}</option>)}
            </Select>
          </Field>
          <Field label="Job Title *" error={E.position_id?.message}>
            <Select {...form.register("position_id")} disabled={!deptId}>
              <option value="">{deptId ? "Please select…" : "Pick department first"}</option>
              {positions?.map((p) => <option key={p.id} value={p.id}>{p.title ?? p.name}</option>)}
            </Select>
          </Field>
          <Field label="Employee Type">
            <Select {...form.register("employee_type")}>
              <option value="">Select employee type…</option>
              <option value="rank_and_file">Rank &amp; File</option>
              <option value="supervisory">Supervisory</option>
              <option value="managerial">Managerial</option>
              <option value="executive">Executive</option>
            </Select>
          </Field>
          <Field label="Immediate Supervisor">
            <Select {...form.register("manager_employee_id")}>
              <option value="">Search…</option>
              {supervisors?.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name} ({s.employee_no})</option>
              ))}
            </Select>
          </Field>
        </Grid>
        <Hint>Worksites and their designated workplace are set under Locations.</Hint>
      </div>

      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <GroupTitle>Employment Details</GroupTitle>
        <Grid>
          <Field label="Employment Status *" error={E.employment_type_id?.message}>
            <Select {...form.register("employment_type_id")}>
              <option value="">Please select…</option>
              {employmentTypes?.map((t) => <option key={t.id} value={t.id}>{t.name ?? t.title}</option>)}
            </Select>
          </Field>
          <Field label="User Type">
            <Select {...form.register("user_type")}>
              <option value="">Employee</option>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          <Field label="Job Code"><Input {...form.register("job_code")} /></Field>

          <Field label="Job Grade">
            <Select {...form.register("job_grade")}>
              <option value="">Please select…</option>
              {["G1","G2","G3","G4","G5","G6","G7"].map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          </Field>
          <Field label="Client Name"><Input {...form.register("client_name")} /></Field>
          <Field label="Billability">
            <Select {...form.register("billability")}>
              <option value="">Select billability…</option>
              <option value="billable">Billable</option>
              <option value="non_billable">Non-billable</option>
            </Select>
          </Field>

          <Field label="Hire Date *" error={E.date_hired?.message}>
            <Input type="date" {...form.register("date_hired")} />
          </Field>
          <Field label="Expected Regularization Date" error={E.expected_regularization_date?.message}>
            <Input type="date" {...form.register("expected_regularization_date")} />
          </Field>
          <Field label="Regularization Date" error={E.date_regularized?.message}>
            <Input type="date" {...form.register("date_regularized")} />
          </Field>
        </Grid>
        <Hint>
          Employment Status is the employee&apos;s contract type (Regular, Probationary…).
          Both regularization dates must fall on or after the hire date.
        </Hint>

        <div className="mt-4">
          <Field label="Employee Remarks" error={E.remarks?.message}>
            <textarea
              {...form.register("remarks")}
              rows={3}
              maxLength={300}
              className={baseCls}
              placeholder="Notes about this employee's engagement…"
            />
          </Field>
          <p className="mt-1 text-right text-xs text-slate-400 dark:text-slate-500">
            {(form.watch("remarks") ?? "").length}/300
          </p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <GroupTitle>Other Information</GroupTitle>
        <Grid>
          <Field label="Biometric ID" error={E.biometric_user_id?.message}>
            <Input {...form.register("biometric_user_id")} placeholder="Device enrollment number" />
          </Field>
          <Field label="Payroll Run Type">
            <Select {...form.register("payroll_run_type")}>
              <option value="">Please select…</option>
              <option value="monthly">Monthly</option>
              <option value="semi_monthly">Semi-monthly</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </Select>
          </Field>
        </Grid>
        <Hint>
          Biometric ID is the number the ZKTeco device sends with each punch. Optional — leave
          blank until the employee is enrolled on a device.
        </Hint>
      </div>

      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <GroupTitle>Attendance Request Approval</GroupTitle>
        <ApprovalLevels supervisorName={supervisorName} />
      </div>
    </div>
  );
}

type BranchLookup = LookupItem & { latitude?: string | null; longitude?: string | null };

function LocationsSection({ form, branches, locations, onAdd, onRemove, onWorkplace }: {
  form: FF;
  branches?: LookupItem[];
  locations: { branch_id: number; designated_workplace: string }[];
  onAdd: (branchId: number) => void;
  onRemove: (branchId: number) => void;
  onWorkplace: (branchId: number, value: string) => void;
}) {
  const E = form.formState.errors;
  const companySelected = !!form.watch("company_id");
  const byId = (id: number) => (branches as BranchLookup[] | undefined)?.find((b) => b.id === id);
  const unpicked = (branches ?? []).filter((b) => !locations.some((l) => l.branch_id === b.id));

  return (
    <div className="space-y-4">
      {E.branch_id?.message && <p className="text-xs text-red-500">*{E.branch_id.message}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {["Location", "Code", "Latitude & Longitude", "Designated Workplace", ""].map((h) => (
                <th key={h} className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {locations.map((l, i) => {
              const b = byId(l.branch_id);
              const coords = b?.latitude && b?.longitude ? `${b.latitude}, ${b.longitude}` : "—";
              return (
                <tr key={l.branch_id}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">
                    {b?.name ?? b?.title}
                    {i === 0 && (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
                        Primary
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{b?.code ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500 dark:text-slate-400">{coords}</td>
                  <td className="px-4 py-2.5">
                    <Input
                      value={l.designated_workplace}
                      onChange={(e) => onWorkplace(l.branch_id, e.target.value)}
                      placeholder="e.g. 2nd floor, WFH"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(l.branch_id)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}

            <tr>
              <td className="px-4 py-2.5" colSpan={5}>
                <div className="max-w-xs">
                  <Select
                    value=""
                    disabled={!companySelected || unpicked.length === 0}
                    onChange={(e) => onAdd(Number(e.target.value))}
                  >
                    <option value="">
                      {!companySelected
                        ? "Pick a company under Work Information"
                        : unpicked.length === 0
                          ? "All branches added"
                          : "Add Location"}
                    </option>
                    {unpicked.map((b) => <option key={b.id} value={b.id}>{b.name ?? b.title}</option>)}
                  </Select>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Hint>
        The first location is the primary worksite and is what attendance and reports use.
        Remove it and the next one is promoted. Latitude and longitude come from the branch record.
      </Hint>

      <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
        <GroupTitle>Home Address</GroupTitle>
        <Grid>
          <Field label="City"><Input {...form.register("city")} /></Field>
          <Field label="Province"><Input {...form.register("province")} /></Field>
          <Field label="Postal Code"><Input {...form.register("postal_code")} /></Field>
        </Grid>
      </div>
    </div>
  );
}

function ScheduleSection({ form, workSchedules }: { form: FF; workSchedules?: { id: number; name: string; code: string }[] }) {
  return (
    <>
      <Grid>
        <Field label="Work Schedule">
          <Select {...form.register("work_schedule_id")}>
            <option value="">No schedule yet</option>
            {workSchedules?.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
          </Select>
        </Field>
        <Field label="Effective From">
          <Input type="date" {...form.register("schedule_from")} />
        </Field>
      </Grid>
      <Hint>Both fields are needed to assign a schedule. Leave blank to assign one later.</Hint>
    </>
  );
}

function GovernmentSection({ form }: { form: FF }) {
  return (
    <>
      <Grid>
        <Field label="TIN"><Input {...form.register("tin")} placeholder="000-000-000-000" /></Field>
        <Field label="SSS No."><Input {...form.register("sss_no")} /></Field>
        <Field label="PhilHealth No."><Input {...form.register("philhealth_no")} /></Field>
        <Field label="Pag-IBIG No."><Input {...form.register("pagibig_no")} /></Field>
        <Field label="PRC No."><Input {...form.register("prc_no")} /></Field>
        <Field label="PRC Expiry"><Input type="date" {...form.register("prc_expiry")} /></Field>
      </Grid>
      <Hint>Stored encrypted at rest.</Hint>
    </>
  );
}

function EducationSection({ form }: { form: FF }) {
  return (
    <>
      <Grid>
        <Field label="Level">
          <Select {...form.register("edu_level")}>
            <option value="">Select level…</option>
            <option value="elementary">Elementary</option>
            <option value="secondary">Secondary</option>
            <option value="vocational">Vocational</option>
            <option value="tertiary">Tertiary</option>
            <option value="graduate">Graduate</option>
          </Select>
        </Field>
        <Field label="School"><Input {...form.register("edu_school")} /></Field>
        <Field label="Degree / Course"><Input {...form.register("edu_degree")} /></Field>
        <Field label="Year From"><Input type="number" {...form.register("edu_year_from")} placeholder="2015" /></Field>
        <Field label="Year To"><Input type="number" {...form.register("edu_year_to")} placeholder="2019" /></Field>
        <Field label="Honors"><Input {...form.register("edu_honors")} /></Field>
      </Grid>
      <Hint>Level and School are both needed to save an entry. More can be added from the employee profile.</Hint>
    </>
  );
}

function PerformanceSection({ form }: { form: FF }) {
  return (
    <>
      <Grid>
        <Field label="Review Period Start"><Input type="date" {...form.register("perf_start")} /></Field>
        <Field label="Review Period End"><Input type="date" {...form.register("perf_end")} /></Field>
        <Field label="Rating (1–5)">
          <Input type="number" step="0.25" min="1" max="5" {...form.register("perf_rating")} placeholder="4.25" />
        </Field>
        <Field label="Rating Label">
          <Select {...form.register("perf_rating_label")}>
            <option value="">—</option>
            <option value="Outstanding">Outstanding</option>
            <option value="Exceeds Expectations">Exceeds Expectations</option>
            <option value="Meets Expectations">Meets Expectations</option>
            <option value="Needs Improvement">Needs Improvement</option>
            <option value="Unsatisfactory">Unsatisfactory</option>
          </Select>
        </Field>
        <Field label="Next Review Date"><Input type="date" {...form.register("perf_next_review")} /></Field>
      </Grid>
      <div className="mt-4">
        <Field label="Remarks">
          <textarea
            {...form.register("perf_remarks")}
            rows={3}
            className={baseCls}
            placeholder="Strengths, areas for improvement, agreed goals…"
          />
        </Field>
      </div>
      <Hint>Both period dates are needed to save a review. New hires normally have none.</Hint>
    </>
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
      <Field label="Mobile"><Input {...form.register("mobile")} placeholder="09XX XXX XXXX" /></Field>
      <Field label="Home Phone"><Input {...form.register("phone_home")} /></Field>
    </Grid>
  );
}

function PortalSection({ form, createAccount }: { form: FF; createAccount: boolean | undefined }) {
  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-4 transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
        <input type="checkbox" className="h-4 w-4 rounded accent-slate-900" {...form.register("create_account")} />
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Create portal account</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Generates a temporary password the employee uses to log in for the first time.</p>
        </div>
      </label>

      {createAccount && (
        <Field label="Assign System Role">
          <Select {...form.register("role")}>
            <option value="">No role yet</option>
            {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </Select>
        </Field>
      )}
    </div>
  );
}

// ── Success screen ────────────────────────────────────────────────────────────

type RegistrationResult = {
  employeeId: number;
  employeeName: string;
  employeeNo: string;
  tempPassword?: string;
  roleAssigned?: string;
  warnings?: string[];
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
    <div className="mx-auto max-w-lg space-y-6 py-10">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Employee Registered</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Record created successfully.</p>
      </div>

      {result.warnings && result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            The employee was created, but these sections did not save:
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
            {result.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Add them from the employee profile.</p>
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
        <ResultRow label="Name" value={result.employeeName} />
        <ResultRow label="Employee No." value={result.employeeNo} mono />
        {result.tempPassword && (
          <div className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Temporary Password</p>
              <p className="mt-0.5 font-mono text-sm font-semibold tracking-widest text-slate-800 dark:text-slate-100">{result.tempPassword}</p>
            </div>
            <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        {result.roleAssigned && <ResultRow label="Role Assigned" value={result.roleAssigned} />}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/employees/${result.employeeId}`} className="flex flex-1 items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100">
          View Profile
        </Link>
        <button onClick={onAnother} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
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

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{children}</p>;
}

/**
 * The reference stores an editable Level/Person approval chain. This app has no
 * such table: HandlesApprovalWorkflow routes attendance requests to the employee's
 * manager and to department heads. So show the resulting chain rather than invite
 * edits that would go nowhere.
 */
function ApprovalLevels({ supervisorName }: { supervisorName?: string }) {
  const levels = [
    { level: "Level 1", person: supervisorName ?? "Immediate Supervisor (not selected)" },
    { level: "Level 2", person: "Department Head" },
    { level: "Level 3", person: "HR Administrator" },
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Level</th>
            <th className="px-4 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Person</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {levels.map((l) => (
            <tr key={l.level}>
              <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300">{l.level}</td>
              <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{l.person}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500">
        Derived from the immediate supervisor and role permissions — not editable per employee.
      </p>
    </div>
  );
}

function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      {children}
    </h3>
  );
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
