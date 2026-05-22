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

        $types = [
            // PH-standard leave types with default policies. HR adjusts credits as needed.
            ['code' => 'VL',   'name' => 'Vacation Leave',                    'credits' => 5,   'paid' => true,  'attach' => false, 'gender' => null,     'accrual' => 'annual',  'lead' => 1],
            ['code' => 'SL',   'name' => 'Sick Leave',                        'credits' => 5,   'paid' => true,  'attach' => false, 'gender' => null,     'accrual' => 'annual',  'lead' => 0],
            ['code' => 'EL',   'name' => 'Emergency Leave',                   'credits' => 3,   'paid' => true,  'attach' => false, 'gender' => null,     'accrual' => 'annual',  'lead' => 0],
            ['code' => 'SIL',  'name' => 'Service Incentive Leave',           'credits' => 5,   'paid' => true,  'attach' => false, 'gender' => null,     'accrual' => 'annual',  'lead' => 0],
            ['code' => 'BL',   'name' => 'Bereavement Leave',                 'credits' => 3,   'paid' => true,  'attach' => true,  'gender' => null,     'accrual' => 'none',    'lead' => 0],
            ['code' => 'ML',   'name' => 'Maternity Leave (105 days)',        'credits' => 105, 'paid' => true,  'attach' => true,  'gender' => 'female', 'accrual' => 'none',    'lead' => 30, 'max' => 105],
            ['code' => 'PL',   'name' => 'Paternity Leave (7 days)',          'credits' => 7,   'paid' => true,  'attach' => true,  'gender' => 'male',   'accrual' => 'none',    'lead' => 0,  'max' => 7],
            ['code' => 'SPL',  'name' => 'Solo Parent Leave',                 'credits' => 7,   'paid' => true,  'attach' => true,  'gender' => null,     'accrual' => 'annual',  'lead' => 0,  'max' => 7],
            ['code' => 'MCW',  'name' => 'Magna Carta for Women (60 days)',   'credits' => 60,  'paid' => true,  'attach' => true,  'gender' => 'female', 'accrual' => 'none',    'lead' => 0,  'max' => 60],
            ['code' => 'VAWC', 'name' => 'VAWC Leave (10 days)',              'credits' => 10,  'paid' => true,  'attach' => true,  'gender' => 'female', 'accrual' => 'annual',  'lead' => 0,  'max' => 10],
        ];

        foreach ($types as $t) {
            LeaveType::firstOrCreate(
                ['company_id' => $company->id, 'code' => $t['code']],
                [
                    'name' => $t['name'],
                    'default_credits_per_year' => $t['credits'],
                    'is_paid' => $t['paid'],
                    'requires_attachment' => $t['attach'],
                    'gender_restriction' => $t['gender'],
                    'accrual_method' => $t['accrual'],
                    'min_days_filing_lead' => $t['lead'],
                    'max_consecutive_days' => $t['max'] ?? null,
                    'is_active' => true,
                ],
            );
        }
    }
}
