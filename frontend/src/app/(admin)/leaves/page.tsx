"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { getMe } from "@/lib/auth";
import { ImportDataButton } from "@/components/ImportDataButton";
import { leaveAppsApi } from "@/lib/leaves";
import { ApplicationsTab } from "@/components/leaves/ApplicationsTab";
import { BalancesTab } from "@/components/leaves/BalancesTab";
import { TypesTab } from "@/components/leaves/TypesTab";

type TabKey = "applications" | "balances" | "types";

export default function LeavesPage() {
  const { data } = useQuery({ queryKey: ["me"], queryFn: getMe });
  const perms = data?.user.permissions ?? [];
  const isItAdmin = data?.user.roles?.includes("it_admin") ?? false;
  const canManageTypes = perms.includes("leave.manage_types");
  const canImport = isItAdmin || perms.includes("leave.approve.any");

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
        actions={canImport ? (
          <ImportDataButton
            label="Import leaves"
            title="Import leave applications"
            description="Bulk-upload a leave report. Existing leaves (same employee, type & dates) are skipped, so re-importing never duplicates."
            columns="EmployeeID · LeaveTypeName · DateFrom · DateTo · WithPay days · WoutPay days · Reason · LeaveStatus"
            templateUrl={leaveAppsApi.importTemplateUrl}
            importFn={leaveAppsApi.import}
            invalidateKeys={[["leave-applications"]]}
          />
        ) : undefined}
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
