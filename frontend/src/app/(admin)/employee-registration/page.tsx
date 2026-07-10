"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { forwardRef, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { employeeSchedulesApi, workSchedulesApi } from "@/lib/attendance";
import { getMe } from "@/lib/auth";
import {
  dependentsApi, educationApi, emergencyContactsApi, employeeAddressesApi,
  employeeBenefitsApi, employeeEmailsApi, employeeLocationsApi, employeePhonesApi,
  employeeVisasApi, governmentIdsApi, performanceGoalsApi, photoApi,
} from "@/lib/employee-relations";
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
  schedule_mode:      z.enum(["existing", "new"]).default("existing"),
  work_schedule_id:   z.union([z.coerce.number(), z.literal("")]).optional(),
  schedule_from:      z.string().optional(),
  schedule_type:      z.enum(["", "fixed", "flexible"]).optional(),
  schedule_hours:     z.string().optional(),

  // Government information — TIN is mandatory, the rest optional
  tin:                z.string().min(1, "Required"),
  sss_no:             z.string().optional(),
  philhealth_no:      z.string().optional(),
  pagibig_no:         z.string().optional(),   // HDMF
  prc_no:             z.string().optional(),
  prc_expiry:         z.string().optional(),
  passport_no:        z.string().optional(),
  rdo_code:           z.string().optional(),

  // Educational background is a list, held outside the form (see eduRows).

  // Performance goals are a list, held outside the form (see goalRows).

  // Contact — the primary contact number is a mobile and is required
  email_personal:     z.string().email("Invalid email").optional().or(z.literal("")),
  email_company:      z.string().email("Invalid email").optional().or(z.literal("")),
  mobile:             z.string().min(1, "Required").regex(/^09\d{9}$/, "Must be a mobile, e.g. 09991234567"),
  phone_home:         z.string().optional(),
  local_trunk_line:   z.string().optional(),
  trunk_pin:          z.string().optional(),
  skype_id:           z.string().optional(),

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
  | "government" | "visa" | "education" | "performance"
  | "contact" | "dependents" | "benefits" | "portal";

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
const IconVisa        = () => icon("M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L12 19v-5.5L21 16z");
const IconBenefits    = () => icon("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z");
const IconDependents  = () => icon("M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z");
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

  // A 7-row grid, Sunday first, matching day_of_week 0..6 on work_schedule_days.
  type DayRow = { time_in: string; time_out: string; break_start: string; break_end: string; is_rest_day: boolean };
  const emptyDay: DayRow = { time_in: "", time_out: "", break_start: "", break_end: "", is_rest_day: false };
  const [scheduleDays, setScheduleDays] = useState<DayRow[]>(() => Array.from({ length: 7 }, () => ({ ...emptyDay })));

  const setDay = (i: number, patch: Partial<DayRow>) =>
    setScheduleDays((ds) => ds.map((d, n) => (n === i ? { ...d, ...patch } : d)));

  // Educational background: an employee can list several. Rows only reach the API
  // once the employee exists, so they live here until then.
  type EduRow = { level: string; school: string; year_from: string; year_to: string; degree: string };
  const blankEdu: EduRow = { level: "", school: "", year_from: "", year_to: "", degree: "" };
  const [eduRows, setEduRows] = useState<EduRow[]>([]);

  const addEdu    = () => setEduRows((r) => [...r, { ...blankEdu }]);
  const removeEdu = (i: number) => setEduRows((r) => r.filter((_, n) => n !== i));
  const setEdu    = (i: number, patch: Partial<EduRow>) =>
    setEduRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Performance goals: goal text, optional due date and feedback.
  type GoalRow = { goal: string; due_date: string; feedback: string };
  const blankGoal: GoalRow = { goal: "", due_date: "", feedback: "" };
  const [goalRows, setGoalRows] = useState<GoalRow[]>([]);

  const addGoal    = () => setGoalRows((r) => [...r, { ...blankGoal }]);
  const removeGoal = (i: number) => setGoalRows((r) => r.filter((_, n) => n !== i));
  const setGoal    = (i: number, patch: Partial<GoalRow>) =>
    setGoalRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Emergency contacts. The API requires name and relationship.
  type EmgRow = { mobile: string; name: string; relationship: string; address: string };
  const blankEmg: EmgRow = { mobile: "", name: "", relationship: "", address: "" };
  const [emgRows, setEmgRows] = useState<EmgRow[]>([]);

  const addEmg    = () => setEmgRows((r) => [...r, { ...blankEmg }]);
  const removeEmg = (i: number) => setEmgRows((r) => r.filter((_, n) => n !== i));
  const setEmg    = (i: number, patch: Partial<EmgRow>) =>
    setEmgRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Benefits
  type BenRow = {
    type: string; is_active: boolean; effective_date: string; enrollment_date: string;
    plan: string; beneficiary: string; notes: string; payment_type: string;
  };
  const [benRows, setBenRows] = useState<BenRow[]>([]);
  const addBen    = () => setBenRows((r) => [...r, {
    type: "", is_active: true, effective_date: "", enrollment_date: "",
    plan: "", beneficiary: "", notes: "", payment_type: "",
  }]);
  const removeBen = (i: number) => setBenRows((r) => r.filter((_, n) => n !== i));
  const setBen    = (i: number, patch: Partial<BenRow>) =>
    setBenRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Dependents
  type DepRow = {
    first_name: string; middle_name: string; last_name: string;
    relationship: string; birth_date: string; gender: string; notes: string;
  };
  const [depRows, setDepRows] = useState<DepRow[]>([]);
  const addDep    = () => setDepRows((r) => [...r, {
    first_name: "", middle_name: "", last_name: "",
    relationship: "", birth_date: "", gender: "", notes: "",
  }]);
  const removeDep = (i: number) => setDepRows((r) => r.filter((_, n) => n !== i));
  const setDep    = (i: number, patch: Partial<DepRow>) =>
    setDepRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Visas
  type VisaRow = {
    visa_type: string; visa_number: string; issue_date: string;
    expiration_date: string; place_of_issue: string; notes: string;
  };
  const [visaRows, setVisaRows] = useState<VisaRow[]>([]);
  const addVisa    = () => setVisaRows((r) => [...r, {
    visa_type: "", visa_number: "", issue_date: "", expiration_date: "", place_of_issue: "", notes: "",
  }]);
  const removeVisa = (i: number) => setVisaRows((r) => r.filter((_, n) => n !== i));
  const setVisa    = (i: number, patch: Partial<VisaRow>) =>
    setVisaRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Alternate phones
  type PhoneRow = { title: string; contact_no: string; contact_name: string };
  const [phoneRows, setPhoneRows] = useState<PhoneRow[]>([]);
  const addPhone    = () => setPhoneRows((r) => [...r, { title: "", contact_no: "", contact_name: "" }]);
  const removePhone = (i: number) => setPhoneRows((r) => r.filter((_, n) => n !== i));
  const setPhone    = (i: number, patch: Partial<PhoneRow>) =>
    setPhoneRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

  // Emails. Exactly one is primary; the radio enforces it here, the API there.
  type EmailRow = { email: string; is_primary: boolean };
  const [emailRows, setEmailRows] = useState<EmailRow[]>([]);
  const addEmail    = () => setEmailRows((r) => [...r, { email: "", is_primary: r.length === 0 }]);
  const removeEmail = (i: number) => setEmailRows((r) => {
    const next = r.filter((_, n) => n !== i);
    if (next.length && !next.some((e) => e.is_primary)) next[0].is_primary = true;
    return [...next];
  });
  const setEmailAt  = (i: number, patch: Partial<EmailRow>) =>
    setEmailRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));
  const makePrimaryEmail = (i: number) =>
    setEmailRows((r) => r.map((row, n) => ({ ...row, is_primary: n === i })));

  // Addresses
  type AddrRow = { label: string; address_line1: string; city: string; province: string; postal_code: string };
  const [addrRows, setAddrRows] = useState<AddrRow[]>([]);
  const addAddr    = () => setAddrRows((r) => [...r, { label: "present", address_line1: "", city: "", province: "", postal_code: "" }]);
  const removeAddr = (i: number) => setAddrRows((r) => r.filter((_, n) => n !== i));
  const setAddr    = (i: number, patch: Partial<AddrRow>) =>
    setAddrRows((r) => r.map((row, n) => (n === i ? { ...row, ...patch } : row)));

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
      isComplete: (v) => !!v.schedule_from && (
        v.schedule_mode === "new" ? !!(v.schedule_type && v.schedule_hours) : !!v.work_schedule_id
      ) },
    { key: "government", label: "Government Information", description: "TIN, SSS, PhilHealth & HDMF",
      icon: <IconGovernment />, required: true,
      isComplete: (v) => !!v.tin },
    { key: "visa", label: "Visa", description: "Visa type, number, validity & place of issue",
      icon: <IconVisa />,
      isComplete: () => visaRows.some((v) => v.visa_type.trim() && v.visa_number.trim()) },
    { key: "education", label: "Educational Background", description: "School, degree & years attended",
      icon: <IconEducation />,
      isComplete: () => eduRows.some((r) => r.level && r.school) },
    { key: "performance", label: "Performance Management", description: "Goals, due dates & feedback",
      icon: <IconPerformance />,
      isComplete: () => goalRows.some((r) => r.goal.trim()) },
    { key: "contact", label: "Contact Information", description: "Primary number, emails, addresses & emergency contacts",
      icon: <IconContact />, required: true,
      isComplete: (v) => !!v.mobile && emailRows.some((e) => e.email.trim()) },
    { key: "dependents", label: "Dependents", description: "Spouse, children & other dependents",
      icon: <IconDependents />,
      isComplete: () => depRows.some((d) => (d.first_name.trim() || d.last_name.trim()) && d.relationship) },
    { key: "benefits", label: "Benefits", description: "HMO, insurance & other enrolments",
      icon: <IconBenefits />,
      isComplete: () => benRows.some((b) => b.type.trim()) },
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
        mobile: v.mobile,
        phone_home: v.phone_home || null,
        local_trunk_line: v.local_trunk_line || null,
        trunk_pin: v.trunk_pin || null,
        skype_id: v.skype_id || null,
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

      // TIN is required, so this record is always written.
      if (v.tin) {
        await attach("Government information", () =>
          governmentIdsApi.save(emp.id, {
            tin: v.tin || null,
            sss_no: v.sss_no || null,
            philhealth_no: v.philhealth_no || null,
            pagibig_no: v.pagibig_no || null,
            prc_no: v.prc_no || null,
            prc_expiry: v.prc_expiry || null,
            passport_no: v.passport_no || null,
            rdo_code: v.rdo_code || null,
          }));
      }

      // Only Type is required; skip rows without it.
      for (const [i, row] of benRows.entries()) {
        if (!row.type.trim()) continue;
        await attach(`Benefit (row ${i + 1})`, () =>
          employeeBenefitsApi.create(emp.id, {
            type: row.type.trim(),
            is_active: row.is_active,
            enrollment_date: row.enrollment_date || null,
            effective_date: row.effective_date || null,
            plan: row.plan || null,
            beneficiary: row.beneficiary || null,
            payment_type: row.payment_type || null,
            notes: row.notes || null,
          }));
      }

      // A dependent needs a name and a relationship; skip incomplete rows.
      for (const [i, row] of depRows.entries()) {
        const named = row.first_name.trim() || row.last_name.trim();
        if (!named || !row.relationship) continue;
        await attach(`Dependent (row ${i + 1})`, () =>
          dependentsApi.create(emp.id, {
            first_name: row.first_name.trim() || null,
            middle_name: row.middle_name.trim() || null,
            last_name: row.last_name.trim() || null,
            relationship: row.relationship,
            birth_date: row.birth_date || null,
            gender: row.gender || null,
            notes: row.notes || null,
          }));
      }

      // Visa type and number are required; skip half-filled rows.
      for (const [i, row] of visaRows.entries()) {
        if (!row.visa_type.trim() || !row.visa_number.trim()) continue;
        await attach(`Visa (row ${i + 1})`, () =>
          employeeVisasApi.create(emp.id, {
            visa_type: row.visa_type.trim(),
            visa_number: row.visa_number.trim(),
            issue_date: row.issue_date || null,
            expiration_date: row.expiration_date || null,
            place_of_issue: row.place_of_issue || null,
            notes: row.notes || null,
          }));
      }

      // Level and School are what the API requires; skip half-filled rows.
      for (const [i, row] of eduRows.entries()) {
        if (!row.level || !row.school) continue;
        await attach(`Educational background (row ${i + 1})`, () =>
          educationApi.create(emp.id, {
            level: row.level,
            school: row.school,
            degree: row.degree || null,
            year_from: row.year_from ? Number(row.year_from) : null,
            year_to: row.year_to ? Number(row.year_to) : null,
          }));
      }

      for (const [i, row] of phoneRows.entries()) {
        if (!row.title.trim() || !row.contact_no.trim()) continue;
        await attach(`Alternate phone (row ${i + 1})`, () =>
          employeePhonesApi.create(emp.id, {
            title: row.title.trim(),
            contact_no: row.contact_no.trim(),
            contact_name: row.contact_name || null,
          }));
      }

      // Send the primary email first so the API's "first becomes primary" default
      // never fights the explicit flag.
      for (const [i, row] of [...emailRows].sort((a, b) => Number(b.is_primary) - Number(a.is_primary)).entries()) {
        if (!row.email.trim()) continue;
        await attach(`Email (row ${i + 1})`, () =>
          employeeEmailsApi.create(emp.id, { email: row.email.trim(), is_primary: row.is_primary }));
      }

      for (const [i, row] of addrRows.entries()) {
        if (!row.address_line1.trim()) continue;
        await attach(`Address (row ${i + 1})`, () =>
          employeeAddressesApi.create(emp.id, {
            label: row.label || "present",
            address_line1: row.address_line1.trim(),
            city: row.city || null,
            province: row.province || null,
            postal_code: row.postal_code || null,
            is_primary: i === 0,
          }));
      }

      // Name and relationship are what the API requires; skip incomplete rows.
      for (const [i, row] of emgRows.entries()) {
        if (!row.name.trim() || !row.relationship.trim()) continue;
        await attach(`Emergency contact (row ${i + 1})`, () =>
          emergencyContactsApi.create(emp.id, {
            name: row.name.trim(),
            relationship: row.relationship.trim(),
            mobile: row.mobile || null,
            address: row.address || null,
          }));
      }

      // Only the goal text is required; rows without it are skipped.
      for (const [i, row] of goalRows.entries()) {
        if (!row.goal.trim()) continue;
        await attach(`Performance goal (row ${i + 1})`, () =>
          performanceGoalsApi.create(emp.id, {
            goal: row.goal.trim(),
            due_date: row.due_date || null,
            feedback: row.feedback || null,
          }));
      }

      if (v.schedule_from) {
        await attach("Work schedule", async () => {
          let scheduleId = v.work_schedule_id ? Number(v.work_schedule_id) : 0;

          // Defining a schedule inline: create it for the company first, then assign.
          if (v.schedule_mode === "new") {
            const hhmmss = (t: string) => (t ? `${t}:00` : null);
            const created = await workSchedulesApi.create({
              code: `EMP-${v.employee_no}`.slice(0, 30),
              name: `Schedule for ${v.first_name} ${v.last_name}`.slice(0, 255),
              is_flexible: v.schedule_type === "flexible",
              hours_per_day: v.schedule_hours ? Number(v.schedule_hours) : null,
              weekly_workdays: scheduleDays.filter((d) => !d.is_rest_day).length || 1,
              days: scheduleDays.map((d, i) => ({
                day_of_week: i,
                is_rest_day: d.is_rest_day,
                time_in: d.is_rest_day ? null : hhmmss(d.time_in),
                time_out: d.is_rest_day ? null : hhmmss(d.time_out),
                break_start: d.is_rest_day ? null : hhmmss(d.break_start),
                break_end: d.is_rest_day ? null : hhmmss(d.break_end),
              })),
            });
            scheduleId = created.id;
          }

          if (!scheduleId) return;
          return employeeSchedulesApi.create(emp.id, {
            work_schedule_id: scheduleId,
            effective_from: v.schedule_from!,
          });
        });
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
        else if (fieldErrors.tin) setActive("government");
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
        onAnother={() => { setResult(null); form.reset(); clearPhoto(); setLocations([]); setEduRows([]); setGoalRows([]); setEmgRows([]); setPhoneRows([]); setEmailRows([]); setAddrRows([]); setVisaRows([]); setDepRows([]); setBenRows([]); setScheduleDays(Array.from({ length: 7 }, () => ({ ...emptyDay }))); setActive("basic"); }}
      />
    );
  }

  const toggle = (key: SectionKey) => setActive((prev) => (prev === key ? null : key));
  const reset  = () => { form.reset(); clearPhoto(); setLocations([]); setEduRows([]); setGoalRows([]); setEmgRows([]); setPhoneRows([]); setEmailRows([]); setAddrRows([]); setVisaRows([]); setDepRows([]); setBenRows([]); setScheduleDays(Array.from({ length: 7 }, () => ({ ...emptyDay }))); setServerError(null); setActive("basic"); };

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
                    {section.key === "schedule"    && (
                      <ScheduleSection
                        form={form}
                        workSchedules={workSchedules}
                        days={scheduleDays}
                        onDay={setDay}
                      />
                    )}
                    {section.key === "government"  && <GovernmentSection form={form} />}
                    {section.key === "visa"        && (
                      <VisaSection rows={visaRows} onAdd={addVisa} onRemove={removeVisa} onChange={setVisa} />
                    )}
                    {section.key === "education"   && (
                      <EducationSection rows={eduRows} onAdd={addEdu} onRemove={removeEdu} onChange={setEdu} />
                    )}
                    {section.key === "performance" && (
                      <PerformanceSection rows={goalRows} onAdd={addGoal} onRemove={removeGoal} onChange={setGoal} />
                    )}
                    {section.key === "contact"     && (
                      <ContactSection
                        form={form}
                        rows={emgRows} onAdd={addEmg} onRemove={removeEmg} onChange={setEmg}
                        phoneRows={phoneRows} onAddPhone={addPhone} onRemovePhone={removePhone} onPhone={setPhone}
                        emailRows={emailRows} onAddEmail={addEmail} onRemoveEmail={removeEmail} onEmail={setEmailAt} onPrimaryEmail={makePrimaryEmail}
                        addrRows={addrRows} onAddAddr={addAddr} onRemoveAddr={removeAddr} onAddr={setAddr}
                      />
                    )}
                    {section.key === "dependents"  && (
                      <DependentsSection rows={depRows} onAdd={addDep} onRemove={removeDep} onChange={setDep} />
                    )}
                    {section.key === "benefits"    && (
                      <BenefitsSection rows={benRows} onAdd={addBen} onRemove={removeBen} onChange={setBen} />
                    )}
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

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type DayRow = { time_in: string; time_out: string; break_start: string; break_end: string; is_rest_day: boolean };

function ScheduleSection({ form, workSchedules, days, onDay }: {
  form: FF;
  workSchedules?: { id: number; name: string; code: string }[];
  days: DayRow[];
  onDay: (i: number, patch: Partial<DayRow>) => void;
}) {
  const mode = form.watch("schedule_mode") ?? "existing";

  return (
    <div className="space-y-5">
      <Grid>
        <Field label="Assign">
          <Select {...form.register("schedule_mode")}>
            <option value="existing">Use an existing schedule</option>
            <option value="new">Define a new schedule</option>
          </Select>
        </Field>
        <Field label="Effective From">
          <Input type="date" {...form.register("schedule_from")} />
        </Field>
      </Grid>

      {mode === "existing" ? (
        <>
          <Grid>
            <Field label="Work Schedule">
              <Select {...form.register("work_schedule_id")}>
                <option value="">No schedule yet</option>
                {workSchedules?.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
              </Select>
            </Field>
          </Grid>
          <Hint>A schedule and an effective date are both needed. Leave blank to assign one later.</Hint>
        </>
      ) : (
        <>
          <Grid>
            <Field label="Schedule Type *">
              <Select {...form.register("schedule_type")}>
                <option value="">Please select…</option>
                <option value="fixed">Fixed</option>
                <option value="flexible">Flexible</option>
              </Select>
            </Field>
            <Field label="No. of hours to work including break hours *">
              <Input type="number" step="0.25" min="0" max="24" {...form.register("schedule_hours")} placeholder="9" />
            </Field>
          </Grid>

          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  {["Day", "Shift/Core From", "Shift/Core To", "Break Start", "Break End", "Is Rest Day"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {days.map((d, i) => (
                  <tr key={DAY_NAMES[i]} className={d.is_rest_day ? "bg-slate-50/60 dark:bg-slate-800/30" : ""}>
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{DAY_NAMES[i]}</td>
                    {(["time_in", "time_out", "break_start", "break_end"] as const).map((k) => (
                      <td key={k} className="px-3 py-2">
                        <Input
                          type="time"
                          value={d[k]}
                          disabled={d.is_rest_day}
                          onChange={(e) => onDay(i, { [k]: e.target.value } as Partial<DayRow>)}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded accent-slate-900"
                        checked={d.is_rest_day}
                        onChange={(e) => onDay(i, { is_rest_day: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Hint>
            Ticking Is Rest Day clears that day&apos;s times. Break minutes are derived from the break
            window. A new schedule is created for the company and assigned to this employee.
          </Hint>
        </>
      )}
    </div>
  );
}

function GovernmentSection({ form }: { form: FF }) {
  const E = form.formState.errors;
  return (
    <>
      <Grid>
        <Field label="SSS No."><Input {...form.register("sss_no")} placeholder="00-0000000-0" /></Field>
        <Field label="TIN *" error={E.tin?.message}>
          <Input {...form.register("tin")} placeholder="000-000-000-000" />
        </Field>
        <Field label="PhilHealth No."><Input {...form.register("philhealth_no")} placeholder="00-000000000-0" /></Field>
        <Field label="HDMF No. (Pag-IBIG)"><Input {...form.register("pagibig_no")} placeholder="0000-0000-0000" /></Field>
        <Field label="PRC License No."><Input {...form.register("prc_no")} /></Field>
        <Field label="PRC Expiry"><Input type="date" {...form.register("prc_expiry")} /></Field>
        <Field label="Passport No."><Input {...form.register("passport_no")} /></Field>
        <Field label="RDO No."><Input {...form.register("rdo_code")} placeholder="050" /></Field>
      </Grid>
      <Hint>
        SSS, TIN, PhilHealth, HDMF and Passport are encrypted at rest. PRC licence and RDO are not —
        they are not personally sensitive.
      </Hint>
    </>
  );
}

type BenRow = {
  type: string; is_active: boolean; effective_date: string; enrollment_date: string;
  plan: string; beneficiary: string; notes: string; payment_type: string;
};

function BenefitsSection({ rows, onAdd, onRemove, onChange }: {
  rows: BenRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, patch: Partial<BenRow>) => void;
}) {
  return (
    <div className="space-y-4">
      <AddButton onClick={onAdd}>Add Benefits</AddButton>

      <RowTable
        headers={["Type", "Active", "Effective Date", "Enrollment Date", "Plan", "Beneficiary", "Notes", "Payment Type", ""]}
        empty="No benefits yet."
      >
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="px-3 py-2">
              <Input value={r.type} onChange={(e) => onChange(i, { type: e.target.value })} placeholder="HMO, Life…" />
            </td>
            <td className="px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-slate-900"
                checked={r.is_active}
                onChange={(e) => onChange(i, { is_active: e.target.checked })}
              />
            </td>
            <td className="px-3 py-2">
              <Input type="date" value={r.effective_date} onChange={(e) => onChange(i, { effective_date: e.target.value })} />
            </td>
            <td className="px-3 py-2">
              <Input type="date" value={r.enrollment_date} onChange={(e) => onChange(i, { enrollment_date: e.target.value })} />
            </td>
            <td className="px-3 py-2"><Input value={r.plan} onChange={(e) => onChange(i, { plan: e.target.value })} /></td>
            <td className="px-3 py-2"><Input value={r.beneficiary} onChange={(e) => onChange(i, { beneficiary: e.target.value })} /></td>
            <td className="px-3 py-2"><Input value={r.notes} onChange={(e) => onChange(i, { notes: e.target.value })} /></td>
            <td className="px-3 py-2">
              <Select value={r.payment_type} onChange={(e) => onChange(i, { payment_type: e.target.value })}>
                <option value="">—</option>
                <option value="employer">Employer-paid</option>
                <option value="employee">Employee-paid</option>
                <option value="shared">Shared</option>
              </Select>
            </td>
            <td className="px-3 py-2 text-right"><RemoveButton onClick={() => onRemove(i)} /></td>
          </tr>
        ))}
      </RowTable>

      <Hint>
        Only Type is required; rows without it are skipped. The effective date cannot precede the
        enrollment date.
      </Hint>
    </div>
  );
}

type DepRow = {
  first_name: string; middle_name: string; last_name: string;
  relationship: string; birth_date: string; gender: string; notes: string;
};

const RELATIONSHIPS = ["spouse", "child", "parent", "sibling", "grandparent", "other"] as const;

function DependentsSection({ rows, onAdd, onRemove, onChange }: {
  rows: DepRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, patch: Partial<DepRow>) => void;
}) {
  return (
    <div className="space-y-4">
      <AddButton onClick={onAdd}>Add Dependents</AddButton>

      <RowTable
        headers={["First Name", "Middle Name", "Last Name", "Relationship", "Date of Birth", "Gender", "Notes", ""]}
        empty="No dependents yet."
      >
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="px-3 py-2"><Input value={r.first_name} onChange={(e) => onChange(i, { first_name: e.target.value })} /></td>
            <td className="px-3 py-2"><Input value={r.middle_name} onChange={(e) => onChange(i, { middle_name: e.target.value })} /></td>
            <td className="px-3 py-2"><Input value={r.last_name} onChange={(e) => onChange(i, { last_name: e.target.value })} /></td>
            <td className="px-3 py-2">
              <Select value={r.relationship} onChange={(e) => onChange(i, { relationship: e.target.value })}>
                <option value="">Select…</option>
                {RELATIONSHIPS.map((rel) => (
                  <option key={rel} value={rel}>{rel.charAt(0).toUpperCase() + rel.slice(1)}</option>
                ))}
              </Select>
            </td>
            <td className="px-3 py-2"><Input type="date" value={r.birth_date} onChange={(e) => onChange(i, { birth_date: e.target.value })} /></td>
            <td className="px-3 py-2">
              <Select value={r.gender} onChange={(e) => onChange(i, { gender: e.target.value })}>
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
            </td>
            <td className="px-3 py-2"><Input value={r.notes} onChange={(e) => onChange(i, { notes: e.target.value })} /></td>
            <td className="px-3 py-2 text-right"><RemoveButton onClick={() => onRemove(i)} /></td>
          </tr>
        ))}
      </RowTable>

      <Hint>
        A name and a Relationship are needed for a row to save. Date of birth must be in the past.
        The full name is composed from the parts for tax and BIR reporting.
      </Hint>
    </div>
  );
}

type VisaRow = {
  visa_type: string; visa_number: string; issue_date: string;
  expiration_date: string; place_of_issue: string; notes: string;
};

function VisaSection({ rows, onAdd, onRemove, onChange }: {
  rows: VisaRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, patch: Partial<VisaRow>) => void;
}) {
  return (
    <div className="space-y-4">
      <AddButton onClick={onAdd}>Add Visa</AddButton>

      <RowTable
        headers={["Visa Type", "Visa Number", "Issue Date", "Expiration Date", "Place Of Issue", "Notes", ""]}
        empty="No visas yet."
      >
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="px-3 py-2">
              <Input value={r.visa_type} onChange={(e) => onChange(i, { visa_type: e.target.value })} placeholder="9(G) Working" />
            </td>
            <td className="px-3 py-2">
              <Input value={r.visa_number} onChange={(e) => onChange(i, { visa_number: e.target.value })} />
            </td>
            <td className="px-3 py-2">
              <Input type="date" value={r.issue_date} onChange={(e) => onChange(i, { issue_date: e.target.value })} />
            </td>
            <td className="px-3 py-2">
              <Input type="date" value={r.expiration_date} onChange={(e) => onChange(i, { expiration_date: e.target.value })} />
            </td>
            <td className="px-3 py-2">
              <Input value={r.place_of_issue} onChange={(e) => onChange(i, { place_of_issue: e.target.value })} />
            </td>
            <td className="px-3 py-2">
              <Input value={r.notes} onChange={(e) => onChange(i, { notes: e.target.value })} />
            </td>
            <td className="px-3 py-2 text-right"><RemoveButton onClick={() => onRemove(i)} /></td>
          </tr>
        ))}
      </RowTable>

      <Hint>
        Visa Type and Visa Number are both needed for a row to save. The expiration date cannot
        precede the issue date. Visa numbers are encrypted at rest.
      </Hint>
    </div>
  );
}

type EduRow = { level: string; school: string; year_from: string; year_to: string; degree: string };

const EDU_LEVELS = [
  ["elementary", "Elementary"],
  ["secondary", "Secondary"],
  ["vocational", "Vocational"],
  ["tertiary", "Tertiary"],
  ["graduate", "Graduate"],
] as const;

function EducationSection({ rows, onAdd, onRemove, onChange }: {
  rows: EduRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, patch: Partial<EduRow>) => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onAdd}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        Add Educational Background
      </button>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {["Education Type", "School", "From", "To", "Degree", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  No entries yet.
                </td>
              </tr>
            )}

            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <Select value={r.level} onChange={(e) => onChange(i, { level: e.target.value })}>
                    <option value="">Select…</option>
                    {EDU_LEVELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input value={r.school} onChange={(e) => onChange(i, { school: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" placeholder="2015" value={r.year_from} onChange={(e) => onChange(i, { year_from: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <Input type="number" placeholder="2019" value={r.year_to} onChange={(e) => onChange(i, { year_to: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <Input value={r.degree} onChange={(e) => onChange(i, { degree: e.target.value })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Hint>
        Education Type and School are both needed for a row to save; incomplete rows are skipped.
        Year To must not be earlier than Year From.
      </Hint>
    </div>
  );
}

type GoalRow = { goal: string; due_date: string; feedback: string };

function PerformanceSection({ rows, onAdd, onRemove, onChange }: {
  rows: GoalRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, patch: Partial<GoalRow>) => void;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onAdd}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        Add Performance Goal
      </button>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800/60">
            <tr>
              {["Goal", "Due Date", "Feedback", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                  No goals yet.
                </td>
              </tr>
            )}

            {rows.map((r, i) => (
              <tr key={i}>
                <td className="w-1/2 px-3 py-2">
                  <Input
                    value={r.goal}
                    onChange={(e) => onChange(i, { goal: e.target.value })}
                    placeholder="e.g. Complete onboarding checklist"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input type="date" value={r.due_date} onChange={(e) => onChange(i, { due_date: e.target.value })} />
                </td>
                <td className="px-3 py-2">
                  <Input value={r.feedback} onChange={(e) => onChange(i, { feedback: e.target.value })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onRemove(i)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Hint>
        A goal is what the employee is expected to achieve. Only the Goal column is required;
        rows left blank are skipped. Completed appraisals (period, rating, reviewer) are recorded
        separately, not here.
      </Hint>
    </div>
  );
}

type EmgRow = { mobile: string; name: string; relationship: string; address: string };

type PhoneRow = { title: string; contact_no: string; contact_name: string };
type EmailRow = { email: string; is_primary: boolean };
type AddrRow  = { label: string; address_line1: string; city: string; province: string; postal_code: string };

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      Remove
    </button>
  );
}

function RowTable({ headers, empty, children }: { headers: string[]; empty: string; children: React.ReactNode }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/60">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {!hasRows ? (
            <tr>
              <td colSpan={headers.length} className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                {empty}
              </td>
            </tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

function ContactSection({
  form, rows, onAdd, onRemove, onChange,
  phoneRows, onAddPhone, onRemovePhone, onPhone,
  emailRows, onAddEmail, onRemoveEmail, onEmail, onPrimaryEmail,
  addrRows, onAddAddr, onRemoveAddr, onAddr,
}: {
  form: FF;
  rows: EmgRow[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  onChange: (i: number, patch: Partial<EmgRow>) => void;
  phoneRows: PhoneRow[];
  onAddPhone: () => void;
  onRemovePhone: (i: number) => void;
  onPhone: (i: number, patch: Partial<PhoneRow>) => void;
  emailRows: EmailRow[];
  onAddEmail: () => void;
  onRemoveEmail: (i: number) => void;
  onEmail: (i: number, patch: Partial<EmailRow>) => void;
  onPrimaryEmail: (i: number) => void;
  addrRows: AddrRow[];
  onAddAddr: () => void;
  onRemoveAddr: (i: number) => void;
  onAddr: (i: number, patch: Partial<AddrRow>) => void;
}) {
  const E = form.formState.errors;
  return (
    <div className="space-y-6">
      <div>
        <GroupTitle>Primary Contact Number</GroupTitle>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          A primary contact can only be a mobile number.
        </p>
        <div className="max-w-sm">
          <Field label="Primary Contact Number *" error={E.mobile?.message}>
            <Input {...form.register("mobile")} placeholder="ex: 09991234567" />
          </Field>
        </div>

        <div className="mt-4">
          <Grid>
            <Field label="Local Trunk Line"><Input {...form.register("local_trunk_line")} /></Field>
            <Field label="Pin"><Input {...form.register("trunk_pin")} /></Field>
            <Field label="Skype ID"><Input {...form.register("skype_id")} /></Field>
          </Grid>
        </div>

        <div className="mt-4">
          <Grid>
            <Field label="Company Email" error={E.email_company?.message}>
              <Input type="email" {...form.register("email_company")} />
            </Field>
            <Field label="Home Phone"><Input {...form.register("phone_home")} /></Field>
          </Grid>
        </div>
      </div>

      {/* Alternate phone numbers */}
      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <GroupTitle>Alternate Phone Numbers</GroupTitle>
        <AddButton onClick={onAddPhone}>Add New Phone</AddButton>
        <RowTable headers={["Title", "Contact No.", "Contact Name", ""]} empty="No alternate phones yet.">
          {phoneRows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2"><Input value={r.title} onChange={(e) => onPhone(i, { title: e.target.value })} placeholder="Home, Office…" /></td>
              <td className="px-3 py-2"><Input value={r.contact_no} onChange={(e) => onPhone(i, { contact_no: e.target.value })} /></td>
              <td className="px-3 py-2"><Input value={r.contact_name} onChange={(e) => onPhone(i, { contact_name: e.target.value })} /></td>
              <td className="px-3 py-2 text-right"><RemoveButton onClick={() => onRemovePhone(i)} /></td>
            </tr>
          ))}
        </RowTable>
        <Hint>Title and Contact No. are both needed for a row to save.</Hint>
      </div>

      {/* Emails */}
      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <GroupTitle>Emails</GroupTitle>
        <AddButton onClick={onAddEmail}>Add New Email</AddButton>
        <RowTable headers={["Email Address", "Primary", ""]} empty="No emails yet.">
          {emailRows.map((r, i) => (
            <tr key={i}>
              <td className="w-2/3 px-3 py-2">
                <Input type="email" value={r.email} onChange={(e) => onEmail(i, { email: e.target.value })} />
              </td>
              <td className="px-3 py-2">
                <input
                  type="radio"
                  name="primary-email"
                  className="h-4 w-4 accent-slate-900"
                  checked={r.is_primary}
                  onChange={() => onPrimaryEmail(i)}
                />
              </td>
              <td className="px-3 py-2 text-right"><RemoveButton onClick={() => onRemoveEmail(i)} /></td>
            </tr>
          ))}
        </RowTable>
        <Hint>The primary email becomes the employee&apos;s personal email. Exactly one row can be primary.</Hint>
      </div>

      {/* Addresses */}
      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <GroupTitle>Addresses</GroupTitle>
        <AddButton onClick={onAddAddr}>Add New Address</AddButton>
        <RowTable headers={["Type", "Address", "City", "Province", "Postal", ""]} empty="No addresses yet.">
          {addrRows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2">
                <Select value={r.label} onChange={(e) => onAddr(i, { label: e.target.value })}>
                  <option value="present">Present</option>
                  <option value="permanent">Permanent</option>
                  <option value="other">Other</option>
                </Select>
              </td>
              <td className="px-3 py-2"><Input value={r.address_line1} onChange={(e) => onAddr(i, { address_line1: e.target.value })} /></td>
              <td className="px-3 py-2"><Input value={r.city} onChange={(e) => onAddr(i, { city: e.target.value })} /></td>
              <td className="px-3 py-2"><Input value={r.province} onChange={(e) => onAddr(i, { province: e.target.value })} /></td>
              <td className="px-3 py-2"><Input value={r.postal_code} onChange={(e) => onAddr(i, { postal_code: e.target.value })} /></td>
              <td className="px-3 py-2 text-right"><RemoveButton onClick={() => onRemoveAddr(i)} /></td>
            </tr>
          ))}
        </RowTable>
        <Hint>Address is required for a row to save. The first address is the primary one.</Hint>
      </div>

      <div className="border-t border-slate-100 pt-5 dark:border-slate-800">
        <GroupTitle>Emergency Contact Numbers</GroupTitle>

        <button
          type="button"
          onClick={onAdd}
          className="mb-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
        >
          Add New Emergency Contact
        </button>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60">
              <tr>
                {["Contact No.", "Contact Name", "Relationship", "Address", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
                    No emergency contacts yet.
                  </td>
                </tr>
              )}

              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">
                    <Input value={r.mobile} onChange={(e) => onChange(i, { mobile: e.target.value })} placeholder="09991234567" />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={r.name} onChange={(e) => onChange(i, { name: e.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={r.relationship} onChange={(e) => onChange(i, { relationship: e.target.value })} placeholder="Spouse, Parent…" />
                  </td>
                  <td className="px-3 py-2">
                    <Input value={r.address} onChange={(e) => onChange(i, { address: e.target.value })} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Hint>Contact Name and Relationship are both needed for a row to save; incomplete rows are skipped.</Hint>
      </div>
    </div>
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
