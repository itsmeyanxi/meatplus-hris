"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { ApplicationsTab } from "@/components/leaves/ApplicationsTab";
import { BalancesTab } from "@/components/leaves/BalancesTab";
import { TypesTab } from "@/components/leaves/TypesTab";

type TabKey = "applications" | "balances" | "types";

export default function LeavesPage() {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const canManageTypes = data?.user.permissions.includes("leave.manage_types") ?? false;

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "applications", label: "Applications" },
    { key: "balances", label: "Balances" },
    ...(canManageTypes ? [{ key: "types" as const, label: "Types" }] : []),
  ];

  const [active, setActive] = useState<TabKey>("applications");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leaves"
        description="File, approve, and track leave applications and balances."
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={
              active === t.key
                ? "-mb-px border-b-2 border-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-900"
                : "-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "applications" && <ApplicationsTab />}
      {active === "balances" && <BalancesTab />}
      {active === "types" && canManageTypes && <TypesTab />}
    </div>
  );
}
