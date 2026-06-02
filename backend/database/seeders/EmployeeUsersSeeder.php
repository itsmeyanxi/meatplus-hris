<?php

namespace Database\Seeders;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Models\Company;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class EmployeeUsersSeeder extends Seeder
{
    public function run(): void
    {
        // Provision a login for our test employee Juan Dela Cruz so we can verify
        // the self-service flow end-to-end. In production, employee provisioning
        // happens through an HR action ("Create login for this employee") that
        // sends an email invite — see [[phase-2-2-state]] for the deferred work.

        $juan = Employee::query()->where('employee_no', 'EMP-0001')->first();
        if (! $juan) {
            return;
        }

        $company = Company::find($juan->company_id);
        if ($company) {
            app(PermissionRegistrar::class)->setPermissionsTeamId($company->id);
        }

        $user = User::firstOrCreate(
            ['email' => 'juan.delacruz@meatplus.ph'],
            [
                'name' => $juan->full_name,
                'password' => Hash::make('changeme'),
                'is_active' => true,
                'active_company_id' => $juan->company_id,
            ],
        );

        // Link in both directions: user.companies pivot + employee.user_id
        $user->companies()->syncWithoutDetaching([
            $juan->company_id => ['is_default' => true],
        ]);

        if ($juan->user_id !== $user->id) {
            $juan->forceFill(['user_id' => $user->id])->save();
        }

        $role = Role::findByName('employee', 'web');
        $user->roles()->syncWithoutDetaching([
            $role->id => ['company_id' => $juan->company_id],
        ]);
    }
}
