"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { forgotPassword } from "@/lib/auth";
import { usersApi } from "@/lib/users";
import { invitationsApi } from "@/lib/invitations";
import { useAttendancePerms } from "@/lib/permissions";

export function ProvisionLoginButton({ employeeId }: { employeeId: number }) {
  const { isLoading } = useAttendancePerms();

  // Invitation state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSent, setInviteSent] = useState<{ email: string; expires_at: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Password reset state
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");

  // Direct provision state
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => invitationsApi.send(employeeId, inviteEmail || undefined),
    onSuccess: (r) => setInviteSent({ email: inviteEmail || "the employee", expires_at: r.expires_at }),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const msgs = err?.response?.data?.errors;
      setInviteError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed to send invitation.");
    },
  });

  const sendReset = useMutation({
    mutationFn: (email: string) => forgotPassword(email),
    onSuccess: () => setResetSent(true),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } } };
      setResetError(err?.response?.data?.message ?? "Failed to send reset email.");
    },
  });

  const provision = useMutation({
    mutationFn: () => usersApi.provisionForEmployee(employeeId),
    onSuccess: (r) => setCreds({ email: r.user.email, password: r.temporary_password }),
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const msgs = err?.response?.data?.errors;
      setProvisionError(msgs ? Object.values(msgs).flat().join(" ") : err?.response?.data?.message ?? "Failed.");
    },
  });

  if (isLoading) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold">Login access</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Grant this employee access to log in and manage their own requests.
        </p>
      </div>

      {/* ── Send invitation (recommended) ── */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-700">Send invitation email</p>
          <p className="text-xs text-slate-500 mt-0.5">
            The employee receives a link to choose their own username and password.
          </p>
        </div>

        {inviteSent ? (
          <div className="rounded-md border border-green-200 bg-green-50 p-3">
            <p className="text-xs font-medium text-green-800">
              Invitation sent! The link expires on{" "}
              {new Date(inviteSent.expires_at).toLocaleString("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              .
            </p>
            <button
              onClick={() => { setInviteSent(null); setInviteEmail(""); setInviteError(null); }}
              className="mt-2 text-xs text-green-700 underline"
            >
              Send another
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Override email (optional)"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
              />
              <button
                onClick={() => { setInviteError(null); invite.mutate(); }}
                disabled={invite.isPending}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60 whitespace-nowrap"
              >
                {invite.isPending ? "Sending…" : "Send invite"}
              </button>
            </div>
            {inviteError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{inviteError}</p>
            )}
          </>
        )}
      </div>

      {/* ── Password reset ── */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-700">Send password reset</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Employee already has an account but forgot their password. Send a reset link to their email.
          </p>
        </div>
        {resetSent ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-medium text-emerald-800">Reset link sent!</p>
            <button
              onClick={() => { setResetSent(false); setResetEmail(""); setResetError(null); }}
              className="mt-1 text-xs text-emerald-700 underline"
            >
              Send again
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email address *"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-slate-500"
              />
              <button
                onClick={() => { setResetError(null); if (resetEmail) sendReset.mutate(resetEmail); }}
                disabled={sendReset.isPending || !resetEmail}
                className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600 disabled:opacity-50 whitespace-nowrap"
              >
                {sendReset.isPending ? "Sending…" : "Send reset"}
              </button>
            </div>
            {resetError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{resetError}</p>
            )}
          </>
        )}
      </div>

      {/* ── Direct provision (manual) ── */}
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-3">
        <div>
          <p className="text-xs font-semibold text-slate-700">Provision directly</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Create an account now and share the temporary password manually.
          </p>
        </div>

        {creds ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-1">
            <p className="text-xs font-medium text-amber-900">Account created. Share with the employee (password shown once):</p>
            <p className="text-xs">
              <span className="text-amber-700">Email:</span>{" "}
              <span className="font-mono">{creds.email}</span>
            </p>
            <p className="text-xs">
              <span className="text-amber-700">Temp password:</span>{" "}
              <span className="font-mono">{creds.password}</span>
            </p>
          </div>
        ) : (
          <>
            <button
              onClick={() => { setProvisionError(null); provision.mutate(); }}
              disabled={provision.isPending}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {provision.isPending ? "Provisioning…" : "Provision login"}
            </button>
            {provisionError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{provisionError}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
