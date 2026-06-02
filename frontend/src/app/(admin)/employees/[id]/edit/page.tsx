"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { AppButton, AppInput, AppCard, PageHeader } from "@/components/ui";

async function fetchEmployee(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/employees/${id}`);
  if (!res.ok) throw new Error("Failed to load employee data");
  return res.json();
}

async function updateEmployee(id: string, data: any) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/employees/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save changes");
  return res.json();
}

export default function EditEmployeePage() {
  const router = useRouter();
  const { id } = useParams();
  const queryClient = useQueryClient();

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
    home_phone: "",
  });

  const { data: employeePayload, isLoading } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => fetchEmployee(id as string),
  });

  // Fixed mapping to dive deep into employeePayload.data
  useEffect(() => {
    if (employeePayload?.data) {
      const emp = employeePayload.data;
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
        home_phone: emp.home_phone ?? "",
      });
    }
  }, [employeePayload]);

  const mutation = useMutation({
    mutationFn: (updatedFields: typeof formData) => updateEmployee(id as string, updatedFields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      queryClient.invalidateQueries({ queryKey: ["employee", id] });
      router.push(`/employees`);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  // Prevent an empty unpopulated form layout from showing while fetching
  if (isLoading) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="text-sm font-medium text-slate-400 animate-pulse">
          Loading employee profile files...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="Edit Employee"
        description={`Modify information file logs for ${formData.first_name} ${formData.last_name}.`}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* CARD 1: Identity Profile Logging */}
          <AppCard title="Identity" description="Update core personal identification parameters.">
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
                <AppInput name="suffix" value={formData.suffix} onChange={handleChange} placeholder="e.g. Jr., III" />
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
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition outline-none focus:border-slate-400"
                >
                  <option value="">Select Gender</option>
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

          {/* CARD 2: Contact Specifications */}
          <AppCard title="Contact" description="Manage network routing reachability hooks.">
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
                <AppInput name="home_phone" value={formData.home_phone} onChange={handleChange} />
              </div>
            </div>
          </AppCard>

        </div>

        {/* Form Submission Action Interface */}
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
          <AppButton type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </AppButton>
          <AppButton type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving Changes..." : "Save Changes"}
          </AppButton>
        </div>
      </form>
    </div>
  );
}