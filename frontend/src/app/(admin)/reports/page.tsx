"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui";
import { getLookup } from "@/lib/employees";
import { EmployeeSearchSelect } from "@/components/EmployeeSearchSelect";
import {
  getEmployeeMasterFields,
  previewEmployeeMaster,
  downloadEmployeeMaster,
  type MasterField,
  type MasterPreview,
} from "@/lib/reports";
import { ImportEmployeesModal } from "@/components/employees/ImportEmployeesModal";

// Columns pre-ticked on first load — the common identity + job fields. Any that
// the viewer can't access (e.g. pay columns) are simply skipped.
const DEFAULT_FIELDS = [
  "employee_no", "last_name", "first_name", "middle_name",
  "gender", "department", "location", "position",
  "employment_type", "status", "date_hired", "mobile",
];

const GROUP_ORDER = ["Identity", "Personal", "Employment", "Government", "Contact", "Compensation", "Bank"];

export default function ReportsPage() {
  const { data: fieldsData } = useQuery({ queryKey: ["report-fields"], queryFn: getEmployeeMasterFields });
  const { data: departments = [] } = useQuery({ queryKey: ["lookups", "departments"], queryFn: () => getLookup("departments"), staleTime: 5 * 60 * 1000 });
  const { data: branches = [] } = useQuery({ queryKey: ["lookups", "branches"], queryFn: () => getLookup("branches"), staleTime: 5 * 60 * 1000 });

  const allFields = useMemo(() => fieldsData?.fields ?? [], [fieldsData]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deptIds, setDeptIds] = useState<number[]>([]);
  const [branchIds, setBranchIds] = useState<number[]>([]);
  const [employeeId, setEmployeeId] = useState<number | "">("");
  const [excludeInactive, setExcludeInactive] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [preview, setPreview] = useState<MasterPreview | null>(null);
  const [busy, setBusy] = useState<null | "search" | "xlsx" | "csv">(null);
  const [error, setError] = useState<string | null>(null);

  // Tick the sensible defaults once the catalog arrives.
  useEffect(() => {
    if (allFields.length && selected.size === 0) {
      const keys = new Set(allFields.map((f) => f.key));
      setSelected(new Set(DEFAULT_FIELDS.filter((k) => keys.has(k))));
    }
  }, [allFields, selected.size]);

  const grouped = useMemo(() => {
    const map = new Map<string, MasterField[]>();
    for (const f of allFields) {
      if (!map.has(f.group)) map.set(f.group, []);
      map.get(f.group)!.push(f);
    }
    return [...map.entries()].sort((a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0]));
  }, [allFields]);

  const toggleField = (key: string) =>
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selectAll = () => setSelected(new Set(allFields.map((f) => f.key)));
  const deselectAll = () => setSelected(new Set());
  const toggleIn = (arr: number[], id: number) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  const filters = () => ({
    fields: allFields.map((f) => f.key).filter((k) => selected.has(k)), // keep catalog order
    department_ids: deptIds,
    branch_ids: branchIds,
    employee_id: employeeId,
    exclude_inactive: excludeInactive,
  });

  const run = async (what: "search" | "xlsx" | "csv") => {
    if (selected.size === 0) { setError("Select at least one field to include."); return; }
    setError(null); setBusy(what);
    try {
      if (what === "search") setPreview(await previewEmployeeMaster(filters()));
      else await downloadEmployeeMaster(filters(), what);
    } catch {
      setError(what === "search" ? "Failed to load preview." : "Failed to download.");
    } finally {
      setBusy(null);
    }
  };

  // Split the branch filter so worksites, agencies and project crews are clearly
  // separate (they were previously lumped into one "Location" list). All three
  // feed the same branch_ids selection.
  const locationBranches = branches.filter((b) => !b.is_agency && !b.is_project_crew);
  const agencyBranches = branches.filter((b) => b.is_agency);
  const projectBranches = branches.filter((b) => b.is_project_crew);

  // Columns that round-trip through Employees → Import (fill new rows, re-upload).
  const importableKeys = useMemo(() => allFields.filter((f) => f.importable).map((f) => f.key), [allFields]);
  const selectImportTemplate = () => setSelected(new Set(importableKeys));
  const activeCompanies = fieldsData?.company ? [{ id: fieldsData.company.id, name: fieldsData.company.name }] : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee List Report"
        description="Choose the columns you want, filter the employees, then preview on screen or export to Excel / CSV. Leave the columns as-is to capture the standard set."
      />

      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
        {/* Filters */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Labeled label="Company">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {fieldsData?.company?.name ?? "Active company"}
            </div>
          </Labeled>
          <Labeled label="Employee">
            <EmployeeSearchSelect
              value={employeeId}
              onChange={(id) => setEmployeeId(id === "" ? "" : Number(id))}
              placeholder="All employees"
              className="mt-0.5 block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </Labeled>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={excludeInactive} onChange={(e) => setExcludeInactive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Exclude inactive employees
            </label>
          </div>
        </div>

        <ChipFilter label="Department" items={departments.map((d) => ({ id: d.id, name: d.name ?? "" }))} selected={deptIds} onToggle={(id) => setDeptIds((a) => toggleIn(a, id))} onClear={() => setDeptIds([])} />
        <ChipFilter label="Location" items={locationBranches.map((b) => ({ id: b.id, name: b.name ?? "" }))} selected={branchIds} onToggle={(id) => setBranchIds((a) => toggleIn(a, id))} onClear={() => setBranchIds((a) => a.filter((id) => !locationBranches.some((b) => b.id === id)))} />
        {agencyBranches.length > 0 && (
          <ChipFilter label="Agencies" items={agencyBranches.map((b) => ({ id: b.id, name: b.name ?? "" }))} selected={branchIds} onToggle={(id) => setBranchIds((a) => toggleIn(a, id))} onClear={() => setBranchIds((a) => a.filter((id) => !agencyBranches.some((b) => b.id === id)))} />
        )}
        {projectBranches.length > 0 && (
          <ChipFilter label="Project-based" items={projectBranches.map((b) => ({ id: b.id, name: b.name ?? "" }))} selected={branchIds} onToggle={(id) => setBranchIds((a) => toggleIn(a, id))} onClear={() => setBranchIds((a) => a.filter((id) => !projectBranches.some((b) => b.id === id)))} />
        )}

        {/* Field picker */}
        <div className="border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Columns to include <span className="text-slate-400">({selected.size} selected)</span></h3>
            <div className="flex gap-2">
              <button type="button" onClick={selectImportTemplate} className="rounded-md border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50" title="Pick only the columns you can fill and re-upload via Employees → Import">Import template ⇄</button>
              <button type="button" onClick={selectAll} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Select All</button>
              <button type="button" onClick={deselectAll} className="rounded-md border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50">Deselect All</button>
            </div>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            <span className="font-semibold text-brand-700">⇄</span> = round-trip column: export it, fill in new or updated staff, then re-upload under <strong>Employees → Import</strong>. Un-marked columns are export/display-only.
          </p>

          <div className="space-y-4">
            {grouped.map(([group, fields]) => (
              <div key={group}>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{group}</div>
                <div className="flex flex-wrap gap-2">
                  {fields.map((f) => {
                    const on = selected.has(f.key);
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => toggleField(f.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                        }`}
                        title={f.sensitive ? "Sensitive pay data — hidden for confidential employees you can't view" : f.importable ? "Round-trip column — can be filled and re-uploaded via Employees → Import" : "Export / display-only column"}
                      >
                        {f.label}
                        {f.importable && <span className={on ? "text-white/70" : "text-brand-600"}> ⇄</span>}
                        {f.sensitive && <span className={on ? "text-amber-200" : "text-amber-500"}> •</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <ActionButton onClick={() => run("search")} busy={busy === "search"} variant="outline">Search (preview)</ActionButton>
          <ActionButton onClick={() => run("xlsx")} busy={busy === "xlsx"} variant="solid">Download as Excel</ActionButton>
          <ActionButton onClick={() => run("csv")} busy={busy === "csv"} variant="solid">Download as Flat File (CSV)</ActionButton>
          <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            title="Fill a downloaded template with new/updated staff and upload it"
          >
            ⇄ Import filled sheet
          </button>
        </div>
      </div>

      {showImport && (
        <ImportEmployeesModal
          mode="organic"
          companies={activeCompanies}
          onClose={() => setShowImport(false)}
          onDone={() => setShowImport(false)}
        />
      )}

      {/* Preview */}
      {preview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Preview</h3>
            <span className="text-xs text-slate-500">
              {preview.truncated ? `Showing first ${preview.returned} of ${preview.total}` : `${preview.total} employee${preview.total === 1 ? "" : "s"}`}
            </span>
          </div>
          {preview.rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No employees match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    {preview.columns.map((c) => <th key={c.key} className="whitespace-nowrap px-3 py-2 font-semibold">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/60">
                      {preview.columns.map((c) => (
                        <td key={c.key} className="whitespace-nowrap px-3 py-1.5 text-slate-700">{row[c.key] === null || row[c.key] === "" ? "—" : String(row[c.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function ChipFilter({ label, items, selected, onToggle, onClear }: {
  label: string;
  items: { id: number; name: string }[];
  selected: number[];
  onToggle: (id: number) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="text-[11px] text-slate-400">{selected.length ? `${selected.length} selected` : "All"}</span>
        {selected.length > 0 && <button type="button" onClick={onClear} className="text-[11px] font-medium text-amber-600 hover:underline">clear</button>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 && <span className="text-xs text-slate-400">None available.</span>}
        {items.map((it) => {
          const on = selected.includes(it.id);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {it.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActionButton({ onClick, busy, variant, children }: {
  onClick: () => void;
  busy: boolean;
  variant: "solid" | "outline";
  children: React.ReactNode;
}) {
  const base = "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50";
  const cls = variant === "solid"
    ? `${base} bg-brand-600 text-white hover:bg-brand-700`
    : `${base} border border-slate-300 text-slate-700 hover:bg-slate-100`;
  return (
    <button onClick={onClick} disabled={busy} className={cls}>
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
