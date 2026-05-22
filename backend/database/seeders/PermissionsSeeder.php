<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class PermissionsSeeder extends Seeder
{
    public function run(): void
    {
        app(PermissionRegistrar::class)->forgetCachedPermissions();

        $permissions = [
            'employee.view', 'employee.create', 'employee.update', 'employee.delete',
            'attendance.view', 'attendance.manage', 'attendance.correct', 'attendance.approve.self_dept',
            'leave.view', 'leave.file', 'leave.approve.self_dept', 'leave.approve.any', 'leave.manage_types',
            'payroll.view', 'payroll.run', 'payroll.approve', 'payroll.post',
            'compensation.view', 'compensation.manage',
            'gov_report.view', 'gov_report.generate',
            'company.manage', 'user.manage', 'role.manage',
            'audit.view',
        ];

        foreach ($permissions as $name) {
            Permission::findOrCreate($name, 'web');
        }

        $rolePermissions = [
            'super_admin' => $permissions,
            'hr_admin' => [
                'employee.view', 'employee.create', 'employee.update',
                'attendance.view', 'attendance.manage', 'attendance.correct',
                'leave.view', 'leave.approve.any', 'leave.manage_types',
                'compensation.view',
                'user.manage', 'role.manage', 'audit.view',
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
