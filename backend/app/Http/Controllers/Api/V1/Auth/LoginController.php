<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class LoginController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email'    => ['required', 'string'],  // accepts email address OR username
            'password' => ['required', 'string'],
        ]);

        // Resolve by email first, then by username
        $user = User::where('email', $data['email'])
            ->orWhere('username', $data['email'])
            ->first();

        // Require active account and valid password
        if (! $user || ! $user->is_active || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]);
        }

        Auth::login($user, true);
        $request->session()->regenerate();

        $user->forceFill(['last_login_at' => now()])->save();

        if (! $user->active_company_id) {
            $first = $user->companies()->wherePivot('is_default', true)->first()
                ?? $user->companies()->first();
            if ($first) {
                $user->forceFill(['active_company_id' => $first->id])->save();
            }
        }

        // Admin roles are team-scoped, but admin ACCESS is meant to be global: if a
        // user is an admin in ANY company, make them a member of every company (so the
        // chooser and switching work) and ensure the role is present in the company
        // they're currently in — otherwise an admin whose role sits in their home
        // company would land elsewhere with no access and no company picker.
        if ($user->active_company_id) {
            $adminRoles = \Illuminate\Support\Facades\DB::table('model_has_roles')
                ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                ->where('model_has_roles.model_id', $user->id)
                ->where('model_has_roles.model_type', $user->getMorphClass())
                ->whereIn('roles.name', \App\Http\Controllers\Api\V1\Companies\SwitchCompanyController::ADMIN_ROLES)
                ->distinct()->pluck('roles.name');

            if ($adminRoles->isNotEmpty()) {
                // Sandbox companies are left out: an admin should not be swept into
                // the demo company just by logging in. Demo accounts are attached to
                // it explicitly, so they still work.
                $ids = \Illuminate\Support\Facades\DB::table('companies')
                    ->where('is_active', true)->where('is_demo', false)
                    ->whereNull('deleted_at')->pluck('id')->all();
                $user->companies()->syncWithoutDetaching($ids);

                setPermissionsTeamId($user->active_company_id);
                foreach ($adminRoles as $role) {
                    if (! $user->hasRole($role)) {
                        $user->assignRole($role);
                    }
                }
            }
        }

        return response()->json([
            'message' => 'Logged in.',
            'user'    => $user->only(['id', 'name', 'email', 'active_company_id']),
        ]);
    }
}
