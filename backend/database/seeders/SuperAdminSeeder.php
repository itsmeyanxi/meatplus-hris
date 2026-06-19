<?php

namespace Database\Seeders;

use App\Domain\Identity\Models\Company;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class SuperAdminSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::where('code', 'MPP-MAIN')->firstOrFail();
        app(PermissionRegistrar::class)->setPermissionsTeamId($company->id);

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

        // IT is the top-level administrator role (replaces the retired super_admin).
        $role = Role::findByName('it_admin', 'web');

        $user->roles()->syncWithoutDetaching([
            $role->id => ['company_id' => $company->id],
        ]);
    }
}
