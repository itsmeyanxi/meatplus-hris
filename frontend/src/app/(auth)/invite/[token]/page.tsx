"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { invitationsApi } from "@/lib/invitations";

const schema = z
  .object({
    username: z
      .string()
      .min(3, "At least 3 characters")
      .max(40, "At most 40 characters")
      .regex(/^[a-zA-Z0-9_-]+$/, "Letters, numbers, _ and - only"),
    password: z.string().min(8, "At least 8 characters"),
    password_confirmation: z.string().min(1, "Confirm your password"),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: "Passwords do not match",
    path: ["password_confirmation"],
  });

type FormValues = z.infer<typeof schema>;

type InviteInfo = {
  email: string;
  name: string;
  expires_at: string;
};

export default function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!token) return;
    invitationsApi
      .show(token)
      .then(setInfo)
      .catch(() => setLoadError("This invitation link is invalid or has expired."));
  }, [token]);

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      await invitationsApi.accept(token, values);
      setDone(true);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { errors?: Record<string, string[]>; message?: string } } };
      const fieldErrors = err?.response?.data?.errors;
      if (fieldErrors) {
        setServerError(Object.values(fieldErrors).flat().join(" "));
      } else {
        setServerError(err?.response?.data?.message ?? "Something went wrong. Try again.");
      }
    }
  };

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-medium text-red-800">{loadError}</p>
          <p className="mt-2 text-xs text-red-600">Please contact HR to request a new invitation.</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-green-200 bg-green-50 p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-green-900">Account ready!</p>
            <p className="mt-1 text-sm text-green-700">You can now log in with your username and password.</p>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold">Welcome, {info.name.split(" ")[0]}!</h1>
        <p className="mb-1 text-sm text-slate-500">Set up your Meatplus HRIS account.</p>
        <p className="mb-6 text-xs text-slate-400">
          Account email: <span className="font-medium text-slate-600">{info.email}</span>
        </p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium">
              Choose a username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. juan.dela.cruz"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              {...register("username")}
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password_confirmation" className="mb-1 block text-sm font-medium">
              Confirm password
            </label>
            <input
              id="password_confirmation"
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
              {...register("password_confirmation")}
            />
            {errors.password_confirmation && (
              <p className="mt-1 text-xs text-red-600">{errors.password_confirmation.message}</p>
            )}
          </div>

          {serverError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {isSubmitting ? "Setting up…" : "Set up account"}
          </button>
        </form>
      </div>
    </div>
  );
}
