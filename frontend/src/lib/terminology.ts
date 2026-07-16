import { useQuery } from "@tanstack/react-query";
import { getMe } from "./auth";

// Company codes whose "branches" are really agencies (manpower/recruitment).
// The DB concept stays "branch" everywhere; only the on-screen wording changes.
const AGENCY_COMPANY_CODES = new Set(["PASEI"]);

export type BranchTerm = {
  singular: string; // "branch"  | "agency"
  plural: string;   // "branches"| "agencies"
  Singular: string; // "Branch"  | "Agency"
  Plural: string;   // "Branches"| "Agencies"
};

const BRANCH: BranchTerm = { singular: "branch", plural: "branches", Singular: "Branch", Plural: "Branches" };
const AGENCY: BranchTerm = { singular: "agency", plural: "agencies", Singular: "Agency", Plural: "Agencies" };

/** The branch/agency wording for a given company code (falls back to "branch"). */
export function branchTermFor(companyCode?: string | null): BranchTerm {
  return companyCode && AGENCY_COMPANY_CODES.has(companyCode) ? AGENCY : BRANCH;
}

/** Branch/agency wording for the viewer's currently active company. */
export function useBranchTerm(): BranchTerm {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: getMe });
  return branchTermFor(me?.user.active_company?.code);
}

/** Swap the word "Branch"/"Branches" in a fixed label for the active company's term. */
export function applyBranchTerm(label: string, term: BranchTerm): string {
  return label
    .replace(/\bBranches\b/g, term.Plural)
    .replace(/\bBranch\b/g, term.Singular);
}
