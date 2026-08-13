"use client";

import { Suspense, type ReactNode } from "react";
import { useSwitchToCompanyParam } from "@/lib/useSwitchToCompanyParam";

/**
 * Wraps page content so that opening it with `?company=<id>` (e.g. from a
 * cross-company HR/approver notification) switches to that company BEFORE showing
 * anything — no flash of the wrong company's (usually empty) data. useSearchParams
 * needs a Suspense boundary, hence the wrapper.
 */
export function CompanySwitchGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { switching } = useSwitchToCompanyParam();

  if (switching) {
    return <div className="py-20 text-center text-sm text-slate-400">Switching to the right company…</div>;
  }

  return <>{children}</>;
}
