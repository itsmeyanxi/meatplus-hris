<?php

namespace App\Domain\Payroll\Services;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Payroll\Models\EmployeeCompensation;
use App\Domain\Payroll\Models\EmployeePayrollProfile;
use Carbon\Carbon;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk-imports employee compensation from a CSV/XLSX: pay type + rate and the
 * allowances (Non-Taxable, De Minimis, Communication, Transportation, Meal,
 * Fleet Card) and an effective date. Employees match by Employee ID / biometric
 * ID within the active company. Updates each employee's ACTIVE compensation in
 * place (creates one if none) and upserts the profile allowances — so it's
 * re-runnable. Only columns PRESENT in the file are touched; missing columns are
 * left as-is, so a partial file (e.g. just Meal Allowance) won't wipe the rest.
 */
class CompensationImportService
{
    private const ALIASES = [
        'employee_no' => ['employeeid', 'employee id', 'employee no', 'employee number', 'emp id', 'id', 'empidno', 'biometric id'],
        'pay_type' => ['pay type', 'paytype', 'type'],
        'rate' => ['rate', 'basic', 'basic salary', 'basic monthly', 'monthly rate', 'salary', 'daily rate', 'base salary', 'basic_monthly', 'daily_rate'],
        'allowance_monthly' => ['non-taxable allowance', 'non taxable allowance', 'nontaxable allowance', 'allowance', 'allowance monthly', 'allowance_monthly'],
        'de_minimis' => ['de minimis', 'de-minimis', 'deminimis'],
        'communication_allowance' => ['communication', 'communication allowance', 'comm allowance', 'comm'],
        'transportation_allowance' => ['transportation', 'transportation allowance', 'transpo', 'transpo allowance'],
        'daily_allowance' => ['meal allowance', 'meal', 'meal allowance / day', 'meal allowance /day', 'daily allowance', 'daily_allowance'],
        'fleet_card' => ['fleet card', 'fleet', 'fleet_card'],
        'effective_from' => ['effective date', 'effective from', 'effective', 'effectivity', 'effective_from', 'date effective'],
    ];

    private const PROFILE_FIELDS = ['de_minimis', 'communication_allowance', 'transportation_allowance', 'daily_allowance', 'fleet_card'];

    /**
     * @return array{created:int, updated:int, skipped:int, total:int, errors:array<int,array{row:int,message:string}>}
     */
    public function import(string $path, string $ext, int $companyId, bool $canConfidential): array
    {
        $rows = $this->readRows($path, $ext);
        if (count($rows) < 2) {
            return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        // Find the header row (skips any leading banner/instruction rows): the first
        // row that maps an Employee ID column.
        $map = [];
        $headerAt = -1;
        foreach ($rows as $i => $row) {
            $candidate = $this->mapHeader($row);
            if (isset($candidate['employee_no'])) {
                $map = $candidate;
                $headerAt = $i;
                break;
            }
        }
        if ($headerAt === -1) {
            return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 1, 'message' => 'Missing required column: Employee ID.']]];
        }
        $rows = array_slice($rows, $headerAt + 1);

        // Employees for this company (by employee_no + biometric id).
        $byKey = [];
        foreach (Employee::query()->where('company_id', $companyId)->get(['id', 'employee_no', 'biometric_user_id', 'is_confidential']) as $e) {
            if ($e->employee_no) {
                $byKey[strtolower(trim($e->employee_no))] = $e;
            }
            if ($e->biometric_user_id) {
                $byKey[strtolower(trim($e->biometric_user_id))] = $e;
            }
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];
        $line = $headerAt + 1; // 1-based header line, so data-row errors point at the file
        foreach ($rows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) {
                continue;
            }
            $get = fn (string $k) => isset($map[$k]) ? trim((string) ($cells[$map[$k]] ?? '')) : '';
            $has = fn (string $k) => isset($map[$k]) && $get($k) !== '';

            $idRaw = $get('employee_no');
            $emp = $byKey[strtolower($idRaw)] ?? null;
            if (! $emp) {
                $errors[] = ['row' => $line, 'message' => "No employee for ID \"{$idRaw}\" in this company."];

                continue;
            }
            if ($emp->is_confidential && ! $canConfidential) {
                $skipped++;
                $errors[] = ['row' => $line, 'message' => "Skipped confidential employee \"{$idRaw}\" (needs HR Confi / admin)."];

                continue;
            }

            $comp = EmployeeCompensation::query()->where('employee_id', $emp->id)->where('is_active', true)->first();

            // Build compensation changes from the columns present.
            $compUpdates = [];
            $payType = $has('pay_type') ? $this->resolvePayType($get('pay_type')) : ($comp?->pay_type ?? 'monthly');
            if ($has('pay_type')) {
                $compUpdates['pay_type'] = $payType;
            }
            if ($has('rate')) {
                $rate = $this->num($get('rate'));
                if ($payType === 'daily') {
                    $compUpdates['pay_type'] = 'daily';
                    $compUpdates['daily_rate'] = $rate;
                    $compUpdates['basic_monthly'] = round($rate * 22, 2);
                } else {
                    $compUpdates['pay_type'] = 'monthly';
                    $compUpdates['daily_rate'] = null;
                    $compUpdates['basic_monthly'] = $rate;
                }
            }
            if ($has('allowance_monthly')) {
                $compUpdates['allowance_monthly'] = $this->num($get('allowance_monthly'));
            }
            if ($has('effective_from')) {
                try {
                    $compUpdates['effective_from'] = Carbon::parse($get('effective_from'))->toDateString();
                } catch (\Throwable) {
                }
            }

            if ($comp) {
                if ($compUpdates) {
                    $comp->update($compUpdates);
                }
                $updated++;
            } elseif (isset($compUpdates['basic_monthly']) || isset($compUpdates['daily_rate'])) {
                EmployeeCompensation::create(array_merge([
                    'employee_id' => $emp->id,
                    'company_id' => $companyId,
                    'pay_type' => $payType,
                    'is_active' => true,
                ], $compUpdates));
                $created++;
            } else {
                // No existing rate and none given — can't create a payable record; still
                // allow profile allowances to be set below, but flag it.
                $errors[] = ['row' => $line, 'message' => "No rate for new employee \"{$idRaw}\" — set a Rate to create compensation."];
            }

            // Profile allowances — only the columns present in the file.
            $profileUpdates = [];
            foreach (self::PROFILE_FIELDS as $pf) {
                if ($has($pf)) {
                    $profileUpdates[$pf] = $this->num($get($pf));
                }
            }
            if ($profileUpdates) {
                EmployeePayrollProfile::updateOrCreate(['employee_id' => $emp->id], $profileUpdates);
            }
        }

        return ['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors];
    }

    private function resolvePayType(string $v): string
    {
        return str_contains(strtolower($v), 'da') ? 'daily' : 'monthly'; // "daily"/"day" → daily, else monthly
    }

    private function num(string $v): float
    {
        return (float) preg_replace('/[^0-9.\-]/', '', $v);
    }

    /** @return array<int,array<int,string>> */
    private function readRows(string $path, string $ext): array
    {
        $reader = $ext === 'xlsx' ? new XlsxReader() : new CsvReader();
        $reader->open($path);
        $rows = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $rows[] = array_map(fn ($c) => $c instanceof \DateTimeInterface ? $c->format('Y-m-d') : (is_scalar($c) ? (string) $c : ''), $row->toArray());
            }
            break;
        }
        $reader->close();

        return $rows;
    }

    /** @return array<string,int> canonical => column index */
    private function mapHeader(array $header): array
    {
        $map = [];
        foreach ($header as $idx => $label) {
            $norm = strtolower(trim(preg_replace('/\s+/', ' ', (string) $label)));
            if ($norm === '') {
                continue;
            }
            foreach (self::ALIASES as $canon => $list) {
                if (! isset($map[$canon]) && in_array($norm, $list, true)) {
                    $map[$canon] = $idx;
                    break;
                }
            }
        }

        return $map;
    }
}
