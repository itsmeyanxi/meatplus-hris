"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { changePassword, logout } from "@/lib/auth";
import { PasswordField, isPasswordValid } from "@/components/PasswordField";
import { AppButton } from "@/components/ui";
import { inputCls, labelCls } from "@/lib/form-classes";

/**
 * Full-screen gate shown when the signed-in user still has a shared/temporary
 * password (must_change_password). Blocks the rest of the app until they set a
 * password of their own. Reuses the standard change-password endpoint, which
 * clears the flag on success; then we refetch /me so the app unlocks.
 */
export function ForcePasswordChange() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ current_password: "", password: "", password_confirmation: "" });

  const mutation = useMutation({
    mutationFn: () => changePassword(form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  const apiErr = mutation.error as
    | { response?: { data?: { errors?: Record<string, string[]>; message?: string } } }
    | null;
  const fieldErrors = apiErr?.response?.data?.errors ?? {};
  const generalError = apiErr?.response?.data?.message;

  const canSubmit =
    form.current_password.length > 0 &&
    isPasswordValid(form.password) &&
    form.password === form.password_confirmation;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900">Set your own password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Your account was created with a temporary password. For security, please choose a new
            password before continuing.
          </p>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (canSubmit) mutation.mutate(); }}
          className="space-y-3"
        >
          <div>
            <label className={labelCls}>Temporary password</label>
            <input
              type="password"
              className={inputCls}
              placeholder="The password you were given"
              value={form.current_password}
              onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
              required
              autoComplete="current-password"
            />
            {fieldErrors.current_password && (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.current_password[0]}</p>
            )}
          </div>

          <PasswordField
            label="New password"
            value={form.password}
            onChange={(v) => setForm((f) => ({ ...f, password: v }))}
          />
          {fieldErrors.password && <p className="-mt-2 text-xs text-red-500">{fieldErrors.password[0]}</p>}

          <div>
            <label className={labelCls}>Confirm new password</label>
            <input
              type="password"
              className={inputCls}
              placeholder="••••••••"
              value={form.password_confirmation}
              onChange={(e) => setForm((f) => ({ ...f, password_confirmation: e.target.value }))}
              required
              autoComplete="new-password"
            />
            {form.password_confirmation.length > 0 && form.password !== form.password_confirmation && (
              <p className="mt-1 text-xs text-red-500">Passwords don&apos;t match.</p>
            )}
          </div>

          {generalError && (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {generalError}
            </div>
          )}

          <AppButton type="submit" disabled={mutation.isPending || !canSubmit} className="w-full justify-center">
            {mutation.isPending ? "Saving…" : "Save password & continue"}
          </AppButton>
        </form>

        <button
          type="button"
          onClick={async () => { await logout(); window.location.href = "/login"; }}
          className="mt-3 w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          Sign out instead
        </button>
      </div>
    </div>
  );
}
