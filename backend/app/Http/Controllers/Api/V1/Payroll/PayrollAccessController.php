<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Domain\Identity\Models\Company;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

/**
 * Payroll User Access — who may work on payroll, for which company.
 *
 * This needs no new table. Spatie is configured with teams
 * (config/permission.php: team_foreign_key = company_id), so a role grant already
 * belongs to one company: model_has_roles carries company_id, and
 * SetPermissionsTeam pins it to the caller's active company on every request.
 *
 * A "payroll company code" here is simply companies.code. The roles offered are
 * the ones that actually carry payroll permissions, rather than a parallel list
 * that could drift from what the permission seeder grants.
 */
class PayrollAccessController extends Controller
{
    /** Roles that hold at least one payroll.* permission. */
    private function payrollRoleNames(): array
    {
        $permissionIds = DB::table('permissions')
            ->whereIn('name', ['payroll.view', 'payroll.run', 'payroll.approve', 'payroll.post'])
            ->pluck('id');

        $roleIds = DB::table('role_has_permissions')
            ->whereIn('permission_id', $permissionIds)
            ->distinct()
            ->pluck('role_id');

        return Role::query()->whereIn('id', $roleIds)->orderBy('name')->pluck('name')->all();
    }

    /** Companies the caller may administer access for. */
    private function allowedCompanyIds(Request $request): array
    {
        $user = $request->user();

        return $user->hasRole('it_admin')
            ? Company::query()->pluck('id')->all()
            : $user->companies()->pluck('companies.id')->all();
    }

    public function options(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $companyIds = $this->allowedCompanyIds($request);

        return response()->json([
            'data' => [
                'roles' => $this->payrollRoleNames(),
                'companies' => Company::query()->whereIn('id', $companyIds)
                    ->orderBy('code')
                    ->get(['id', 'code', 'legal_name', 'trade_name'])
                    ->map(fn ($c) => [
                        'id' => $c->id,
                        'code' => $c->code,
                        'name' => $c->trade_name ?: $c->legal_name,
                    ]),
            ],
        ]);
    }

    /** Every payroll role grant, across the companies the caller can see. */
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $roleNames = $this->payrollRoleNames();
        $companyIds = $this->allowedCompanyIds($request);

        $rows = DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->join('users', 'users.id', '=', 'model_has_roles.model_id')
            ->leftJoin('companies', 'companies.id', '=', 'model_has_roles.company_id')
            ->whereIn('roles.name', $roleNames)
            ->whereIn('model_has_roles.company_id', $companyIds)
            ->where('model_has_roles.model_type', User::class)
            ->select([
                'users.id as user_id',
                'users.name as user_name',
                'users.email as user_email',
                'users.is_active',
                'companies.id as company_id',
                'companies.code as company_code',
                DB::raw('COALESCE(companies.trade_name, companies.legal_name) as company_name'),
                'roles.name as payroll_role',
            ])
            ->orderBy('companies.code')
            ->orderBy('users.name')
            ->get();

        return response()->json(['data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'company_id' => ['required', 'integer', Rule::in($this->allowedCompanyIds($request))],
            'payroll_role' => ['required', 'string', Rule::in($this->payrollRoleNames())],
        ]);

        $user = User::findOrFail($data['user_id']);

        // Grant the role inside the target company's team, not the caller's.
        $previous = getPermissionsTeamId();
        setPermissionsTeamId($data['company_id']);

        try {
            if (! $user->hasRole($data['payroll_role'])) {
                $user->assignRole($data['payroll_role']);
            }
        } finally {
            setPermissionsTeamId($previous);
        }

        return response()->json(['message' => 'Payroll access granted.'], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'company_id' => ['required', 'integer', Rule::in($this->allowedCompanyIds($request))],
            'payroll_role' => ['required', 'string', Rule::in($this->payrollRoleNames())],
        ]);

        $user = User::findOrFail($data['user_id']);

        $previous = getPermissionsTeamId();
        setPermissionsTeamId($data['company_id']);

        try {
            $user->removeRole($data['payroll_role']);
        } finally {
            setPermissionsTeamId($previous);
        }

        return response()->json(['message' => 'Payroll access revoked.']);
    }
}
