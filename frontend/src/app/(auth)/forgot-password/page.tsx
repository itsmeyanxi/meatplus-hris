"use client";

import Link from "next/link";
import { useState } from "react";
import { forgotPassword } from "@/lib/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch {
      // Swallow errors — always show success to prevent email enumeration.
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold">Reset password</h1>
        <p className="mb-6 text-sm text-slate-500">
          Enter your email address and we&apos;ll send you a reset link.
        </p>

        {sent ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">Check your inbox</p>
              <p className="mt-1 text-sm text-emerald-700">
                If an account is registered under <strong>{email}</strong>, a reset
                link has been sent. It expires in 60 minutes.
              </p>
            </div>
            <Link
              href="/login"
              className="block text-center text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              ← Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
            <Link
              href="/login"
              className="block text-center text-sm text-slate-500 hover:text-slate-700"
            >
              ← Back to login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
