<?php

namespace App\Http\Middleware;

use Spatie\Permission\PermissionRegistrar;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetPermissionsTeam
{
    public function handle(Request $request, Closure $next): Response
    {
        $companyId = $request->user()?->active_company_id;

        if ($companyId) {
            app(PermissionRegistrar::class)->setPermissionsTeamId($companyId);
        }

        return $next($request);
    }
}