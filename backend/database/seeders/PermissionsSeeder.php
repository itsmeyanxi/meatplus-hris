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
            'audit.view',
            'access_request.view',
            'access_request.approve.supervisor', 'access_request.approve.hr', 'access_request.approve.it',
        ];

        foreach ($permissions as $name) {
            Permission::findOrCreate($name, 'web');
        }

        $rolePermissions = [
            // super_admin gets everything EXCEPT the stages reserved for other roles:
            // supervisor/HR access-request stages, and leave approval (dept_head only).
            'super_admin' => array_values(array_diff($permissions, [
                // Access requests are reserved for dept_head / HR head / IT admin only.
                'access_request.view',
                'access_request.approve.supervisor',
                'access_request.approve.hr',
                'access_request.approve.it',
                'leave.approve.any',
                'leave.approve.self_dept',
                // Approvals reserved for dept_head (consistent "immediate supervisor approves" model).
                'attendance.approve.any',
                'attendance.approve.self_dept',
                // Attendance administration (schedules, holidays, shift adjustments, time logs,
                // DTR recompute, filing/approving for others) is reserved for HR only.
                'attendance.manage',
            ])),
            'hr_admin' => [
                'employee.view', 'employee.create', 'employee.update',
                'attendance.view', 'attendance.view.any', 'attendance.manage', 'attendance.correct',
                'leave.view', 'leave.manage_types',
                'compensation.view',
                'user.manage', 'role.manage', 'audit.view',
                'access_request.view', 'access_request.approve.hr',
            ],
            'hr_manager' => [
                'employee.view',
                'attendance.view', 'attendance.view.any', 'attendance.manage', 'leave.view',
                'compensation.view', 'audit.view',
                'user.manage',
            ],
            // IT: manages user accounts and owns the IT stage of access requests.
            'it_admin' => [
                'user.manage',
                'access_request.view', 'access_request.approve.it',
                'audit.view',
            ],
            'payroll_officer' => [
                'employee.view', 'attendance.view',
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
        ];

        foreach ($rolePermissions as $roleName => $perms) {
            $role = Role::findOrCreate($roleName, 'web');
            $role->syncPermissions($perms);
        }
    }
}
