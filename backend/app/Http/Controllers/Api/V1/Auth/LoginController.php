<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class LoginController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        // Require the account to be active as part of the credentials, so a
        // deactivated (is_active = false) user cannot authenticate.
        if (! Auth::attempt([...$data, 'is_active' => true], true)) {
            throw ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]);
        }

        $request->session()->regenerate();

        $user = Auth::user();
        $user->forceFill(['last_login_at' => now()])->save();

        if (! $user->active_company_id) {
            $first = $user->companies()->wherePivot('is_default', true)->first()
                ?? $user->companies()->first();
            if ($first) {
                $user->forceFill(['active_company_id' => $first->id])->save();
            }
        }

        return response()->json([
            'message' => 'Logged in.',
            'user' => $user->only(['id', 'name', 'email', 'active_company_id']),
        ]);
    }
}
