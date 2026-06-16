"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.67 20h18.66a1 1 0 00.86-1.44l-8.48-14.7a1 1 0 00-1.72 0z" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        An unexpected error occurred. You can try again, or head back to the dashboard.
      </p>
      {error?.digest && (
        <p className="mt-2 font-mono text-xs text-slate-400">Ref: {error.digest}</p>
      )}
      <div className="mt-6 flex items-center gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
