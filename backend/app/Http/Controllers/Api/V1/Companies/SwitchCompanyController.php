<?php

namespace App\Http\Controllers\Api\V1\Companies;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SwitchCompanyController extends Controller
{
    /** Roles that make a user a company-wide admin (member of every company). */
    public const ADMIN_ROLES = ['super_admin', 'admin', 'it_admin', 'hr_admin', 'hr_confi'];

    /**
     * IDs of every active company an admin implicitly belongs to. Sandbox (demo)
     * companies are excluded: they exist for testing, and sweeping them in here
     * put the demo company in every real admin's switcher. Demo accounts are
     * attached to their company explicitly, so they are unaffected.
     */
    private function allCompanyIds(): array
    {
        return \Illuminate\Support\Facades\DB::table('companies')
            ->where('is_active', true)->where('is_demo', false)
            ->whereNull('deleted_at')->pluck('id')->all();
    }

    /** True if the user holds an admin role in ANY company (roles are team-scoped). */
    private function isAdminAnywhere(\App\Models\User $user): bool
    {
        return \Illuminate\Support\Facades\DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->where('model_has_roles.model_id', $user->id)
            ->where('model_has_roles.model_type', $user->getMorphClass())
            ->whereIn('roles.name', self::ADMIN_ROLES)
            ->exists();
    }

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'integer'],
        ]);

        $user     = $request->user();
        $targetId = (int) $data['company_id'];

        // Captured in the CURRENT (home) team, before we change the team below.
        // Every role the user holds in the company they are LEAVING is carried into
        // the target company so that an admin (or any privileged user) in one company
        // keeps the same access in every company they switch to.
        $carryRoles = $user->getRoleNames()->all();
        $isAdmin = $this->isAdminAnywhere($user);

        // Only admins may enter any company. Everyone else must be a member of the
        // target — including users who have switched before. (Previously a set
        // original_company_id also bypassed this, which let any multi-company user
        // reach companies they don't belong to after their first switch.)
        if (! $isAdmin) {
            $member = $user->companies()->where('companies.id', $targetId)->first();
            if (! $member) {
                throw ValidationException::withMessages([
                    'company_id' => 'You are not a member of this company.',
                ]);
            }
        }

        // Remember the home company (for reference), but switching back to it is
        // allowed — users need to be able to return to where they started.
        if ($user->original_company_id === null) {
            $user->original_company_id = $user->active_company_id;
        }

        $user->forceFill(['active_company_id' => $targetId])->save();

        setPermissionsTeamId($targetId);

        // Carry every role the user held in the previous company into this one, so
        // switching never strips privileges — an admin in one company stays an admin
        // in every company they enter. Everyone keeps the baseline employee role.
        foreach ($carryRoles as $role) {
            if (! $user->hasRole($role)) {
                $user->assignRole($role);
            }
        }
        if (! $user->hasRole('employee')) {
            $user->assignRole('employee');
        }

        // Admins belong to every company, so they can switch into any of them.
        if ($user->hasAnyRole(self::ADMIN_ROLES)) {
            $user->companies()->syncWithoutDetaching($this->allCompanyIds());
        }

        return response()->json([
            'message'           => 'Active company switched.',
            'active_company_id' => $targetId,
        ]);
    }
}
