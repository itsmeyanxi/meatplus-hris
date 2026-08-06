<?php

namespace App\Domain\HRIS\Services;

use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeGovernmentId;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\EmployeePayrollProfile;
use Carbon\Carbon;
use Illuminate\Support\Str;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk-imports employees from an uploaded CSV/XLSX. Departments, branches
 * (the "Location" column), positions and employment types are resolved by name
 * and created on the fly when missing. Dates (hire/birth) accept any common
 * format (Y-m-d is safest). Rows whose Employee ID already exists are UPDATED
 * (blank cells never overwrite existing data); new IDs are created.
 */
class EmployeeImportService
{
    /** Canonical column => accepted header aliases (lower-cased, space-collapsed). */
    private const ALIASES = [
        'employee_no' => ['employee id', 'employee no', 'employee number', 'emp id', 'id', 'employee_no'],
        'last_name' => ['last name', 'surname', 'last_name'],
        'middle_name' => ['middle name', 'middle_name', 'mi'],
        'first_name' => ['first name', 'given name', 'first_name'],
        'gender' => ['gender', 'sex'],
        'civil_status' => ['civil status', 'civil_status', 'marital status'],
        'department' => ['department', 'dept'],
        'location' => ['location', 'branch', 'site', 'office'],
        'email' => ['email', 'email address', 'e-mail'],
        'position' => ['position', 'job title', 'title', 'designation', 'role'],
        'employment_type' => ['employment type', 'employment_type', 'emp type', 'type', 'employee type'],
        'date_hired' => ['date hired', 'date_hired', 'hire date', 'hired', 'date of hire'],
        'birth_date' => ['birth date', 'birth_date', 'date of birth', 'dob', 'birthday'],
        // Employment status + separation, so resigned/terminated staff import as
        // inactive (and are excluded from payroll) instead of active.
        'employee_status' => ['employee status', 'employment status', 'status'],
        'separation_date' => ['separation date', 'date separated', 'date resigned', 'resignation date', 'separated', 'date of separation'],
        // Confidential payroll classification (only applied when the uploader has
        // the sensitive permission).
        'is_confidential' => ['confidential', 'is confidential', 'confidentiality', 'payroll group', 'pay group', 'confidential?'],
        // Biometric device PIN — matches the terminal's user ID so punches map.
        'biometric_user_id' => ['biometric id', 'biometric_user_id', 'biometric user id', 'device pin', 'device id', 'biometric', 'bio id'],
        // Government IDs (stored encrypted).
        'sss' => ['sss', 'sss no', 'sss number', 'sss no.'],
        'tin' => ['tin', 'tin no', 'tin number', 'tin no.'],
        'philhealth' => ['philhealth', 'philhealth no', 'phic', 'philhealth no.'],
        'pagibig' => ['pag-ibig no', 'pag-ibig no.', 'pagibig', 'pag-ibig', 'hdmf', 'pagibig no'],
        'passport' => ['passport no', 'passport no.', 'passport', 'passport number'],
        'prc' => ['prc no', 'prc no.', 'prc', 'prc number', 'prc license'],
        // Compensation.
        'base_salary' => ['base salary', 'basic salary', 'basic', 'basic monthly', 'monthly rate', 'salary'],
        'de_minimis' => ['de minimis', 'de-minimis'],
        'transportation' => ['transportation'],
        'meal' => ['meal'],
        'communication' => ['communication'],
        'travel' => ['travel'],
        'allowance_others' => ['others', 'other allowance'],
    ];

    /** @var array<string,int> name(lower) => id */
    private array $deptCache = [];
    private array $branchCache = [];
    private array $positionCache = [];
    private array $empTypeCache = [];

    /** When true, branches resolved during this import are flagged is_agency. */
    private bool $asAgency = false;

    /** When true, branches resolved during this import are flagged is_project_crew. */
    private bool $asProjectCrew = false;

    /** When true, a "Confidential" column may set the sensitive is_confidential flag. */
    private bool $allowConfidential = false;

    /** When set, every imported row is assigned to this branch (Branch column ignored). */
    private ?int $forceBranchId = null;

    /**
     * @return array{created:int, updated:int, skipped:int, total:int, errors:array<int,array{row:int,message:string}>, warnings:array<int,array{row:int,message:string}>}
     */
    public function import(string $path, string $ext, int $companyId, bool $asAgency = false, ?int $forceBranchId = null, bool $asProjectCrew = false, bool $allowConfidential = false): array
    {
        $this->asAgency = $asAgency;
        $this->asProjectCrew = $asProjectCrew;
        $this->allowConfidential = $allowConfidential;
        $this->forceBranchId = $forceBranchId;
        $rows = $this->readRows($path, $ext);
        if (count($rows) < 2) {
            return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0, 'warnings' => [],
                'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        $map = $this->mapHeader(array_shift($rows));
        // Only Employee ID is required in the header — names are needed per row only
        // for NEW employees, so an ID-keyed update file (e.g. ID + Confidential) works.
        if (! isset($map['employee_no'])) {
            return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0, 'warnings' => [],
                'errors' => [['row' => 1, 'message' => 'Missing required column for: Employee ID (check the header row).']]];
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];
        $warnings = [];
        // Employee IDs already seen IN THIS FILE, so repeated rows can be flagged (A).
        $seenInFile = []; // employee_no(lower) => first line number
        $line = 1; // header was line 1

        foreach ($rows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) {
                continue; // blank line
            }

            $get = fn (string $key) => isset($map[$key]) ? trim((string) ($cells[$map[$key]] ?? '')) : '';

            $employeeNo = $get('employee_no');
            $first = $get('first_name');
            $last = $get('last_name');

            if ($employeeNo === '') {
                $errors[] = ['row' => $line, 'message' => 'Missing Employee ID.'];

                continue;
            }

            // (A) The same Employee ID appearing twice in this upload. It's still
            // applied (later row wins, matching the upsert), but flagged so the
            // admin knows a row was repeated.
            $noKey = strtolower($employeeNo);
            if (isset($seenInFile[$noKey])) {
                $warnings[] = ['row' => $line, 'message' => "Duplicate Employee ID \"{$employeeNo}\" — also on row {$seenInFile[$noKey]}. The later row was applied."];
            } else {
                $seenInFile[$noKey] = $line;
            }

            try {
                $existing = Employee::query()
                    ->where('company_id', $companyId)
                    ->where('employee_no', $employeeNo)
                    ->first();

                // A NEW employee needs a name; an EXISTING one can be updated by
                // Employee ID alone — so a short "ID + Confidential" (or any
                // single-field) list updates people without re-supplying names.
                if (! $existing && ($first === '' || $last === '')) {
                    $errors[] = ['row' => $line, 'message' => "New employee \"{$employeeNo}\" needs First Name and Last Name."];

                    continue;
                }

                // Fields supplied (non-empty) in this row. Empty cells are omitted
                // so they never overwrite existing data — a partially-filled file
                // safely backfills blanks without wiping anything.
                $present = [];
                if ($first !== '') {
                    $present['first_name'] = $first;
                }
                if ($last !== '') {
                    $present['last_name'] = $last;
                }
                if (($mid = $get('middle_name')) !== '') {
                    $present['middle_name'] = $mid;
                }
                if (($g = $this->normGender($get('gender'))) !== null) {
                    $present['gender'] = $g;
                }
                if (($c = $this->normCivil($get('civil_status'))) !== null) {
                    $present['civil_status'] = $c;
                }
                if (($d = $get('department')) !== '') {
                    $present['department_id'] = $this->resolveDepartment($companyId, $d);
                }
                if ($this->forceBranchId) {
                    // Per-agency bulk upload: every row goes to this branch.
                    $present['branch_id'] = $this->forceBranchId;
                } elseif (($b = $get('location')) !== '') {
                    $present['branch_id'] = $this->resolveBranch($companyId, $b);
                }
                if (($bio = $get('biometric_user_id')) !== '') {
                    $present['biometric_user_id'] = $bio;
                }
                if (($email = $get('email')) !== '') {
                    $present['email_company'] = $email;
                }
                if (($pos = $get('position')) !== '') {
                    $present['position_id'] = $this->resolvePosition($companyId, $pos, $present['department_id'] ?? null);
                }
                if (($et = $get('employment_type')) !== '') {
                    $present['employment_type_id'] = $this->resolveEmploymentType($companyId, $et);
                }
                if (($hired = $this->parseDate($get('date_hired'))) !== null) {
                    $present['date_hired'] = $hired;
                }
                if (($born = $this->parseDate($get('birth_date'))) !== null) {
                    $present['birth_date'] = $born;
                }

                // Employment status: a "Resigned/Terminated/Separated" status (or a
                // separation date) marks the employee INACTIVE — keeping resigned
                // staff out of payroll — while an explicit active status reactivates.
                $sepDate = $this->parseDate($get('separation_date'));
                $statusRaw = strtolower(trim($get('employee_status')));
                if ($statusRaw !== '' || $sepDate !== null) {
                    $separated = $sepDate !== null
                        || (bool) preg_match('/resign|separat|terminat|inactive|awol|dismiss|end.?of.?contract|ended|no longer/', $statusRaw);
                    $present['is_active'] = ! $separated;
                    if ($separated && $sepDate !== null) {
                        $present['date_separated'] = $sepDate;
                    }
                }

                // Confidential classification (sensitive) — set only when the
                // uploader is permitted and the cell has a clear yes/no value.
                if ($this->allowConfidential && ($cv = strtolower(trim($get('is_confidential')))) !== '') {
                    if (str_starts_with($cv, 'non') || in_array($cv, ['0', 'no', 'n', 'false', 'regular', 'normal'], true)) {
                        $present['is_confidential'] = false;
                    } elseif (str_starts_with($cv, 'confi') || in_array($cv, ['1', 'yes', 'y', 'true'], true)) {
                        $present['is_confidential'] = true;
                    }
                }

                if ($existing) {
                    $existing->fill($present);
                    if ($existing->isDirty()) {
                        $existing->save();
                        $updated++;
                    } else {
                        $skipped++; // already up to date
                    }
                    $employee = $existing;
                } else {
                    // (B) A NEW Employee ID whose name + birth date match someone
                    // already in this company is very likely the same person entered
                    // under a second ID. Create it (don't silently block a real new
                    // hire) but warn so the admin can verify.
                    if (isset($present['birth_date'])) {
                        $twin = Employee::query()
                            ->where('company_id', $companyId)
                            ->where('employee_no', '!=', $employeeNo)
                            ->whereRaw('LOWER(first_name) = ?', [strtolower($first)])
                            ->whereRaw('LOWER(last_name) = ?', [strtolower($last)])
                            ->whereDate('birth_date', $present['birth_date'])
                            ->first(['employee_no']);
                        if ($twin) {
                            $warnings[] = ['row' => $line, 'message' => "\"{$first} {$last}\" (ID {$employeeNo}) matches existing employee ID {$twin->employee_no} by name + birth date — created as new; please verify it isn't a duplicate."];
                        }
                    }

                    $employee = Employee::create($present + [
                        'company_id' => $companyId,
                        'employee_no' => $employeeNo,
                        'is_active' => true,
                    ]);
                    $created++;
                }

                $this->applyGovernmentIds($employee, $get);
                $this->applyCompensation($employee, $companyId, $get);
            } catch (\Throwable $e) {
                $errors[] = ['row' => $line, 'message' => $e->getMessage()];
            }
        }

        return ['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors, 'warnings' => $warnings];
    }

    /** Write the government IDs present in the row (encrypted by the model). */
    private function applyGovernmentIds(Employee $employee, callable $get): void
    {
        $clean = fn (string $v) => ($t = preg_replace('/\s+/', '', $v)) === '' ? null : $t;
        $gov = array_filter([
            'tin' => $clean($get('tin')),
            'sss_no' => $clean($get('sss')),
            'philhealth_no' => $clean($get('philhealth')),
            'pagibig_no' => $clean($get('pagibig')),
            'passport_no' => $clean($get('passport')),
            'prc_no' => $clean($get('prc')),
        ], fn ($v) => $v !== null);

        if ($gov) {
            EmployeeGovernmentId::updateOrCreate(['employee_id' => $employee->id], $gov);
        }
    }

    /** Create an active compensation row from base salary + allowances, once. */
    private function applyCompensation(Employee $employee, int $companyId, callable $get): void
    {
        $money = function (string $v): float {
            $v = preg_replace('/[^0-9.\-]/', '', $v);
            return $v === '' ? 0.0 : (float) $v;
        };

        // De-minimis is a tax-exempt benefit that payroll reads from the payroll
        // profile (halved per cutoff), NOT from the taxable allowance — so it is
        // stored separately and kept out of allowance_monthly to avoid double
        // counting. Upsert it even when a salary already exists, so re-importing a
        // corrected file backfills de-minimis onto employees added earlier.
        $deMinimis = $money($get('de_minimis'));
        if ($deMinimis > 0) {
            EmployeePayrollProfile::updateOrCreate(
                ['employee_id' => $employee->id],
                ['de_minimis' => $deMinimis],
            );
        }

        // Non-de-minimis allowances (taxable-style) roll up into allowance_monthly.
        $allowance = 0.0;
        foreach (['transportation', 'meal', 'communication', 'travel', 'allowance_others'] as $a) {
            $allowance += $money($get($a));
        }

        $basic = $money($get('base_salary'));
        if ($basic <= 0) {
            return;
        }
        $existing = EmployeeCompensation::withoutGlobalScopes()
            ->where('employee_id', $employee->id)->where('is_active', true)->first();
        if ($existing) {
            // Correct a previously lumped allowance (which had de-minimis folded in)
            // without adding a second active salary.
            if ((float) $existing->allowance_monthly !== $allowance) {
                $existing->update(['allowance_monthly' => $allowance]);
            }

            return;
        }

        EmployeeCompensation::create([
            'company_id' => $companyId,
            'employee_id' => $employee->id,
            'basic_monthly' => $basic,
            'allowance_monthly' => $allowance,
            'effective_from' => $employee->date_hired?->toDateString() ?? now()->toDateString(),
            'is_active' => true,
        ]);
    }

    /** @return array<int,array<int,string>> */
    private function readRows(string $path, string $ext): array
    {
        if ($ext === 'csv') {
            // Detect and convert encoding to UTF-8 (handles Windows-1252/Latin-1 exports from Excel)
            $raw = file_get_contents($path);
            $encoding = mb_detect_encoding($raw, ['UTF-8', 'Windows-1252', 'ISO-8859-1', 'UTF-16'], true);
            if ($encoding && $encoding !== 'UTF-8') {
                $raw = mb_convert_encoding($raw, 'UTF-8', $encoding);
                $tmp = tempnam(sys_get_temp_dir(), 'imp_');
                file_put_contents($tmp, $raw);
                $path = $tmp;
            }
        }

        $reader = $ext === 'xlsx' ? new XlsxReader() : new CsvReader();
        $reader->open($path);

        $rows = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $rows[] = array_map(
                    fn ($c) => $c instanceof \DateTimeInterface ? $c->format('Y-m-d') : (is_scalar($c) ? (string) $c : ''),
                    $row->toArray(),
                );
            }
            break; // first sheet only
        }
        $reader->close();

        return $rows;
    }

    /** @return array<string,int> canonical key => column index */
    private function mapHeader(array $header): array
    {
        $map = [];
        foreach ($header as $idx => $label) {
            $norm = strtolower(trim(preg_replace('/\s+/', ' ', (string) $label)));
            foreach (self::ALIASES as $canon => $list) {
                if (in_array($norm, $list, true)) {
                    $map[$canon] = $idx;
                    break;
                }
            }
        }

        return $map;
    }

    private function normGender(string $v): ?string
    {
        return match (strtolower(trim($v))) {
            'male', 'm' => 'male',
            'female', 'f' => 'female',
            'other', 'o' => 'other',
            default => null,
        };
    }

    private function normCivil(string $v): ?string
    {
        $v = strtolower(trim($v));

        return in_array($v, ['single', 'married', 'widowed', 'separated', 'divorced'], true) ? $v : null;
    }

    private function resolveDepartment(int $companyId, string $name): int
    {
        $key = strtolower($name);
        if (isset($this->deptCache[$key])) {
            return $this->deptCache[$key];
        }

        $dept = Department::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) = ?', [$key])
            ->first()
            ?? Department::create([
                'company_id' => $companyId,
                'code' => $this->uniqueCode(Department::class, $companyId, $name, 30),
                'name' => $name,
                'is_active' => true,
            ]);

        return $this->deptCache[$key] = $dept->id;
    }

    private function resolveBranch(int $companyId, string $name): int
    {
        $key = strtolower($name);
        if (isset($this->branchCache[$key])) {
            return $this->branchCache[$key];
        }

        $branch = Branch::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) = ?', [$key])
            ->first()
            ?? Branch::create([
                'company_id' => $companyId,
                'code' => $this->uniqueCode(Branch::class, $companyId, $name, 20),
                'name' => $name,
                'is_agency' => $this->asAgency,
                'is_project_crew' => $this->asProjectCrew,
                'is_active' => true,
            ]);

        // Importing as agency / project crew: make sure the (possibly pre-existing)
        // branch is flagged so these workers land in the Agencies / Project Crews
        // module, not the organic Employees list.
        if ($this->asAgency && ! $branch->is_agency) {
            $branch->forceFill(['is_agency' => true])->save();
        }
        if ($this->asProjectCrew && ! $branch->is_project_crew) {
            $branch->forceFill(['is_project_crew' => true])->save();
        }

        return $this->branchCache[$key] = $branch->id;
    }

    /** Resolve a position by title, creating it (optionally under a department) when missing. */
    private function resolvePosition(int $companyId, string $title, ?int $departmentId): int
    {
        $key = strtolower($title);
        if (isset($this->positionCache[$key])) {
            return $this->positionCache[$key];
        }

        $position = Position::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(title) = ?', [$key])
            ->first()
            ?? Position::create([
                'company_id' => $companyId,
                'department_id' => $departmentId,
                'title' => $title,
                'is_active' => true,
            ]);

        return $this->positionCache[$key] = $position->id;
    }

    /** Resolve an employment type by name, creating it when missing. */
    private function resolveEmploymentType(int $companyId, string $name): int
    {
        $key = strtolower($name);
        if (isset($this->empTypeCache[$key])) {
            return $this->empTypeCache[$key];
        }

        $type = EmploymentType::query()
            ->where('company_id', $companyId)
            ->whereRaw('LOWER(name) = ?', [$key])
            ->first()
            ?? EmploymentType::create([
                'company_id' => $companyId,
                'code' => $this->uniqueCode(EmploymentType::class, $companyId, $name, 20),
                'name' => $name,
                'is_regular' => str_contains($key, 'regular') || str_contains($key, 'permanent'),
                'is_active' => true,
            ]);

        return $this->empTypeCache[$key] = $type->id;
    }

    /** Parse a date cell into Y-m-d, or null if blank/unparseable. Y-m-d is safest. */
    private function parseDate(string $v): ?string
    {
        $v = trim($v);
        if ($v === '') {
            return null;
        }

        try {
            return Carbon::parse($v)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    /** Generate a short, unique-per-company code from a name. */
    private function uniqueCode(string $model, int $companyId, string $name, int $maxLen): string
    {
        $base = strtoupper(Str::slug($name, '')) ?: 'X';
        $base = substr($base, 0, $maxLen);

        $code = $base;
        $n = 1;
        while ($model::query()->where('company_id', $companyId)->where('code', $code)->exists()) {
            $code = substr($base, 0, $maxLen - 2).$n;
            $n++;
        }

        return $code;
    }
}
