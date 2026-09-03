<?php

namespace App\Console\Commands;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Company;
use App\Domain\Payroll\Models\PayrollRun;
use App\Domain\Payroll\Models\Payslip;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Imports a Sprout "Payroll Summary" export (the Payroll Register sheet) as a
 * HISTORICAL ARCHIVE — the figures Sprout actually paid, preserved verbatim.
 *
 * The run is created with status 'posted' on purpose. PayrollRunController::compute
 * only accepts draft|computed, so a posted run can never be recomputed by our engine;
 * that is what stops imported history from drifting. The post ACTION is skipped too,
 * so loan balances are not drawn down — Sprout already collected those instalments.
 *
 * Dry-run by default; pass --apply to write.
 *
 *   php artisan payroll:import-sprout "C:/.../MEATPLUSTR_PayrollSummary.xlsx" --company=NBC
 *   php artisan payroll:import-sprout "C:/.../file.xlsx" --company=NBC --apply
 *
 * Columns are matched by HEADER NAME, not position — Sprout varies the column set
 * per company (the loan types especially), so a fixed layout would silently misalign.
 */
class ImportSproutPayroll extends Command
{
    /** Marks runs this importer created. Only runs carrying it may be re-imported over. */
    private const MARKER = '[sprout-archive-import]';

    protected $signature = 'payroll:import-sprout
        {path : Path to the Sprout PayrollSummary .xlsx}
        {--company= : Company code (e.g. NBC) or id that the payroll belongs to}
        {--pay-date= : Pay date (YYYY-MM-DD); defaults to the period end date}
        {--name= : Run name; defaults to "Sprout Archive: <period>"}
        {--pay-group= : Optional pay group label}
        {--apply : Write changes (otherwise dry-run)}';

    protected $description = 'Import a Sprout payroll register as a read-only archived payroll run';

    /** Sprout header => payslip column. Anything unmapped lands in breakdown. */
    private const MAP = [
        'basic salary (semi-monthly)' => 'basic_pay',
        'de minimis benefits (semi-monthly)' => 'de_minimis',
        'communication allowance' => 'communication_allowance',
        'ord-nd' => 'night_diff_pay',
        'ord-ot' => 'overtime_pay',
        'rd' => 'rest_day_pay',
        'total salary' => 'gross_pay',
        'days absent' => 'days_absent',
        'total absent deduction' => 'absences_deduction',
        'minutes late' => 'late_minutes',
        'total late deduction' => 'tardiness_deduction',
        'withholding tax' => 'withholding_tax',
        'philhealth' => 'philhealth',
        'hdmf' => 'pagibig',
        'deductions total' => 'total_deductions',
        'net pay' => 'net_pay',
    ];

    /** Earnings with no dedicated column — summed into other_earnings. */
    private const OTHER_EARNINGS = ['basic adjustment', 'overtime adjustment', 'representation'];

    /** Deductions with no dedicated column — summed into other_deductions. */
    private const OTHER_DEDUCTIONS = ['deminimis deduction', 'allowance absent deduction', 'discretionary deduction'];

    public function handle(): int
    {
        $path = $this->argument('path');
        $apply = (bool) $this->option('apply');

        if (! is_file($path)) {
            $this->error("File not found: {$path}");

            return self::FAILURE;
        }

        $company = $this->resolveCompany();
        if (! $company) {
            return self::FAILURE;
        }

        [$rows, $retroRows] = $this->read($path);
        if (! $rows) {
            $this->error('The Payroll Register sheet is empty.');

            return self::FAILURE;
        }

        $period = $this->parsePeriod($rows);
        if (! $period) {
            $this->error('Could not find the "Payroll Period:" line — is this a Sprout Payroll Summary export?');

            return self::FAILURE;
        }
        [$periodStart, $periodEnd] = $period;

        $headerAt = $this->findHeaderRow($rows);
        if ($headerAt === null) {
            $this->error('Could not find the "Employee ID" header row.');

            return self::FAILURE;
        }
        $cols = $this->headerIndex($rows[$headerAt]);

        $sourceCompany = $this->s($rows[0][0] ?? '');
        $payDate = $this->option('pay-date') ? Carbon::parse($this->option('pay-date')) : $periodEnd->copy();
        $runName = $this->option('name') ?: 'Sprout Archive: '.$periodStart->format('M j').' - '.$periodEnd->format('M j, Y');

        $this->line('');
        $this->line('  source file   : '.basename($path));
        $this->line('  source company: '.$sourceCompany);
        $this->line('  importing into: '.$company->code.' (id '.$company->id.')'.($company->is_demo ? '   << DEMO/SANDBOX COMPANY' : ''));
        $this->line('  period        : '.$periodStart->toDateString().' -> '.$periodEnd->toDateString().'   pay date '.$payDate->toDateString());
        $this->line('  run name      : '.$runName);
        $this->line('');

        // A run this importer did not create is never overwritten. On --apply that is
        // fatal; on a dry run we still parse and report, so the mapping can be checked
        // before anyone decides what to do about the clash.
        $existing = $this->findExistingRun($company->id, $periodStart, $periodEnd);
        $blocked = $existing && ! str_contains((string) $existing->notes, self::MARKER);
        if ($blocked) {
            $this->error("Payroll run #{$existing->id} \"{$existing->name}\" ({$existing->status}) already covers this period for {$company->code}.");
            $this->error('It was not created by this importer, so it will not be overwritten. Delete it first, or import into a different company.');
            if ($apply) {
                return self::FAILURE;
            }
            $this->warn("Continuing as a dry run so you can review the mapping.\n");
            $existing = null;
        }

        $stat = ['rows' => 0, 'matched' => 0, 'noMatch' => 0, 'mismatch' => 0];
        $problems = [];
        $slips = [];
        $totals = ['gross' => 0.0, 'ded' => 0.0, 'net' => 0.0];

        foreach (array_slice($rows, $headerAt + 1) as $i => $r) {
            $first = $this->s($r[0] ?? '');
            if ($first === '' || ! preg_match('/^\d{3,6}$/', $first)) {
                continue; // blank line, a "Department: X" group header, or a totals row
            }
            $stat['rows']++;
            $lineNo = $headerAt + $i + 2;

            $emp = $this->findEmployee($company->id, $first);
            if (! $emp) {
                $stat['noMatch']++;
                $problems[] = "Row {$lineNo}: no employee \"{$first}\" (".$this->val($r, $cols, 'fullname').") in {$company->code}";

                continue;
            }
            $stat['matched']++;

            $slip = $this->buildSlip($r, $cols, $company->id, $emp->id);

            // Sprout's own arithmetic has to reconcile; if it does not, we are reading
            // the wrong columns and the import must not be trusted.
            $expected = round($slip['gross_pay'] - $slip['total_deductions'], 2);
            if (abs($expected - $slip['net_pay']) > 0.01) {
                $stat['mismatch']++;
                $problems[] = "Row {$lineNo} ({$first}): gross {$slip['gross_pay']} - deductions {$slip['total_deductions']} = {$expected}, but Sprout says net {$slip['net_pay']}";
            }

            $totals['gross'] += $slip['gross_pay'];
            $totals['ded'] += $slip['total_deductions'];
            $totals['net'] += $slip['net_pay'];
            $slips[] = $slip;
        }

        if (! $slips) {
            $this->error('No importable employee rows found.');

            return self::FAILURE;
        }

        $runId = null;
        DB::beginTransaction();
        try {
            $run = $existing;
            if ($run) {
                Payslip::withoutGlobalScopes()->where('payroll_run_id', $run->id)->delete();
                $run->forceFill([
                    'name' => $runName,
                    'pay_date' => $payDate,
                    'notes' => $this->notes($path, $sourceCompany),
                    'status' => 'posted',
                    'posted_at' => now(),
                ])->save();
            } else {
                $run = PayrollRun::create([
                    'company_id' => $company->id,
                    'name' => $runName,
                    'pay_group' => $this->option('pay-group'),
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'pay_date' => $payDate,
                    'status' => 'posted',
                    'notes' => $this->notes($path, $sourceCompany),
                ]);
                $run->forceFill(['computed_at' => now(), 'approved_at' => now(), 'posted_at' => now()])->save();
            }
            $runId = $run->id;

            foreach ($slips as $s) {
                Payslip::create(['payroll_run_id' => $run->id] + $s);
            }

            $apply ? DB::commit() : DB::rollBack();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('ERROR: '.$e->getMessage().' @ '.basename($e->getFile()).':'.$e->getLine());

            return self::FAILURE;
        }

        $this->info(($apply ? 'APPLIED' : 'DRY RUN').' — '.basename($path));
        $this->line("  employee rows read : {$stat['rows']}");
        $this->line("  matched employees  : {$stat['matched']}   (no match: {$stat['noMatch']})");
        $this->line('  payslips '.($apply ? 'written    ' : 'to write   ').': '.count($slips).($existing ? '   (replacing run #'.$existing->id.')' : ''));
        $this->line('  totals             : gross '.number_format($totals['gross'], 2).'   deductions '.number_format($totals['ded'], 2).'   net '.number_format($totals['net'], 2));
        if ($stat['mismatch']) {
            $this->warn("  reconciliation     : {$stat['mismatch']} row(s) do not add up — check the column mapping before applying");
        } else {
            $this->line('  reconciliation     : all rows reconcile (gross - deductions = net)');
        }
        if ($retroRows > 0) {
            $this->warn("  note: the \"Retro Adjs\" sheet holds {$retroRows} data row(s) — NOT imported; those hours are already priced into the register totals.");
        }
        foreach (array_slice($problems, 0, 25) as $p) {
            $this->warn('  '.$p);
        }
        if (count($problems) > 25) {
            $this->warn('  ... and '.(count($problems) - 25).' more');
        }
        if ($apply) {
            $this->info("\n  Archived as payroll run #{$runId} — status 'posted', so the payroll engine cannot recompute it.");
        } elseif ($blocked) {
            $this->error("\n  NOT importable as-is: the existing run above has to be resolved first.");
        } else {
            $this->line("\n  Re-run with --apply to write this.");
        }

        return self::SUCCESS;
    }

    private function notes(string $path, string $sourceCompany): string
    {
        return self::MARKER
            ."\nHistorical payroll imported from Sprout. Figures are as-paid and are never recomputed by this system."
            ."\nSource file: ".basename($path)
            ."\n".$sourceCompany
            ."\nImported: ".now()->toDateTimeString();
    }

    /**
     * @return array{0:array<int,array<int,mixed>>,1:int} register rows, retro-sheet data row count
     */
    private function read(string $path): array
    {
        $reader = new XlsxReader;
        $reader->open($path);
        $register = [];
        $retro = 0;
        foreach ($reader->getSheetIterator() as $sheet) {
            if ($sheet->getIndex() === 0) {
                foreach ($sheet->getRowIterator() as $row) {
                    $register[] = $row->toArray();
                }
            } elseif (stripos($sheet->getName(), 'retro') !== false) {
                foreach ($sheet->getRowIterator() as $row) {
                    if (trim(implode('', array_map(fn ($c) => $this->s($c), $row->toArray()))) !== '') {
                        $retro++;
                    }
                }
                $retro = max(0, $retro - 1); // drop the header row
            }
        }
        $reader->close();

        return [$register, $retro];
    }

    /**
     * @return array{0:Carbon,1:Carbon}|null
     */
    private function parsePeriod(array $rows): ?array
    {
        foreach (array_slice($rows, 0, 6) as $r) {
            $text = implode(' ', array_map(fn ($c) => $this->s($c), $r));
            if (preg_match('#(\d{1,2}/\d{1,2}/\d{4})\s*-\s*(\d{1,2}/\d{1,2}/\d{4})#', $text, $m)) {
                return [
                    Carbon::createFromFormat('n/j/Y', $m[1])->startOfDay(),
                    Carbon::createFromFormat('n/j/Y', $m[2])->startOfDay(),
                ];
            }
        }

        return null;
    }

    private function findHeaderRow(array $rows): ?int
    {
        foreach ($rows as $i => $r) {
            if (preg_match('/^employee\s*id/i', $this->s($r[0] ?? ''))) {
                return $i;
            }
        }

        return null;
    }

    /**
     * @return array<string,int> normalised header name => column index
     */
    private function headerIndex(array $header): array
    {
        $out = [];
        foreach ($header as $i => $h) {
            $k = strtolower(trim(str_replace('*', '', $this->s($h))));
            if ($k !== '' && ! isset($out[$k])) {
                $out[$k] = $i;
            }
        }

        return $out;
    }

    private function findEmployee(int $companyId, string $empNo): ?Employee
    {
        $candidates = array_unique([
            $empNo,
            ltrim($empNo, '0'),
            str_pad(ltrim($empNo, '0'), 5, '0', STR_PAD_LEFT),
        ]);

        return Employee::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->whereIn('employee_no', $candidates)
            ->first();
    }

    /**
     * @return array<string,mixed>
     */
    private function buildSlip(array $r, array $cols, int $companyId, int $employeeId): array
    {
        $slip = ['company_id' => $companyId, 'employee_id' => $employeeId];
        foreach (self::MAP as $header => $col) {
            $slip[$col] = $this->num($this->val($r, $cols, $header));
        }

        // Sprout splits SSS into the regular share and the MPF/WISP share. Our `sss`
        // column holds the combined employee contribution, with the split kept on the
        // breakdown so Payslip::sssParts() reports it exactly instead of re-deriving it.
        $sssRegular = $this->num($this->val($r, $cols, 'sss'));
        $sssMpf = $this->num($this->val($r, $cols, 'sss mpf'));
        $slip['sss'] = round($sssRegular + $sssMpf, 2);

        $slip['days_absent'] = (int) round($slip['days_absent']);
        $slip['late_minutes'] = (int) round($slip['late_minutes']);
        $slip['overtime_minutes'] = $this->minutes($this->val($r, $cols, 'ord-ot(hh:mm)'))
            + $this->minutes($this->val($r, $cols, 'rd(hh:mm)'));
        $slip['night_diff_minutes'] = $this->minutes($this->val($r, $cols, 'ord-nd(hh:mm)'));

        $slip['other_earnings'] = round(array_sum(array_map(
            fn ($h) => $this->num($this->val($r, $cols, $h)), self::OTHER_EARNINGS
        )), 2);
        $slip['other_deductions'] = round(array_sum(array_map(
            fn ($h) => $this->num($this->val($r, $cols, $h)), self::OTHER_DEDUCTIONS
        )), 2);

        // Every "(LESS)" column is a loan or advance recovery. The set differs per
        // company, so they are discovered from the header instead of being listed.
        $loans = [];
        foreach ($cols as $header => $idx) {
            if (str_contains($header, '(less)')) {
                $amt = $this->num($r[$idx] ?? null);
                if ($amt != 0.0) {
                    $loans[trim(str_ireplace('(less)', '', $header))] = $amt;
                }
            }
        }
        $slip['loans_deduction'] = round(array_sum($loans), 2);

        // Employer shares, YTD figures and taxable gross have no columns of their own
        // but are needed for remittance and BIR reporting, so none of them are dropped.
        $extra = [];
        foreach (['tax ytd', 'net ytd', 'taxable gross', 'ssser', 'sss mpfer', 'sssec', 'pher', 'hdmfer', 'hdmf additional', 'ot total'] as $h) {
            if (isset($cols[$h])) {
                $extra[str_replace([' ', '-'], '_', $h)] = $this->num($r[$cols[$h]] ?? null);
            }
        }
        $slip['breakdown'] = array_filter([
            'source' => 'sprout_payroll_register',
            'sss_regular' => $sssRegular,
            'sss_mpf' => $sssMpf,
            'loans' => $loans ?: null,
            'employer_share' => array_intersect_key($extra, array_flip(['ssser', 'sss_mpfer', 'sssec', 'pher', 'hdmfer', 'hdmf_additional'])),
            'ytd' => array_intersect_key($extra, array_flip(['tax_ytd', 'net_ytd'])),
            'taxable_gross' => $extra['taxable_gross'] ?? null,
            'sprout_ot_total' => $extra['ot_total'] ?? null,
            'sprout_employee_id' => $this->s($r[0] ?? ''),
            'sprout_cost_center' => $this->val($r, $cols, 'cost center'),
        ], fn ($v) => $v !== null && $v !== '' && $v !== []);

        return $slip;
    }

    private function val(array $row, array $cols, string $header): string
    {
        return isset($cols[$header]) ? $this->s($row[$cols[$header]] ?? '') : '';
    }

    /** "18:01" => 1081 minutes. */
    private function minutes(string $v): int
    {
        if (! preg_match('/^(\d+):(\d{2})$/', trim($v), $m)) {
            return 0;
        }

        return ((int) $m[1] * 60) + (int) $m[2];
    }

    private function resolveCompany(): ?Company
    {
        $key = trim((string) $this->option('company'));
        if ($key === '') {
            $this->error('--company is required. Available: '.Company::query()->pluck('code')->implode(', '));

            return null;
        }
        $company = Company::query()
            ->when(
                ctype_digit($key),
                fn ($q) => $q->where('id', (int) $key),
                fn ($q) => $q->whereRaw('lower(code) = ?', [strtolower($key)])
            )
            ->first();
        if (! $company) {
            $this->error("No company \"{$key}\". Available: ".Company::query()->pluck('code')->implode(', '));
        }

        return $company;
    }

    private function findExistingRun(int $companyId, Carbon $start, Carbon $end): ?PayrollRun
    {
        return PayrollRun::withoutGlobalScopes()
            ->where('company_id', $companyId)
            ->whereDate('period_start', $start)
            ->whereDate('period_end', $end)
            ->first();
    }

    private function s($v): string
    {
        if ($v instanceof \DateTimeInterface) {
            return $v->format('Y-m-d');
        }

        return trim((string) $v);
    }

    private function num($v): float
    {
        $v = preg_replace('/[^0-9.\-]/', '', (string) $v);

        return $v === '' || $v === '-' ? 0.0 : (float) $v;
    }
}
