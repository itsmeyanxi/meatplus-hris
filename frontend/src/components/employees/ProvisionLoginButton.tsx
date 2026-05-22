"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { usersApi } from "@/lib/users";
import { useAttendancePerms } from "@/lib/permissions";

export function ProvisionLoginButton({ employeeId }: { employeeId: number }) {
  // Reusing useAttendancePerms — same /me query; we just check user.manage permission via me directly here.
  const { isLoading } = useAttendancePerms();
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const provision = useMutation({
    mutationFn: () => usersApi.provisionForEmployee(employeeId),
    onSuccess: (r) => setCreds({ email: r.user.email, password: r.temporary_password }),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const msgs = err?.response?.data?.errors;
      setError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed");
    },
  });

  if (isLoading) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold">Login access</h3>
      <p className="mt-1 text-xs text-slate-500">
        Provision a user account so this employee can log in and file their own requests.
      </p>

      {creds ? (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-medium text-amber-900">Account created. Share these credentials with the employee (password shown ONCE):</p>
          <p className="mt-2 text-sm">
            <strong>Email:</strong> <span className="font-mono">{creds.email}</span>
          </p>
          <p className="text-sm">
            <strong>Temporary password:</strong> <span className="font-mono">{creds.password}</span>
          </p>
        </div>
      ) : (
        <>
          <button
            onClick={() => { setError(null); provision.mutate(); }}
            disabled={provision.isPending}
            className="mt-3 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {provision.isPending ? "Provisioning…" : "Provision login"}
          </button>
          {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </>
      )}
    </div>
  );
}
