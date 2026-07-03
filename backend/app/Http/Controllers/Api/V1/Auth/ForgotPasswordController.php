<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Password;

class ForgotPasswordController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        // Fire and forget — always return 200 to prevent email enumeration.
        Password::sendResetLink($request->only('email'));

        return response()->json([
            'message' => 'If an account exists with that email, a password reset link has been sent.',
        ]);
    }
}
