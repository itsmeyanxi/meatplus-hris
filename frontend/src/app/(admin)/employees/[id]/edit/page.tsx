"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useState } from "react";
import { AppButton, AppInput, AppCard, PageHeader } from "@/components/ui";
import { getEmployee, updateEmployee, type EmployeeCreateInput } from "@/lib/employees";

export default function EditEmployeePage() {
  const router = useRouter();
  const { id } = useParams();
  const employeeId = Number(id);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    birth_date: "",
    gender: "",
    civil_status: "",
    nationality: "",
    email_personal: "",
    email_company: "",
    mobile: "",
    phone_home: "",
    biometric_user_id: "",
  });

  const { data: emp, isLoading } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => getEmployee(employeeId),
    enabled: !!employeeId,
  });

  // Hydrate the form once the employee loads (guarded render-time sync rather
  // than an effect, so a background refetch never clobbers in-progress edits).
  const [hydrated, setHydrated] = useState(false);
  if (emp && !hydrated) {
    setHydrated(true);
    setFormData({
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
    });
  }

  const mutation = useMutation({
    mutationFn: () =>
      updateEmployee(employeeId, {
        ...formData,
        gender: formData.gender as EmployeeCreateInput["gender"],
        civil_status: formData.civil_status as EmployeeCreateInput["civil_status"],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      router.push(`/employees/${employeeId}`);
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed to save");
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  if (isLoading) {
    return <p className="text-sm text-slate-500 animate-pulse">Loading…</p>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Edit Employee"
        description={`Modify information for ${formData.first_name} ${formData.last_name}.`}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="space-y-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AppCard title="Identity" description="Personal identification.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">First Name</label>
                <AppInput name="first_name" value={formData.first_name} onChange={handleChange} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Middle Name</label>
                <AppInput name="middle_name" value={formData.middle_name} onChange={handleChange} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Last Name</label>
                <AppInput name="last_name" value={formData.last_name} onChange={handleChange} required />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Suffix</label>
                <AppInput name="suffix" value={formData.suffix} onChange={handleChange} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Birth Date</label>
                <AppInput type="date" name="birth_date" value={formData.birth_date} onChange={handleChange} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Gender</label>
                <select
                  name="gender"
                  value={formData.gender}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Civil Status</label>
                <AppInput name="civil_status" value={formData.civil_status} onChange={handleChange} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Nationality</label>
                <AppInput name="nationality" value={formData.nationality} onChange={handleChange} />
              </div>
            </div>
          </AppCard>

          <AppCard title="Contact" description="Email and phone.">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Personal Email</label>
                <AppInput type="email" name="email_personal" value={formData.email_personal} onChange={handleChange} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Company Email</label>
                <AppInput type="email" name="email_company" value={formData.email_company} onChange={handleChange} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Mobile</label>
                <AppInput name="mobile" value={formData.mobile} onChange={handleChange} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Home Phone</label>
                <AppInput name="phone_home" value={formData.phone_home} onChange={handleChange} />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">Biometric ID</label>
                <AppInput
                  name="biometric_user_id"
                  value={formData.biometric_user_id}
                  onChange={handleChange}
                  placeholder="Employee No. enrolled on the device (defaults to Employee No.)"
                />
                <p className="mt-1 text-xs text-slate-400">
                  Matches this person to their punches on the biometric terminal. Leave blank to use their Employee No.
                </p>
              </div>
            </div>
          </AppCard>
        </div>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <AppButton type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </AppButton>
          <AppButton type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Changes"}
          </AppButton>
        </div>
      </form>
    </div>
  );
}
