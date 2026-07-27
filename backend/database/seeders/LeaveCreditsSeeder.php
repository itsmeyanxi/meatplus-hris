<?php

namespace Database\Seeders;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Company;
use App\Domain\Leave\Models\LeaveBalance;
use App\Domain\Leave\Models\LeaveType;
use Illuminate\Database\Seeder;

/**
 * Assigns annual leave credits so the dashboard "Leave Credits" widget shows
 * real remaining balances instead of zeros. The leave types were imported from
 * Sprout with default_credits_per_year = 0 and no employee had a materialized
 * balance, so every balance read back as 0.
 *
 * This sets a standard credit per leave type (by code) and back-fills a
 * balance row for the given year for every active employee — respecting gender
 * restrictions (Maternity → female only, Paternity → male only). Existing
 * `used`/`granted_adhoc`/`accrued` are preserved; only `opening_balance` is set.
 *
 *     php artisan db:seed --class=LeaveCreditsSeeder            # current year, all active companies
 *
 * Amounts are policy — edit CREDITS below to match each company's handbook.
 * Idempotent: re-running updates opening_balance in place, never duplicates.
 */
class LeaveCreditsSeeder extends Seeder
{
    /** Standard annual credit per leave-type code (PH common practice). */
    private const CREDITS = [
        'VL' => 15,    // Vacation Leave
        'SL' => 15,    // Sick Leave
        'BDL' => 1,    // Birthday Leave
        'EL' => 5,     // Emergency Leave
        'BL' => 5,     // Bereavement Leave
        'BRL' => 5,    // Bereavement Leave (alt code)
        'PL' => 7,     // Paternity Leave (RA 8187)
        'ML' => 105,   // Maternity Leave (RA 11210)
        'SPL' => 7,    // Solo Parent Leave (RA 8972)
        'SIL' => 5,    // Service Incentive Leave
        // Uncapped / unpaid / catch-all stay at 0:
        'LWOP' => 0,   // Leave Without Pay
        'OL' => 0,     // Other Leave
        'NLT' => 0,    // New Leave Type (placeholder)
    ];

    /** Gender-restricted leaves, so they only credit (and only file for) the right gender. */
    private const GENDER = [
        'ML' => 'female',  // Maternity
        'PL' => 'male',    // Paternity
    ];

    public function run(): void
    {
        $year = (int) now()->year;
        $companies = Company::where('is_active', true)->get();
        $totalTypes = 0;
        $totalBalances = 0;

        foreach ($companies as $company) {
            $types = LeaveType::withoutGlobalScopes()->where('company_id', $company->id)->get();
            if ($types->isEmpty()) {
                continue;
            }

            // 1) Set the type's default credit (drives auto-init for future filers)
            //    and its gender restriction where applicable.
            foreach ($types as $type) {
                if (array_key_exists($type->code, self::CREDITS)) {
                    $update = ['default_credits_per_year' => self::CREDITS[$type->code]];
                    if (array_key_exists($type->code, self::GENDER)) {
                        $update['gender_restriction'] = self::GENDER[$type->code];
                    }
                    $type->update($update);
                    $totalTypes++;
                }
            }

            // 2) Back-fill this year's balance for every active employee.
            $employees = Employee::withoutGlobalScopes()
                ->where('company_id', $company->id)
                ->where('is_active', true)
                ->whereNull('deleted_at')
                ->get(['id', 'gender']);

            foreach ($employees as $emp) {
                foreach ($types as $type) {
                    if (! array_key_exists($type->code, self::CREDITS)) {
                        continue;
                    }
                    $credit = self::CREDITS[$type->code];

                    // Gender-restricted leaves only apply to the matching gender.
                    if ($type->gender_restriction && $type->gender_restriction !== $emp->gender) {
                        $credit = 0;
                    }

                    $balance = LeaveBalance::firstOrCreate(
                        ['employee_id' => $emp->id, 'leave_type_id' => $type->id, 'year' => $year],
                        ['opening_balance' => 0, 'used' => 0],
                    );
                    // Only (re)set the opening grant; keep any used/accrued/adhoc.
                    if ((float) $balance->opening_balance !== (float) $credit) {
                        $balance->update(['opening_balance' => $credit]);
                    }
                    $totalBalances++;
                }
            }

            $this->command?->info("  {$company->code}: credits set on {$types->count()} types, {$employees->count()} employees.");
        }

        $this->command?->info("Leave credits done — {$totalTypes} type-grants, {$totalBalances} employee balances for {$year}.");
    }
}
