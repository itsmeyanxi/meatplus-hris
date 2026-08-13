"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { getMe, switchCompany } from "@/lib/auth";

/**
 * When a page is opened with `?company=<id>` (e.g. from a cross-company HR
 * notification) and that differs from the viewer's active company, switch to it
 * and reload — so the admin lands on the right company's data instead of an empty
 * "all clear" for whichever company they happened to be viewing.
 *
 * Returns { switching } so the page can show a brief loading state instead of
 * flashing the wrong company's (usually empty) result before the reload.
 */
export function useSwitchToCompanyParam(): { switching: boolean } {
  const params = useSearchParams();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });

  const target = Number(params.get("company")) || null;
  const active = me?.user.active_company?.id ?? null;
  // Only act once we know the active company; a mismatch means we must switch.
  const switching = !!target && active !== null && active !== target;

  useEffect(() => {
    if (!switching || !target) return;
    switchCompany(target)
      .then(() => window.location.reload())
      .catch(() => {
        /* the global error toast surfaces any access problem */
      });
  }, [switching, target]);

  return { switching };
}
