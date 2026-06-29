<?php

namespace App\Domain\HRIS\Services;

use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmploymentType;
use App\Domain\HRIS\Models\Position;
use App\Domain\Identity\Models\Branch;
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
        'employment_type' => ['employment type', 'employment_type', 'emp type', 'type'],
        'date_hired' => ['date hired', 'date_hired', 'hire date', 'hired', 'date of hire'],
        'birth_date' => ['birth date', 'birth_date', 'date of birth', 'dob', 'birthday'],
    ];

    /** @var array<string,int> name(lower) => id */
    private array $deptCache = [];
    private array $branchCache = [];
    private array $positionCache = [];
    private array $empTypeCache = [];

    /**
     * @return array{created:int, updated:int, skipped:int, total:int, errors:array<int,array{row:int,message:string}>}
     */
    public function import(string $path, string $ext, int $companyId): array
    {
        $rows = $this->readRows($path, $ext);
        if (count($rows) < 2) {
            return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0,
                'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        $map = $this->mapHeader(array_shift($rows));
        foreach (['employee_no', 'first_name', 'last_name'] as $required) {
            if (! isset($map[$required])) {
                return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0,
                    'errors' => [['row' => 1, 'message' => "Missing required column for: {$required} (check the header row)."]]];
            }
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];
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

            if ($employeeNo === '' || $first === '' || $last === '') {
                $errors[] = ['row' => $line, 'message' => 'Missing Employee ID, First Name, or Last Name.'];

                continue;
            }

            try {
                // Fields supplied (non-empty) in this row. Empty cells are omitted
                // so they never overwrite existing data — a partially-filled file
                // safely backfills blanks without wiping anything.
                $present = ['first_name' => $first, 'last_name' => $last];
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
                if (($b = $get('location')) !== '') {
                    $present['branch_id'] = $this->resolveBranch($companyId, $b);
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

                $existing = Employee::query()
                    ->where('company_id', $companyId)
                    ->where('employee_no', $employeeNo)
                    ->first();

                if ($existing) {
                    $existing->fill($present);
                    if ($existing->isDirty()) {
                        $existing->save();
                        $updated++;
                    } else {
                        $skipped++; // already up to date
                    }
                } else {
                    Employee::create($present + [
                        'company_id' => $companyId,
                        'employee_no' => $employeeNo,
                        'is_active' => true,
                    ]);
                    $created++;
                }
            } catch (\Throwable $e) {
                $errors[] = ['row' => $line, 'message' => $e->getMessage()];
            }
        }

        return ['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors];
    }

    /** @return array<int,array<int,string>> */
    private function readRows(string $path, string $ext): array
    {
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
                'is_active' => true,
            ]);

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
