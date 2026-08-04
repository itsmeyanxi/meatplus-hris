<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MeController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->active_company_id) {
            setPermissionsTeamId($user->active_company_id);
        }

        // Avoid stale empty relations from earlier eager loads in the same request.
        $user->unsetRelation('roles');
        $user->unsetRelation('permissions');

        $user->load([
            'activeCompany:id,code,legal_name',
            'companies:id,code,legal_name',
            'employee:id,user_id,employee_no,first_name,last_name,department_id,position_id,date_hired',
            'employee.department:id,name',
            'employee.position:id,title',
        ]);

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => $user->is_active,
                'must_change_password' => (bool) $user->must_change_password,
                'last_login_at' => $user->last_login_at,
                'active_company' => $user->activeCompany,
                'original_company_id' => $user->original_company_id,
                'companies' => $user->companies,
                'roles' => $user->getRoleNames()->values()->all(),
                'permissions' => $user->getAllPermissions()->pluck('name')->unique()->values()->all(),
                'employee' => $user->employee ? [
                    'id'          => $user->employee->id,
                    'employee_no' => $user->employee->employee_no,
                    'full_name'   => $user->employee->full_name,
                    'department'  => $user->employee->department?->name,
                    'position'    => $user->employee->position?->title,
                    'date_hired'  => $user->employee->date_hired?->format('Y-m-d'),
                ] : null,
            ],
        ]);
    }
}
