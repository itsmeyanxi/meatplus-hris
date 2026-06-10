"use client";

import { useQuery } from "@tanstack/react-query";
import { getMe } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export default function DashboardPage() {
  const { data: meData, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  if (isLoading || !meData) {
    return <div className="p-8 text-center text-slate-500">Loading dashboard...</div>;
  }

  const { user } = meData;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name || "User"}. Here is your overview.`}
      />

      <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-8 text-white shadow-xl sm:px-10">
        <div className="relative z-10">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome to Meatplus HRIS</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-300 sm:text-base">
            Manage your attendance, view your profile, and request access to system features from one central place.
          </p>
        </div>
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-slate-800 opacity-50" />
      </section>
    </div>
  );
}
