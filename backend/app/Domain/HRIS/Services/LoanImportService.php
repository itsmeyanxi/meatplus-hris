<?php

namespace App\Domain\HRIS\Services;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Payroll\Models\EmployeeLoan;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\CSV\Reader as CsvReader;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Bulk-imports employee loans / amortized deductions from a CSV/XLSX — built for
 * SSS and Pag-IBIG loan schedules, but any loan type works. Employees match by
 * Employee ID (or biometric ID). A row matching an existing loan (same employee,
 * type and reference no.) UPDATES its amortization + outstanding balance, so a
 * fresh monthly billing file can be re-imported to refresh balances.
 */
class LoanImportService
{
    private const ALIASES = [
        'employee_no' => ['employeeid', 'employee id', 'employee no', 'employee number', 'emp id', 'id', 'empidno'],
        'type' => ['loantype', 'loan type', 'type', 'deduction type', 'loan'],
        'reference_no' => ['referenceno', 'reference no', 'reference', 'ref no', 'refno', 'loan ref', 'pn no', 'control no', 'account no'],
        'principal' => ['principal', 'loan amount', 'loanamount', 'total', 'amount', 'original amount'],
        'amortization' => ['amortization', 'amort', 'monthly amortization', 'per cutoff', 'installment', 'deduction', 'semi-monthly', 'semi monthly', 'monthly'],
        'outstanding_balance' => ['outstandingbalance', 'outstanding balance', 'outstanding', 'balance', 'ending balance', 'endingbalance', 'remaining balance', 'current balance', 'remaining'],
        'start_date' => ['startdate', 'start date', 'date granted', 'granted date', 'grant date'],
    ];

    /** Map a free-text loan-type label to one of the system's loan type codes. */
    private const TYPE_MAP = [
        'sss_salary' => ['sss salary', 'sss salary loan', 'sss loan', 'sss sl', 'salary loan sss'],
        'sss_calamity' => ['sss calamity', 'sss calamity loan', 'sss cl'],
        'pagibig_mpl' => ['pagibig', 'pag-ibig', 'pag ibig', 'pagibig mpl', 'pag-ibig mpl', 'hdmf', 'hdmf mpl', 'mpl', 'multi-purpose loan', 'multi purpose loan'],
        'pagibig_calamity' => ['pagibig calamity', 'pag-ibig calamity', 'hdmf calamity'],
        'company' => ['company', 'company loan', 'coop', 'cooperative'],
        'cash_advance' => ['cash advance', 'cashadvance', 'ca', 'advance', 'vale'],
    ];

    /**
     * @return array{created:int, updated:int, skipped:int, total:int, errors:array<int,array{row:int,message:string}>}
     */
    public function import(string $path, string $ext, int $companyId): array
    {
        $rows = $this->readRows($path, $ext);
        if (count($rows) < 2) {
            return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 0, 'message' => 'The file has no data rows.']]];
        }

        $map = $this->mapHeader(array_shift($rows));
        foreach (['employee_no', 'type', 'amortization'] as $req) {
            if (! isset($map[$req])) {
                return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'total' => 0, 'errors' => [['row' => 1, 'message' => "Missing required column for: {$req}."]]];
            }
        }

        // Employees for this company (by employee_no + biometric id).
        $emp = [];
        foreach (Employee::query()->where('company_id', $companyId)->get(['id', 'employee_no', 'biometric_user_id']) as $e) {
            if ($e->employee_no) $emp[strtolower(trim($e->employee_no))] = $e->id;
            if ($e->biometric_user_id) $emp[strtolower(trim($e->biometric_user_id))] = $e->id;
        }

        $created = 0; $updated = 0; $skipped = 0; $errors = []; $line = 1;
        foreach ($rows as $cells) {
            $line++;
            if (! array_filter(array_map(fn ($c) => trim((string) $c), $cells))) continue;
            $get = fn (string $k) => isset($map[$k]) ? trim((string) ($cells[$map[$k]] ?? '')) : '';

            $empId = $emp[strtolower($get('employee_no'))] ?? null;
            if (! $empId) { $errors[] = ['row' => $line, 'message' => "No employee for ID \"{$get('employee_no')}\"."]; continue; }

            $type = $this->resolveType($get('type'));
            if (! $type) { $errors[] = ['row' => $line, 'message' => "Unknown loan type \"{$get('type')}\"."]; continue; }

            $amort = $this->num($get('amortization'));
            if ($amort <= 0) { $skipped++; continue; }

            $principal = $this->num($get('principal'));
            $balance = $get('outstanding_balance') !== '' ? $this->num($get('outstanding_balance')) : ($principal ?: $amort);
            $ref = $get('reference_no') ?: null;
            $start = null;
            if ($get('start_date') !== '') {
                try { $start = Carbon::parse($get('start_date'))->toDateString(); } catch (\Throwable) {}
            }

            // Match an existing loan by employee + type + reference to refresh it
            // (rather than create a duplicate on re-upload). Reference is matched
            // case/whitespace-insensitively so minor formatting differences between
            // uploads don't slip through as a new loan.
            $existing = EmployeeLoan::query()
                ->where('company_id', $companyId)
                ->where('employee_id', $empId)
                ->where('type', $type)
                ->when(
                    $ref !== null,
                    fn ($q) => $q->whereRaw('LOWER(TRIM(reference_no)) = ?', [mb_strtolower(trim($ref))]),
                    fn ($q) => $q->whereNull('reference_no'),
                )
                ->first();

            if ($existing) {
                $existing->update([
                    'amortization' => $amort,
                    'outstanding_balance' => $balance,
                    'principal' => $principal ?: $existing->principal,
                    'is_active' => $balance > 0,
                ]);
                $updated++;
            } else {
                EmployeeLoan::create([
                    'company_id' => $companyId,
                    'employee_id' => $empId,
                    'type' => $type,
                    'reference_no' => $ref,
                    'principal' => $principal,
                    'amortization' => $amort,
                    'outstanding_balance' => $balance,
                    'start_date' => $start,
                    'is_active' => $balance > 0,
                ]);
                $created++;
            }
        }

        return ['created' => $created, 'updated' => $updated, 'skipped' => $skipped, 'total' => count($rows), 'errors' => $errors];
    }

    private function resolveType(string $label): ?string
    {
        $n = strtolower(trim($label));
        if ($n === '') return null;
        // "Calamity" must win over the broader salary/MPL aliases (e.g. "Pag-IBIG
        // Calamity" contains "pag-ibig", which would otherwise match pagibig_mpl).
        if (str_contains($n, 'calamity')) {
            if (str_contains($n, 'sss')) return 'sss_calamity';
            if (str_contains($n, 'pag') || str_contains($n, 'hdmf')) return 'pagibig_calamity';
        }
        foreach (self::TYPE_MAP as $code => $aliases) {
            foreach ($aliases as $a) {
                if ($n === $a || str_contains($n, $a)) return $code;
            }
        }
        // Anything mentioning sss/pagibig but not matched above → best-effort bucket.
        if (str_contains($n, 'sss')) return 'sss_salary';
        if (str_contains($n, 'pag') || str_contains($n, 'hdmf')) return 'pagibig_mpl';

        return 'other';
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

    private function mapHeader(array $header): array
    {
        $map = [];
        foreach ($header as $idx => $label) {
            $norm = strtolower(trim(preg_replace('/\s+/', ' ', (string) $label)));
            foreach (self::ALIASES as $canon => $list) {
                if (in_array($norm, $list, true)) { $map[$canon] = $idx; break; }
            }
        }
        return $map;
    }
}
