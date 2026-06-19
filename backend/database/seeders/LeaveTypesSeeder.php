<?php

namespace Database\Seeders;

use App\Domain\Identity\Models\Company;
use App\Domain\Leave\Models\LeaveType;
use Illuminate\Database\Seeder;

class LeaveTypesSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::where('code', 'MPP-MAIN')->firstOrFail();

        // Company policy: only these leave types are offered. HR adjusts credits as needed.
        $types = [
            ['code' => 'VL',   'name' => 'Vacation Leave',     'credits' => 0, 'paid' => true,  'attach' => false, 'accrual' => 'annual', 'lead' => 1],
            ['code' => 'SL',   'name' => 'Sick Leave',         'credits' => 0, 'paid' => true,  'attach' => false, 'accrual' => 'annual', 'lead' => 0],
            ['code' => 'BDL',  'name' => 'Birthday Leave',     'credits' => 0, 'paid' => true,  'attach' => false, 'accrual' => 'annual', 'lead' => 0, 'max' => 1],
            ['code' => 'LWOP', 'name' => 'Leave Without Pay',  'credits' => 0, 'paid' => false, 'attach' => false, 'accrual' => 'none',   'lead' => 0],
        ];

        foreach ($types as $t) {
            LeaveType::updateOrCreate(
                ['company_id' => $company->id, 'code' => $t['code']],
                [
                    'name' => $t['name'],
                    'default_credits_per_year' => $t['credits'],
                    'is_paid' => $t['paid'],
                    'requires_attachment' => $t['attach'],
                    'gender_restriction' => null,
                    'accrual_method' => $t['accrual'],
                    'min_days_filing_lead' => $t['lead'],
                    'max_consecutive_days' => $t['max'] ?? null,
                    'is_active' => true,
                ],
            );
        }

        // Anything not in the offered set is retired (kept for history, hidden from use).
        LeaveType::where('company_id', $company->id)
            ->whereNotIn('code', array_column($types, 'code'))
            ->update(['is_active' => false]);
    }
}
