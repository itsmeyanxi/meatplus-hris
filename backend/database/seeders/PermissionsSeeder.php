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
            'attendance.view', 'attendance.manage', 'attendance.correct', 'attendance.approve.self_dept',
            'leave.view', 'leave.file', 'leave.approve.self_dept', 'leave.approve.any', 'leave.manage_types',
            'payroll.view', 'payroll.run', 'payroll.approve', 'payroll.post',
            'compensation.view', 'compensation.manage',
            'gov_report.view', 'gov_report.generate',
            'company.manage', 'user.manage', 'role.manage',
            'audit.view',
            'access_request.view',
            'access_request.approve.supervisor', 'access_request.approve.hr', 'access_request.approve.it',
        ];

        foreach ($permissions as $name) {
            Permission::findOrCreate($name, 'web');
        }

        $rolePermissions = [
            // super_admin gets everything EXCEPT the supervisor/HR approval stages —
            // those belong strictly to dept_head and hr_admin. super_admin only acts on the IT stage.
            'super_admin' => array_values(array_diff($permissions, [
                'access_request.approve.supervisor',
                'access_request.approve.hr',
            ])),
            'hr_admin' => [
                'employee.view', 'employee.create', 'employee.update',
                'attendance.view', 'attendance.manage', 'attendance.correct',
                'leave.view', 'leave.approve.any', 'leave.manage_types',
                'compensation.view',
                'user.manage', 'role.manage', 'audit.view',
                'access_request.view', 'access_request.approve.hr',
            ],
            'hr_manager' => [
                'employee.view',
                'attendance.view', 'leave.view', 'leave.approve.any',
                'compensation.view', 'audit.view',
            ],
            'payroll_officer' => [
                'employee.view', 'attendance.view',
                'payroll.view', 'payroll.run', 'payroll.approve', 'payroll.post',
                'compensation.view', 'compensation.manage',
                'gov_report.view', 'gov_report.generate', 'audit.view',
            ],
            'dept_head' => [
                'employee.view', 'attendance.view', 'attendance.approve.self_dept',
                'leave.view', 'leave.approve.self_dept',
                'access_request.view', 'access_request.approve.supervisor',
            ],
            'employee' => [
                'leave.file',
            ],
        ];

        foreach ($rolePermissions as $roleName => $perms) {
            $role = Role::findOrCreate($roleName, 'web');
            $role->syncPermissions($perms);
        }
    }
}
