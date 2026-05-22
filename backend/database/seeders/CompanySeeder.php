<?php

namespace Database\Seeders;

use App\Domain\Identity\Models\Branch;
use App\Domain\Identity\Models\Company;
use Illuminate\Database\Seeder;

class CompanySeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::firstOrCreate(
            ['code' => 'MPP-MAIN'],
            [
                'legal_name' => 'Meatplus Philippines, Inc.',
                'trade_name' => 'Meatplus',
                'country' => 'Philippines',
                'contact_email' => 'hr@meatplus.ph',
                'is_active' => true,
            ],
        );

        Branch::firstOrCreate(
            ['company_id' => $company->id, 'code' => 'HO'],
            [
                'name' => 'Head Office',
                'is_head_office' => true,
                'is_active' => true,
            ],
        );
    }
}
