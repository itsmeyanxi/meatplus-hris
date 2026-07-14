<?php

namespace Database\Seeders;

use App\Domain\Identity\Models\Company;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class PermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $company = Company::where('code', 'MPP-MAIN')->first();
        if ($company) {
            app(PermissionRegistrar::class)->setPermissionsTeamId($company->id);
        }

        $permissions = [
            'employee.view', 'employee.create', 'employee.update', 'employee.delete',
            'attendance.view', 'attendance.view.any', 'attendance.manage', 'attendance.correct',
            'attendance.approve.any', 'attendance.approve.self_dept',
            'leave.view', 'leave.file', 'leave.approve.self_dept', 'leave.approve.any', 'leave.manage_types',
            'payroll.view', 'payroll.run', 'payroll.approve', 'payroll.post',
            'compensation.view', 'compensation.manage',
            'gov_report.view', 'gov_report.generate',
            'company.manage', 'user.manage', 'role.manage',
            'device.manage',
            'audit.view',
            'access_request.view',
            'access_request.approve.supervisor', 'access_request.approve.hr', 'access_request.approve.it',
        ];

        foreach ($permissions as $name) {
            Permission::findOrCreate($name, 'web');
        }

        $rolePermissions = [
            'hr_admin' => [
                'employee.view', 'employee.create', 'employee.update',
                'attendance.view', 'attendance.view.any', 'attendance.manage', 'attendance.correct',
                'leave.view', 'leave.file', 'leave.approve.any', 'leave.manage_types',
                'compensation.view',
                'user.manage', 'role.manage', 'audit.view',
                'access_request.view', 'access_request.approve.hr',
                'device.manage',
            ],
            // IT is the top-level administrator: full access to every function of the system.
            'it_admin' => $permissions,
            'payroll_officer' => [
                'employee.view', 'attendance.view',
                'leave.view',
                'payroll.view', 'payroll.run', 'payroll.approve', 'payroll.post',
                'compensation.view', 'compensation.manage',
                'gov_report.view', 'gov_report.generate', 'audit.view',
            ],
            'dept_head' => [
                'employee.view', 'attendance.view',
                // dept_head is the sole approver for attendance requests AND leaves (role-based).
                'attendance.approve.any', 'attendance.approve.self_dept',
                'leave.view', 'leave.approve.any',
                'access_request.view', 'access_request.approve.supervisor',
            ],
            'employee' => [
                'leave.file',
            ],

            // --- Org-specific roles (added from the operational role list) ---
            'supervisor' => [
                'employee.view',
                'attendance.view', 'attendance.view.any',
                'attendance.approve.any', 'attendance.approve.self_dept',
                'leave.view', 'leave.approve.any',
                'access_request.view', 'access_request.approve.supervisor',
            ],
            'team_lead' => [
                'employee.view',
                'attendance.view', 'attendance.approve.self_dept',
                'leave.view', 'leave.file', 'leave.approve.self_dept',
                'access_request.view', 'access_request.approve.supervisor',
            ],
            'dept_admin' => [
                'employee.view', 'employee.update',
                'attendance.view', 'attendance.view.any', 'attendance.manage',
                'leave.view', 'leave.file',
            ],
            'transport_access' => [
                'employee.view',
                'attendance.view', 'attendance.view.any',
            ],
            'sales_employee' => [
                'attendance.view',
                'leave.file',
            ],
            'timekeeper' => [
                'attendance.view', 'attendance.view.any', 'attendance.manage', 'attendance.correct',
                'leave.view', 'leave.file',
            ],
            'hr_coordinator' => [
                'employee.view',
                'attendance.view', 'attendance.view.any',
                'leave.view', 'leave.file', 'leave.approve.any',
                'access_request.view', 'access_request.approve.hr',
            ],
            'garahe_teamlead' => [
                'employee.view',
                'attendance.view', 'attendance.view.any', 'attendance.manage', 'attendance.correct',
                'attendance.approve.self_dept',
                'leave.view', 'leave.file', 'leave.approve.self_dept',
            ],
        ];

        // Roles are shared across all companies. Create them with NO team so they
        // exist in every company's context; only the ASSIGNMENTS (model_has_roles)
        // are team-scoped. Otherwise roles created here would belong to a single
        // company and vanish when a user switches to another.
        app(\Spatie\Permission\PermissionRegistrar::class)->setPermissionsTeamId(null);

        foreach ($rolePermissions as $roleName => $perms) {
            $role = Role::findOrCreate($roleName, 'web');
            if ($role->company_id !== null) {
                $role->forceFill(['company_id' => null])->save();
            }
            $role->syncPermissions($perms);
        }

        // Retire legacy roles, migrating any holders into the surviving role.
        $this->retireRole('super_admin', 'it_admin', $company?->id);
        $this->retireRole('hr_manager', 'hr_admin', $company?->id);
    }

    /** Move every holder of $from to $into, then delete the $from role. */
    private function retireRole(string $from, string $into, ?int $companyId): void
    {
        $legacy = Role::where('name', $from)->first();
        if (! $legacy) {
            return;
        }

        $target = Role::findByName($into, 'web');
        foreach ($legacy->users as $user) {
            $user->roles()->syncWithoutDetaching([$target->id => ['company_id' => $companyId]]);
            $user->roles()->detach($legacy->id);
        }
        $legacy->delete();
    }
}
