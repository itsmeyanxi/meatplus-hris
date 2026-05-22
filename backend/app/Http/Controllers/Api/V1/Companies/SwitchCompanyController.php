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

        $user = $request->user();
        $target = $user->companies()->where('companies.id', $data['company_id'])->first();

        if (! $target && ! $user->hasRole('super_admin')) {
            throw ValidationException::withMessages([
                'company_id' => 'You are not a member of this company.',
            ]);
        }

        $user->forceFill(['active_company_id' => $data['company_id']])->save();

        setPermissionsTeamId($data['company_id']);

        return response()->json([
            'message' => 'Active company switched.',
            'active_company_id' => $data['company_id'],
        ]);
    }
}
