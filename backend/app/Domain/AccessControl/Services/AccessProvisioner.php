<?php

namespace App\Domain\AccessControl\Services;

use App\Domain\AccessControl\Models\AccessRequest;
use App\Models\User;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * Applies the access implied by a fully-approved access request to the target
 * user's account. The request captures abstract module/level selections; this
 * service maps them to the system's real Spatie permissions.
 *
 * NOTE: this MAP is the single source of truth for "what a module+level grants".
 * It is intentionally conservative — only permissions that already exist are
 * applied, and modules with no backing feature (recruitment, performance) grant
 * nothing. Review/adjust here as the permission set grows.
 */
class AccessProvisioner
{
    private const MAP = [
        'ess' => [
            'view' => ['leave.file'],
            'user' => ['leave.file'],
        ],
        'timekeeping' => [
            'view' => ['attendance.view'],
            'user' => ['attendance.view'],
            'approver' => ['attendance.view', 'attendance.approve.any', 'attendance.approve.self_dept'],
            'admin' => ['attendance.view', 'attendance.view.any', 'attendance.manage', 'attendance.correct'],
        ],
        'leave' => [
            'view' => ['leave.view'],
            'user' => ['leave.file'],
            'approver' => ['leave.view', 'leave.approve.any'],
            'admin' => ['leave.view', 'leave.manage_types'],
        ],
        'payroll' => [
            'view' => ['payroll.view'],
            'user' => ['payroll.view'],
            'approver' => ['payroll.view', 'payroll.approve'],
            'admin' => ['payroll.view', 'payroll.run', 'payroll.post', 'compensation.view', 'compensation.manage'],
        ],
        'reports' => [
            'view' => ['gov_report.view', 'audit.view'],
            'admin' => ['gov_report.view', 'gov_report.generate', 'audit.view'],
        ],
        'admin' => [
            'view' => ['audit.view'],
            'admin' => ['user.manage', 'role.manage', 'company.manage'],
        ],
        // recruitment, performance: no backing permissions yet → grant nothing.
    ];

    /**
     * @return array{user_id:?int, applied:array<string>, action:string, note:string}
     */
    public function apply(AccessRequest $accessRequest): array
    {
        $accessRequest->loadMissing('modules');

        $perms = [];
        foreach ($accessRequest->modules as $module) {
            $levels = array_keys(array_filter([
                'view' => (bool) $module->view,
                'user' => (bool) $module->user,
                'approver' => (bool) $module->approver,
                'admin' => (bool) $module->admin,
            ]));
            foreach ($levels as $level) {
                foreach (self::MAP[$module->module][$level] ?? [] as $permission) {
                    $perms[$permission] = true;
                }
            }
        }

        // Access is FOR the named employee — resolve their login by company email.
        $user = User::where('email', $accessRequest->company_email)->first();
        if (! $user) {
            return ['user_id' => null, 'applied' => [], 'action' => 'none', 'note' => 'no_user_for_company_email'];
        }

        $names = Permission::whereIn('name', array_keys($perms))->pluck('name')->all();
        if (empty($names)) {
            return ['user_id' => $user->id, 'applied' => [], 'action' => 'none', 'note' => 'no_mapped_permissions'];
        }

        app(PermissionRegistrar::class)->setPermissionsTeamId($accessRequest->company_id);

        // Removal requests revoke the mapped access; everything else grants it.
        if ($accessRequest->request_type === 'access_removal') {
            $user->revokePermissionTo($names);

            return ['user_id' => $user->id, 'applied' => $names, 'action' => 'revoked', 'note' => ''];
        }

        $user->givePermissionTo($names);

        return ['user_id' => $user->id, 'applied' => $names, 'action' => 'granted', 'note' => ''];
    }
}
