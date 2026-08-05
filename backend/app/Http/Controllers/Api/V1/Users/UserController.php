<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Http\Controllers\Controller;
use App\Http\Requests\Users\StoreUserRequest;
use App\Http\Requests\Users\UpdateUserRequest;
use App\Http\Resources\Users\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
class UserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('user.manage'), 403);

        // Users the requester may see: anyone sharing at least one company with them.
        // For admins (members of every company) that's the whole directory, which the
        // Users page then groups by company. A `company_id` narrows to one company.
        $accessibleCompanyIds = $request->user()->companies()->pluck('companies.id')->all();
        $filterCompany = $request->integer('company_id') ?: null;

        $q = User::query()
            ->with([
                // Load the linked employee WITHOUT the company scope: a user's employee
                // (and their real company) must resolve even when it lives in a company
                // other than the viewer's active one — otherwise cross-company admins show
                // no linked employee and get grouped under the wrong company.
                'employee' => fn ($e) => $e->withoutGlobalScopes()
                    ->select('id', 'employee_no', 'first_name', 'last_name', 'user_id', 'position_id', 'department_id', 'company_id')
                    ->with([
                        'position' => fn ($p) => $p->withoutGlobalScopes()->select('id', 'title'),
                        'department' => fn ($d) => $d->withoutGlobalScopes()->select('id', 'name'),
                        'company:id,code,legal_name',
                    ]),
                'companies:id,code,legal_name',
                'activeCompany:id,code,legal_name',
            ])
            ->whereHas('companies', function ($c) use ($accessibleCompanyIds, $filterCompany) {
                $c->whereIn('companies.id', $accessibleCompanyIds);
                if ($filterCompany) {
                    $c->where('companies.id', $filterCompany);
                }
            })
            ->orderBy('name');

        if ($search = $request->query('q')) {
            $like = '%'.str_replace('%', '\%', $search).'%';
            $op = $this->likeOperator();
            $q->where(function ($w) use ($like, $op) {
                $w->where('name', $op, $like)->orWhere('email', $op, $like);
            });
        }

        if ($request->query('only_active') === 'true') {
            $q->where('is_active', true);
        }

        // Higher cap now that the list can span every company (grouped client-side).
        return UserResource::collection($q->limit(2000)->get());
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $data = $request->validated();
        $companyId = $request->user()->active_company_id;

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
            'is_active' => true,
            'active_company_id' => $companyId,
        ]);

        $user->companies()->syncWithoutDetaching([
            $companyId => ['is_default' => true],
        ]);

        setPermissionsTeamId($companyId);
        $user->assignRole($data['role']);

        if (! empty($data['employee_id'])) {
            \App\Domain\HRIS\Models\Employee::where('id', $data['employee_id'])
                ->update(['user_id' => $user->id]);
        }

        return (new UserResource($user->fresh(['employee'])))->response()->setStatusCode(201);
    }

    public function show(Request $request, User $user): UserResource
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->ensureSameCompany($request, $user);

        // Bypass the company scope so a cross-company user's linked employee still loads.
        $user->load([
            'employee' => fn ($e) => $e->withoutGlobalScopes()->with([
                'position' => fn ($p) => $p->withoutGlobalScopes(),
                'department' => fn ($d) => $d->withoutGlobalScopes(),
                'company:id,code,legal_name',
            ]),
            'companies',
            'activeCompany:id,code,legal_name',
        ]);

        return new UserResource($user);
    }

    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        $this->ensureSameCompany($request, $user);

        $data  = $request->validated();
        $roles = $data['roles'] ?? null;
        unset($data['roles']);

        $companyIds = array_key_exists('company_ids', $data) ? $data['company_ids'] : null;
        unset($data['company_ids']);

        if (! empty($data)) {
            $user->update($data);
        }

        if ($roles) {
            $companyId = $request->user()->active_company_id;
            setPermissionsTeamId($companyId);
            $user->syncRoles($roles);
        }

        // Set which companies this user can access/switch between. Keep the active
        // company valid — if it was removed, drop into the first assigned company.
        if ($companyIds !== null) {
            $ids = array_values(array_unique(array_map('intval', $companyIds)));
            if (! empty($ids)) {
                $user->companies()->sync($ids);
                if (! in_array($user->active_company_id, $ids, true)) {
                    $user->forceFill(['active_company_id' => $ids[0]])->save();
                }
            }
        }

        return new UserResource($user->fresh(['employee', 'companies']));
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->ensureSameCompany($request, $user);

        $temp = Str::password(12, true, true, false);
        $user->forceFill(['password' => Hash::make($temp)])->save();

        return response()->json([
            'message' => 'Password reset. Share this with the user (shown ONCE).',
            'temporary_password' => $temp,
        ]);
    }

    public function deactivate(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->ensureSameCompany($request, $user);

        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages(['user' => 'You cannot deactivate yourself.']);
        }

        $user->update(['is_active' => false]);

        return response()->json(['data' => UserResource::make($user->fresh(['employee']))]);
    }

    public function activate(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->ensureSameCompany($request, $user);

        $user->update(['is_active' => true]);

        return response()->json(['data' => UserResource::make($user->fresh(['employee']))]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->ensureSameCompany($request, $user);

        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages(['user' => 'You cannot delete yourself.']);
        }

        $user->delete(); // soft delete

        return response()->json(['message' => 'User deleted.']);
    }

    /**
     * POST /employees/{employee}/provision-login
     * Creates a User account, links it to the employee, assigns the `employee` role,
     * and returns the temp password ONCE. Idempotent: if already provisioned, returns 422.
     */
    public function provisionForEmployee(Request $request, \App\Domain\HRIS\Models\Employee $employee): JsonResponse
    {
        // Provisioning grants only the baseline `employee` role, so the narrow
        // user.invite is enough — no role assignment happens here.
        abort_unless($request->user()->canAny(['user.invite', 'user.manage']), 403);

        if ($employee->user_id) {
            throw ValidationException::withMessages([
                'employee' => 'This employee already has a user account.',
            ]);
        }

        $email = $employee->email_company ?: $employee->email_personal;
        if (! $email) {
            throw ValidationException::withMessages([
                'employee' => 'Set the employee\'s company or personal email before provisioning a login.',
            ]);
        }

        if (User::where('email', $email)->exists()) {
            throw ValidationException::withMessages([
                'email' => "A user with email {$email} already exists. Link manually or change the employee's email.",
            ]);
        }

        $temp = Str::password(12, true, true, false);

        $user = User::create([
            'name' => $employee->full_name,
            'email' => $email,
            'password' => Hash::make($temp),
            'is_active' => true,
            'active_company_id' => $employee->company_id,
        ]);

        $user->companies()->syncWithoutDetaching([
            $employee->company_id => ['is_default' => true],
        ]);

        setPermissionsTeamId($employee->company_id);
        $user->assignRole('employee');

        $employee->forceFill(['user_id' => $user->id])->save();

        return response()->json([
            'message' => 'Login provisioned. Share these credentials with the employee (password shown ONCE).',
            'user' => (new UserResource($user->fresh(['employee'])))->resolve(),
            'temporary_password' => $temp,
        ], 201);
    }

    /**
     * POST /users/bulk-provision
     * Creates login accounts in bulk for the given active employees, all with the
     * SAME shared password and must_change_password = true (forced change on first
     * login). Employees log in with their employee number as username; a real email
     * is used when present, otherwise a non-deliverable placeholder (email is a
     * required, unique column but login also works by username).
     */
    public function bulkProvision(Request $request): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $data = $request->validate([
            'password'       => ['required', 'string', 'min:6', 'max:100'],
            'employee_ids'   => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer'],
        ]);

        $companyId = $request->user()->active_company_id;
        $hash = Hash::make($data['password']);

        // Only active employees in the active company that don't already have a login.
        $employees = \App\Domain\HRIS\Models\Employee::query()
            ->whereIn('id', $data['employee_ids'])
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->whereNull('user_id')
            ->get();

        $companyCode = strtolower((string) optional($request->user()->activeCompany)->code ?: 'co'.$companyId);

        setPermissionsTeamId($companyId);

        $created = [];
        $skipped = 0;
        $errors = [];

        foreach ($employees as $employee) {
            if (! $employee->employee_no) {
                $skipped++;
                $errors[] = "{$employee->full_name}: no employee number";
                continue;
            }

            try {
                $username = $this->uniqueUsername($employee->employee_no, $companyCode);
                $email = $this->loginEmail($employee, $companyCode);

                $user = User::create([
                    'name' => $employee->full_name,
                    'username' => $username,
                    'email' => $email,
                    'password' => $hash,
                    'is_active' => true,
                    'must_change_password' => true,
                    'active_company_id' => $companyId,
                ]);

                $user->companies()->syncWithoutDetaching([
                    $companyId => ['is_default' => true],
                ]);
                $user->assignRole('employee');
                $employee->forceFill(['user_id' => $user->id])->save();

                $created[] = [
                    'employee_no' => $employee->employee_no,
                    'name' => $employee->full_name,
                    'username' => $username,
                ];
            } catch (\Throwable $e) {
                report($e);
                $skipped++;
                $errors[] = "{$employee->full_name}: could not create login";
            }
        }

        return response()->json([
            'message' => count($created).' login(s) created. Share the username + shared password; each user must change it on first sign-in.',
            'created' => count($created),
            'skipped' => $skipped,
            'errors' => $errors,
            'accounts' => $created,
        ], 201);
    }

    /** employee_no as username, falling back to company-prefixed if already taken. */
    private function uniqueUsername(string $employeeNo, string $companyCode): string
    {
        $base = trim($employeeNo);
        if (! User::where('username', $base)->exists()) {
            return $base;
        }
        $prefixed = "{$companyCode}-{$base}";
        $candidate = $prefixed;
        $i = 1;
        while (User::where('username', $candidate)->exists()) {
            $candidate = "{$prefixed}-".(++$i);
        }

        return $candidate;
    }

    /** Real employee email when unused, else a unique non-deliverable placeholder. */
    private function loginEmail(\App\Domain\HRIS\Models\Employee $employee, string $companyCode): string
    {
        $real = $employee->email_company ?: $employee->email_personal;
        if ($real && ! User::where('email', $real)->exists()) {
            return $real;
        }
        $base = strtolower($employee->employee_no).'@'.$companyCode.'.noemail.local';
        $candidate = $base;
        $i = 1;
        while (User::where('email', $candidate)->exists()) {
            $candidate = strtolower($employee->employee_no).'-'.(++$i).'@'.$companyCode.'.noemail.local';
        }

        return $candidate;
    }

    private function ensureSameCompany(Request $request, User $user): void
    {
        $companyId = $request->user()->active_company_id;
        if (! $user->companies()->where('companies.id', $companyId)->exists()) {
            abort(404);
        }
    }
}
