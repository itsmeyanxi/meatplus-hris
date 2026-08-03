import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold tracking-tight text-slate-900">404</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-800">Page not found</h1>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
