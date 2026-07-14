<?php

namespace App\Http\Controllers\Api\V1\Companies;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class SwitchCompanyController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'integer'],
        ]);

        $user     = $request->user();
        $targetId = (int) $data['company_id'];

        // Captured in the CURRENT (home) team, before we change the team below.
        $isRealItAdmin = $user->hasRole('it_admin');

        // IT accounts are any user who currently has it_admin OR who has
        // previously switched away (original_company_id is set).
        $isItAccount = $isRealItAdmin || $user->original_company_id !== null;

        if (! $isItAccount) {
            // Regular users must be a member of the target company.
            $member = $user->companies()->where('companies.id', $targetId)->first();
            if (! $member) {
                throw ValidationException::withMessages([
                    'company_id' => 'You are not a member of this company.',
                ]);
            }
        }

        // On first switch, lock in the home company so it can never be returned to.
        if ($user->original_company_id === null) {
            $user->original_company_id = $user->active_company_id;
        }

        // Block switching back to the original/home company.
        if ($targetId === $user->original_company_id) {
            return response()->json([
                'message' => 'You cannot switch back to your original company.',
            ], 403);
        }

        $user->forceFill(['active_company_id' => $targetId])->save();

        setPermissionsTeamId($targetId);

        // IT admins keep full admin access in every company they switch to, so
        // switching never strips their roles. Everyone else gets at least the
        // employee role in the target company.
        if ($isRealItAdmin) {
            if (! $user->hasRole('it_admin')) {
                $user->assignRole('it_admin');
            }
        } elseif (! $user->hasRole('employee')) {
            $user->assignRole('employee');
        }

        return response()->json([
            'message'           => 'Active company switched.',
            'active_company_id' => $targetId,
        ]);
    }
}
