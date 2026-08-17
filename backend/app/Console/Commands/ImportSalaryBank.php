<?php

namespace App\Console\Commands;

use App\Domain\HRIS\Models\Employee;
use App\Domain\HRIS\Models\EmployeeBankAccount;
use App\Domain\Payroll\Models\EmployeeCompensation;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use OpenSpout\Reader\XLSX\Reader as XlsxReader;

/**
 * Imports the "missing-salary-and-bank-to-fill.xlsx" worksheet after HR fills the
 * blank columns. Reads Pay Type / Basic Monthly / Daily Rate / Monthly Allowance
 * into employee_compensations, and Bank Name / Account Number into
 * employee_bank_accounts. Saves through the Eloquent models so the bank account
 * number is ENCRYPTED (raw inserts would store plaintext and break reads).
 *
 * Dry-run by default; pass --apply to write.
 *
 *   php artisan payroll:import-fill "C:/.../missing-salary-and-bank-to-fill.xlsx"
 *   php artisan payroll:import-fill "C:/.../file.xlsx" --apply
 *
 * Column layout (must match the export): 0 Company, 1 Employee No, 2 Biometric ID,
 * 3 Name, 4 Dept, 5 Position, 6 Needs Salary?, 7 Pay Type, 8 Basic Monthly,
 * 9 Daily Rate, 10 Monthly Allowance, 11 Needs Bank?, 12 Bank Name, 13 Account No.
 */
class ImportSalaryBank extends Command
{
    protected $signature = 'payroll:import-fill {path : Path to the filled .xlsx} {--apply : Write changes (otherwise dry-run)}';

    protected $description = 'Import salary + bank details from the filled-in worksheet';

    public function handle(): int
    {
        $path = $this->argument('path');
        $apply = (bool) $this->option('apply');
        if (! is_file($path)) {
            $this->error("File not found: {$path}");

            return self::FAILURE;
        }

        $rows = $this->read($path);
        if (count($rows) < 2) {
            $this->error('The file has no data rows.');

            return self::FAILURE;
        }
        array_shift($rows); // header

        $stat = ['rows' => 0, 'noMatch' => 0, 'salary' => 0, 'bank' => 0, 'salarySkip' => 0, 'bankSkip' => 0];
        $problems = [];

        DB::beginTransaction();
        try {
            foreach ($rows as $i => $c) {
                $empNo = $this->s($c[1] ?? '');
                $bio = $this->s($c[2] ?? '');
                if ($empNo === '' && $bio === '') {
                    continue;
                }
                $stat['rows']++;

                $emp = Employee::withoutGlobalScopes()
                    ->where(function ($q) use ($empNo, $bio) {
                        if ($empNo !== '') {
                            $q->orWhere('employee_no', $empNo);
                        }
                        if ($bio !== '') {
                            $q->orWhere('biometric_user_id', $bio);
                        }
                    })
                    ->first();
                if (! $emp) {
                    $stat['noMatch']++;
                    $problems[] = 'Row '.($i + 2).": no employee for ID \"{$empNo}\" / bio \"{$bio}\"";

                    continue;
                }

                // ---------- salary ----------
                $payType = strtolower($this->s($c[7] ?? ''));
                $basic = $this->num($c[8] ?? null);
                $daily = $this->num($c[9] ?? null);
                $allow = $this->num($c[10] ?? null) ?? 0;
                if ($payType !== '' && ($basic > 0 || $daily > 0)) {
                    $payType = in_array($payType, ['monthly', 'daily', 'hourly'], true) ? $payType : 'monthly';
                    if ($apply) {
                        EmployeeCompensation::where('employee_id', $emp->id)->where('is_active', true)->update(['is_active' => false]);
                        EmployeeCompensation::create([
                            'company_id' => $emp->company_id,
                            'employee_id' => $emp->id,
                            'pay_type' => $payType,
                            'basic_monthly' => $payType === 'monthly' ? $basic : ($daily ? round($daily * 22, 2) : $basic),
                            'daily_rate' => $payType === 'daily' ? $daily : null,
                            'allowance_monthly' => $allow,
                            'effective_from' => now()->toDateString(),
                            'is_active' => true,
                        ]);
                    }
                    $stat['salary']++;
                } elseif ($payType !== '' || $basic > 0 || $daily > 0) {
                    $stat['salarySkip']++; // partially filled — ignored
                    $problems[] = 'Row '.($i + 2).': salary partially filled (need Pay Type + a rate) — skipped';
                }

                // ---------- bank ----------
                $bankName = $this->s($c[12] ?? '');
                $acct = $this->s($c[13] ?? '');
                if ($bankName !== '' && $acct !== '') {
                    // dedup: compare against decrypted existing numbers
                    $dup = EmployeeBankAccount::where('employee_id', $emp->id)->get()
                        ->contains(fn ($b) => $b->account_number === $acct);
                    if ($dup) {
                        $stat['bankSkip']++;
                    } else {
                        if ($apply) {
                            EmployeeBankAccount::create([
                                'employee_id' => $emp->id,
                                'bank_name' => $bankName,
                                'account_number' => $acct, // encrypted by the model mutator
                                // Given-name-first: this is the name ON the bank
                                // account, not a roster label (see Employee::fullName).
                                'account_name' => $emp->full_name_first_last,
                                'is_primary' => ! EmployeeBankAccount::where('employee_id', $emp->id)->exists(),
                                'purpose' => 'payroll',
                            ]);
                        }
                        $stat['bank']++;
                    }
                } elseif ($bankName !== '' || $acct !== '') {
                    $stat['bankSkip']++;
                    $problems[] = 'Row '.($i + 2).': bank partially filled (need Bank Name + Account Number) — skipped';
                }
            }

            $apply ? DB::commit() : DB::rollBack();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('ERROR: '.$e->getMessage().' @ '.$e->getLine());

            return self::FAILURE;
        }

        $this->info(($apply ? 'APPLIED' : 'DRY RUN').' — '.basename($path));
        $this->line("  data rows read           : {$stat['rows']}  (no employee match: {$stat['noMatch']})");
        $this->line("  salaries ".($apply ? 'imported' : 'to import').' : '.$stat['salary']."  (partial/skipped: {$stat['salarySkip']})");
        $this->line("  bank accounts ".($apply ? 'imported' : 'to import').': '.$stat['bank']."  (duplicate/partial skipped: {$stat['bankSkip']})");
        foreach (array_slice($problems, 0, 20) as $p) {
            $this->warn('  '.$p);
        }
        if (! $apply && ($stat['salary'] + $stat['bank']) > 0) {
            $this->line("\n  Re-run with --apply to write these.");
        }

        return self::SUCCESS;
    }

    /** @return array<int,array<int,mixed>> */
    private function read(string $path): array
    {
        $reader = new XlsxReader;
        $reader->open($path);
        $out = [];
        foreach ($reader->getSheetIterator() as $sheet) {
            foreach ($sheet->getRowIterator() as $row) {
                $out[] = $row->toArray();
            }
            break;
        }
        $reader->close();

        return $out;
    }

    private function s($v): string
    {
        if ($v instanceof \DateTimeInterface) {
            return $v->format('Y-m-d');
        }

        return trim((string) $v);
    }

    private function num($v): ?float
    {
        $v = preg_replace('/[^0-9.\-]/', '', (string) $v);

        return $v === '' ? null : (float) $v;
    }
}
