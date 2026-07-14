"use client";

import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth";
import { PasswordField, isPasswordValid } from "@/components/PasswordField";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await resetPassword(token, email, password, confirmation);
      setDone(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "Failed to reset password. The link may have expired.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="text-center">
        <p className="text-sm text-red-600">Invalid or expired reset link.</p>
        <Link href="/forgot-password" className="mt-4 block text-sm text-slate-600 hover:text-slate-900">
          Request a new link →
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">Password updated</p>
          <p className="mt-1 text-sm text-emerald-700">
            Your password has been reset. You can now sign in with your new password.
          </p>
        </div>
        <Link
          href="/login"
          className="block text-center text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Go to login →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasswordField label="New password" value={password} onChange={setPassword} />
      <div>
        <label htmlFor="confirmation" className="mb-1 block text-sm font-medium">
          Confirm new password
        </label>
        <input
          id="confirmation"
          type="password"
          required
          autoComplete="new-password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
      </div>
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading || !isPasswordValid(password)}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {loading ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold">Set new password</h1>
        <p className="mb-6 text-sm text-slate-500">
          Choose a strong password of at least 8 characters.
        </p>
        <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
