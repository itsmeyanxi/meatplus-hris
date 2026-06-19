<?php

namespace App\Domain\HRIS\Services;

use App\Domain\HRIS\Models\Department;
use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Branch;
use Illuminate\Support\Str;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk-creates employees from an uploaded CSV/XLSX. Departments and branches
 * (the "Location" column) are resolved by name and created on the fly when
 * missing. Duplicate employee numbers are skipped. Missing structural fields
 * (birth date, hire date, position, employment type) are left blank for HR to
 * complete later — the schema was relaxed to allow that.
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
    ];

    /** @var array<string,int> name(lower) => id */
    private array $deptCache = [];
    private array $branchCache = [];

    /**
     * @return array{created:int, skipped:int, total:int, errors:array<int,array{row:int,message:string}>}
     */
    public function import(string $path, string $ext, int $companyId): array
    {
        $rows = $this->readRows($path, $ext);
        if (count($rows) < 2) {
            return ['created' => 0, 'skipped' => 0, 'total' => 0,
                'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        $map = $this->mapHeader(array_shift($rows));
        foreach (['employee_no', 'first_name', 'last_name'] as $required) {
            if (! isset($map[$required])) {
                return ['created' => 0, 'skipped' => 0, 'total' => 0,
                    'errors' => [['row' => 1, 'message' => "Missing required column for: {$required} (check the header row)."]]];
            }
        }

        $created = 0;
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

            if (Employee::query()->where('company_id', $companyId)->where('employee_no', $employeeNo)->exists()) {
                $skipped++;

                continue;
            }

            try {
                Employee::create([
                    'company_id' => $companyId,
                    'employee_no' => $employeeNo,
                    'first_name' => $first,
                    'middle_name' => $get('middle_name') ?: null,
                    'last_name' => $last,
                    'gender' => $this->normGender($get('gender')),
                    'civil_status' => $this->normCivil($get('civil_status')),
                    'department_id' => ($d = $get('department')) !== '' ? $this->resolveDepartment($companyId, $d) : null,
                    'branch_id' => ($b = $get('location')) !== '' ? $this->resolveBranch($companyId, $b) : null,
                    'email_company' => $get('email') ?: null,
                    'is_active' => true,
                ]);
                $created++;
            } catch (\Throwable $e) {
                $errors[] = ['row' => $line, 'message' => $e->getMessage()];
            }
        }

        return ['created' => $created, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors];
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
