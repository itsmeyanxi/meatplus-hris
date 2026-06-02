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
use Spatie\Permission\PermissionRegistrar;

class UserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()->can('user.manage'), 403);

        $companyId = $request->user()->active_company_id;

        $q = User::query()
            ->with(['employee:id,employee_no,first_name,last_name,user_id'])
            ->whereHas('companies', fn ($c) => $c->where('companies.id', $companyId))
            ->orderBy('name');

        if ($search = $request->query('q')) {
            $like = '%'.str_replace('%', '\%', $search).'%';
            $q->where(function ($w) use ($like) {
                $w->where('name', 'like', $like)->orWhere('email', 'like', $like);
            });
        }

        if ($request->query('only_active') === 'true') {
            $q->where('is_active', true);
        }

        return UserResource::collection($q->limit(500)->get());
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

        app(PermissionRegistrar::class)->setPermissionsTeamId($companyId);
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

        return new UserResource($user->load('employee'));
    }

    public function update(UpdateUserRequest $request, User $user): UserResource
    {
        $this->ensureSameCompany($request, $user);

        $data = $request->validated();
        $role = $data['role'] ?? null;
        unset($data['role']);

        if (! empty($data)) {
            $user->update($data);
        }

        if ($role) {
            $companyId = $request->user()->active_company_id;
            app(PermissionRegistrar::class)->setPermissionsTeamId($companyId);
            $user->syncRoles([$role]);
        }

        return new UserResource($user->fresh(['employee']));
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

    public function destroy(Request $request, User $user): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);
        $this->ensureSameCompany($request, $user);

        if ($user->id === $request->user()->id) {
            throw ValidationException::withMessages(['user' => 'You cannot deactivate yourself.']);
        }

        $user->update(['is_active' => false]);
        $user->delete(); // soft delete

        return response()->json(['message' => 'User deactivated.']);
    }

    /**
     * POST /employees/{employee}/provision-login
     * Creates a User account, links it to the employee, assigns the `employee` role,
     * and returns the temp password ONCE. Idempotent: if already provisioned, returns 422.
     */
    public function provisionForEmployee(Request $request, \App\Domain\HRIS\Models\Employee $employee): JsonResponse
    {
        abort_unless($request->user()->can('user.manage'), 403);

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

        app(PermissionRegistrar::class)->setPermissionsTeamId($employee->company_id);
        $user->assignRole('employee');

        $employee->forceFill(['user_id' => $user->id])->save();

        return response()->json([
            'message' => 'Login provisioned. Share these credentials with the employee (password shown ONCE).',
            'user' => (new UserResource($user->fresh(['employee'])))->resolve(),
            'temporary_password' => $temp,
        ], 201);
    }

    private function ensureSameCompany(Request $request, User $user): void
    {
        $companyId = $request->user()->active_company_id;
        if (! $user->companies()->where('companies.id', $companyId)->exists()) {
            abort(404);
        }
    }
}
