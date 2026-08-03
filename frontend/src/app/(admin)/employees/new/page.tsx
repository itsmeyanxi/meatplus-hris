"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { createEmployee, getLookup } from "@/lib/employees";
import { useBranchTerm } from "@/lib/terminology";
import { SearchSelect } from "@/components/SearchSelect";

const schema = z.object({
  employee_no: z.string().min(1, "Required").max(30),
  first_name: z.string().min(1, "Required"),
  middle_name: z.string().optional(),
  last_name: z.string().min(1, "Required"),
  suffix: z.string().optional(),
  birth_date: z.string().min(1, "Required"),
  gender: z.enum(["male", "female", "other"]),
  civil_status: z.enum(["single", "married", "widowed", "separated", "divorced"]),
  nationality: z.string().default("Filipino"),
  email_personal: z.string().email().optional().or(z.literal("")),
  email_company: z.string().email().optional().or(z.literal("")),
  // The API requires a primary contact number when creating an employee.
  mobile: z.string().min(1, "Required"),
  city: z.string().optional(),
  province: z.string().optional(),
  postal_code: z.string().optional(),
  branch_id: z.coerce.number().min(1, "Required"),
  department_id: z.coerce.number().min(1, "Required"),
  position_id: z.coerce.number().min(1, "Required"),
  employment_type_id: z.coerce.number().min(1, "Required"),
  date_hired: z.string().min(1, "Required"),
});

type FormInput = z.input<typeof schema>;
type FormValues = z.output<typeof schema>;

export default function NewEmployeePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const branch = useBranchTerm();
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: () => getLookup("branches") });
  const { data: departments } = useQuery({ queryKey: ["departments"], queryFn: () => getLookup("departments") });
  const { data: employmentTypes } = useQuery({ queryKey: ["employment-types"], queryFn: () => getLookup("employment-types") });

  const form = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nationality: "Filipino", gender: "male", civil_status: "single" },
  });
  const departmentId = form.watch("department_id");
  const { data: positions } = useQuery({
    queryKey: ["positions", departmentId],
    queryFn: () => getLookup("positions", departmentId ? { department_id: Number(departmentId) } : {}),
    enabled: !!departmentId,
  });

  const mutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      router.push(`/employees/${created.id}`);
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const fieldErrors = e?.response?.data?.errors;
      if (fieldErrors) {
        Object.entries(fieldErrors).forEach(([k, msgs]) => {
          form.setError(k as keyof FormValues, { message: msgs[0] });
        });
      }
      setServerError(e?.response?.data?.message ?? "Failed to create employee");
    },
  });

  const onSubmit = (values: FormValues) => {
    setServerError(null);
    mutation.mutate(values);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">New employee</h2>
        <p className="text-sm text-slate-500">Required fields are marked with *.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <Section title="Identity">
          <Grid>
            <Field label="Employee no *" error={form.formState.errors.employee_no?.message}>
              <input className={inputCls} {...form.register("employee_no")} />
            </Field>
            <Field label="First name *" error={form.formState.errors.first_name?.message}>
              <input className={inputCls} {...form.register("first_name")} />
            </Field>
            <Field label="Middle name">
              <input className={inputCls} {...form.register("middle_name")} />
            </Field>
            <Field label="Last name *" error={form.formState.errors.last_name?.message}>
              <input className={inputCls} {...form.register("last_name")} />
            </Field>
            <Field label="Suffix">
              <input className={inputCls} {...form.register("suffix")} placeholder="Jr., III…" />
            </Field>
            <Field label="Birth date *" error={form.formState.errors.birth_date?.message}>
              <input type="date" className={inputCls} {...form.register("birth_date")} />
            </Field>
            <Field label="Gender *">
              <Controller
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <SearchSelect
                    className={inputCls}
                    value={field.value as string | number | undefined}
                    onChange={field.onChange}
                    options={[
                      { value: "male", label: "Male" },
                      { value: "female", label: "Female" },
                      { value: "other", label: "Other" },
                    ]}
                  />
                )}
              />
            </Field>
            <Field label="Civil status *">
              <Controller
                control={form.control}
                name="civil_status"
                render={({ field }) => (
                  <SearchSelect
                    className={inputCls}
                    value={field.value as string | number | undefined}
                    onChange={field.onChange}
                    options={[
                      { value: "single", label: "Single" },
                      { value: "married", label: "Married" },
                      { value: "widowed", label: "Widowed" },
                      { value: "separated", label: "Separated" },
                      { value: "divorced", label: "Divorced" },
                    ]}
                  />
                )}
              />
            </Field>
            <Field label="Nationality">
              <input className={inputCls} {...form.register("nationality")} />
            </Field>
          </Grid>
        </Section>

        <Section title="Contact & address">
          <Grid>
            <Field label="Personal email" error={form.formState.errors.email_personal?.message}>
              <input type="email" className={inputCls} {...form.register("email_personal")} />
            </Field>
            <Field label="Company email" error={form.formState.errors.email_company?.message}>
              <input type="email" className={inputCls} {...form.register("email_company")} />
            </Field>
            <Field label="Mobile *" error={form.formState.errors.mobile?.message}>
              <input className={inputCls} placeholder="09991234567" {...form.register("mobile")} />
            </Field>
            <Field label="City">
              <input className={inputCls} {...form.register("city")} />
            </Field>
            <Field label="Province">
              <input className={inputCls} {...form.register("province")} />
            </Field>
            <Field label="Postal code">
              <input className={inputCls} {...form.register("postal_code")} />
            </Field>
          </Grid>
        </Section>

        <Section title="Employment">
          <Grid>
            <Field label={`${branch.Singular} *`} error={form.formState.errors.branch_id?.message}>
              <Controller
                control={form.control}
                name="branch_id"
                render={({ field }) => (
                  <SearchSelect
                    className={inputCls}
                    value={field.value as string | number | undefined}
                    onChange={field.onChange}
                    placeholder={`Select ${branch.singular}…`}
                    options={(branches ?? []).filter((b) => !b.is_agency).map((b) => ({ value: String(b.id), label: b.name }))}
                  />
                )}
              />
            </Field>
            <Field label="Department *" error={form.formState.errors.department_id?.message}>
              <Controller
                control={form.control}
                name="department_id"
                render={({ field }) => (
                  <SearchSelect
                    className={inputCls}
                    value={field.value as string | number | undefined}
                    onChange={field.onChange}
                    placeholder="Select department…"
                    options={(departments ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
                  />
                )}
              />
            </Field>
            <Field label="Position *" error={form.formState.errors.position_id?.message}>
              <Controller
                control={form.control}
                name="position_id"
                render={({ field }) => (
                  <SearchSelect
                    className={inputCls}
                    value={field.value as string | number | undefined}
                    onChange={field.onChange}
                    disabled={!departmentId}
                    placeholder={departmentId ? "Select position…" : "Pick department first"}
                    options={(positions ?? []).map((p) => ({ value: String(p.id), label: p.title }))}
                  />
                )}
              />
            </Field>
            <Field label="Employment type *" error={form.formState.errors.employment_type_id?.message}>
              <Controller
                control={form.control}
                name="employment_type_id"
                render={({ field }) => (
                  <SearchSelect
                    className={inputCls}
                    value={field.value as string | number | undefined}
                    onChange={field.onChange}
                    placeholder="Select type…"
                    options={(employmentTypes ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
                  />
                )}
              />
            </Field>
            <Field label="Date hired *" error={form.formState.errors.date_hired?.message}>
              <input type="date" className={inputCls} {...form.register("date_hired")} />
            </Field>
          </Grid>
        </Section>

        {serverError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {mutation.isPending ? "Saving…" : "Create employee"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">{children}</div>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
