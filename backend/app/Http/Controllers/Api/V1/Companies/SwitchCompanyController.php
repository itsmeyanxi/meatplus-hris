<?php

namespace App\Http\Controllers\Api\V1\Companies;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SwitchCompanyController extends Controller
{
    /** Roles that make a user a company-wide admin (member of every company). */
    public const ADMIN_ROLES = ['it_admin', 'hr_admin'];

    /** IDs of every active company. */
    private function allCompanyIds(): array
    {
        return \Illuminate\Support\Facades\DB::table('companies')
            ->where('is_active', true)->whereNull('deleted_at')->pluck('id')->all();
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
        $isAdmin = $user->hasAnyRole(self::ADMIN_ROLES);

        // Admins (and anyone who has switched before) may enter any company; regular
        // users must be a member of the target company.
        $isItAccount = $isAdmin || $user->original_company_id !== null;

        if (! $isItAccount) {
            // Regular users must be a member of the target company.
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
