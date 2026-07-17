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

        // Admins are members of every company, so the company chooser (and later
        // switching) lets them enter any of them.
        if ($user->active_company_id) {
            setPermissionsTeamId($user->active_company_id);
            if ($user->hasAnyRole(\App\Http\Controllers\Api\V1\Companies\SwitchCompanyController::ADMIN_ROLES)) {
                $ids = \Illuminate\Support\Facades\DB::table('companies')
                    ->where('is_active', true)->whereNull('deleted_at')->pluck('id')->all();
                $user->companies()->syncWithoutDetaching($ids);
            }
        }

        return response()->json([
            'message' => 'Logged in.',
            'user'    => $user->only(['id', 'name', 'email', 'active_company_id']),
        ]);
    }
}
