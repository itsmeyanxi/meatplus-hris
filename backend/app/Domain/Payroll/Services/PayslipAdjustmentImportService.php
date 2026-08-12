<?php

namespace App\Domain\Payroll\Services;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Models\PayslipAdjustment;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk-imports one-off payslip adjustments (earnings/deductions) onto a single
 * payroll run from a CSV/XLSX. Built to read the Payrollpie "One time adjustment
 * worksheet" directly — columns: STATUS, Employee ID, Employee Name, Adjustment
 * Type, Adjustment Name, Adjustment Code, Adjustment Amount, Remarks — but any
 * sheet with Employee ID + Amount (+ optional Type/Name) works.
 *
 * A leading banner/instruction row is skipped automatically (the header row is
 * detected), and example rows flagged STATUS = "SAMPLE DATA" are ignored.
 * Earning vs deduction is taken from the Adjustment Type (Allowance/Bonus/OT →
 * earning; Deduction/Loan/Tardiness → deduction; a negative amount forces
 * deduction). Employees match by Employee ID or biometric ID within the run's
 * company. Each valid row is ADDED (adjustments are one-offs) — clear the run's
 * adjustments first if you need to replace them.
 */
class PayslipAdjustmentImportService
{
    private const ALIASES = [
        'status' => ['status'],
        'employee_no' => ['employeeid', 'employee id', 'employee no', 'employee number', 'emp id', 'id', 'empidno', 'biometric id'],
        'label' => ['adjustment name', 'label', 'description', 'particulars', 'reason', 'title', 'adjustment'],
        'adj_type' => ['adjustment type', 'type', 'category', 'kind', 'adjustment category', 'earning or deduction', 'earning/deduction'],
        'code' => ['adjustment code', 'code'],
        'amount' => ['adjustment amount', 'amount', 'value', 'peso', 'php', 'amount (php)'],
        'notes' => ['remarks', 'notes', 'note', 'remark'],
    ];

    /** Adjustment-type keywords that mean a DEDUCTION (everything else is an earning). */
    private const DEDUCTION_HINTS = ['deduc', 'less', 'minus', 'withhold', 'charge', 'loan', 'advance', 'vale', 'penalt', 'tardin', 'late', 'absen', 'uniform', 'damage', 'shortage', 'contribution', 'sss', 'philhealth', 'pag-ibig', 'pagibig', 'hdmf', 'tax'];

    /**
     * @return array{created:int, skipped:int, total:int, errors:array<int,array{row:int,message:string}>}
     */
    public function import(string $path, string $ext, PayrollRun $run, int $companyId): array
    {
        $rows = $this->readRows($path, $ext);
        if (count($rows) < 2) {
            return ['created' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        // Find the header row (skips any leading banner/instruction rows): the first
        // row that maps both an Employee ID and an Amount column.
        $map = [];
        $headerAt = -1;
        foreach ($rows as $i => $row) {
            $candidate = $this->mapHeader($row);
            if (isset($candidate['employee_no'], $candidate['amount'])) {
                $map = $candidate;
                $headerAt = $i;
                break;
            }
        }
        if ($headerAt === -1) {
            return ['created' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 1, 'message' => 'Could not find the header row. Need at least Employee ID and (Adjustment) Amount columns.']]];
        }

        // Employees for this company (by employee_no + biometric id).
        $emp = [];
        foreach (Employee::query()->where('company_id', $companyId)->get(['id', 'employee_no', 'biometric_user_id']) as $e) {
            if ($e->employee_no) {
                $emp[strtolower(trim($e->employee_no))] = $e->id;
            }
            if ($e->biometric_user_id) {
                $emp[strtolower(trim($e->biometric_user_id))] = $e->id;
            }
        }

        $created = 0;
        $skipped = 0;
        $errors = [];
        $dataRows = array_slice($rows, $headerAt + 1);
        $line = $headerAt + 1; // 1-based header line number
        foreach ($dataRows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) {
                continue; // blank line
            }
            $get = fn (string $k) => isset($map[$k]) ? trim((string) ($cells[$map[$k]] ?? '')) : '';

            // Skip the template's example rows.
            if (stripos($get('status'), 'sample') !== false) {
                continue;
            }

            $idRaw = $get('employee_no');
            if ($idRaw === '') {
                continue; // no employee on this row — treat as filler, not an error
            }
            $empId = $emp[strtolower($idRaw)] ?? null;
            if (! $empId) {
                $errors[] = ['row' => $line, 'message' => "No employee for ID \"{$idRaw}\" in this company."];

                continue;
            }

            $label = $get('label') ?: ($get('adj_type') ?: $get('code'));
            if ($label === '') {
                $errors[] = ['row' => $line, 'message' => 'Missing Adjustment Name/Type (the label).'];

                continue;
            }

            $amount = round($this->num($get('amount')), 2);
            if ($amount === 0.0) {
                $skipped++; // nothing to add

                continue;
            }

            $kind = $this->resolveKind($get('adj_type'), $amount);
            $notes = $get('notes') ?: null;

            PayslipAdjustment::create([
                'company_id' => $companyId,
                'payroll_run_id' => $run->id,
                'employee_id' => $empId,
                'label' => mb_substr($label, 0, 120),
                'kind' => $kind,
                'amount' => abs($amount),
                'notes' => $notes,
            ]);
            $created++;
        }

        return ['created' => $created, 'skipped' => $skipped, 'total' => count($dataRows), 'errors' => $errors];
    }

    /** Earning unless the type clearly means a deduction, or the amount is negative. */
    private function resolveKind(string $type, float $amount): string
    {
        if ($amount < 0) {
            return 'deduction';
        }
        $n = strtolower(trim($type));
        foreach (self::DEDUCTION_HINTS as $hint) {
            if (str_contains($n, $hint)) {
                return 'deduction';
            }
        }

        return 'earning';
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
                if (isset($map[$canon])) {
                    continue;
                }
                if (in_array($norm, $list, true)) {
                    $map[$canon] = $idx;
                    break;
                }
            }
        }

        return $map;
    }
}
