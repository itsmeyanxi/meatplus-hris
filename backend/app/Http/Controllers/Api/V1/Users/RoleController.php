<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    /**
     * List every role with its permission names. Used by IT Admin's "view as role"
     * preview to mirror what each role can see. IT-only (it drives a privileged UI).
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()->hasRole('it_admin'), 403);

        $roles = Role::query()
            ->with('permissions:id,name')
            ->orderBy('name')
            ->get()
            ->map(fn (Role $r) => [
                'name' => $r->name,
                'permissions' => $r->permissions->pluck('name')->values(),
            ]);

        return response()->json(['data' => $roles]);
    }
}
