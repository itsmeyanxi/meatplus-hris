<?php

namespace Database\Seeders;

use App\Domain\Identity\Models\Company;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::where('code', 'MPP-MAIN')->firstOrFail();

        $user = User::firstOrCreate(
            ['email' => 'itdevice@meatplus.ph'],
            [
                'name' => 'IT Device',
                'password' => Hash::make('changeme'),
                'is_active' => true,
                'active_company_id' => $company->id,
            ],
        );

        $user->companies()->syncWithoutDetaching([
            $company->id => ['is_default' => true],
        ]);

        setPermissionsTeamId($company->id);
        $user->assignRole('super_admin');
    }
}
