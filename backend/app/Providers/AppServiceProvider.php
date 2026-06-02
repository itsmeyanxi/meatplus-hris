<?php

namespace App\Providers;

use Illuminate\Auth\Events\Authenticated;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;
use Spatie\Permission\PermissionRegistrar;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Spatie registers this in boot(); binding early guarantees one instance so
        // setPermissionsTeamId() in middleware applies to role/permission queries.
        $this->app->singleton(PermissionRegistrar::class);
    }

    public function boot(): void
    {
        Gate::before(function ($user, string $ability) {
            if (method_exists($user, 'hasPermissionTo') && $user->hasPermissionTo($ability)) {
                return true;
            }

            return null;
        });

        Event::listen(Authenticated::class, function (Authenticated $event) {
            $user = $event->user;

            if ($user && property_exists($user, 'active_company_id') === false
                && method_exists($user, 'getAttribute')) {
                $companyId = $user->getAttribute('active_company_id');
            } else {
                $companyId = $user?->active_company_id ?? null;
            }

            if ($companyId) {
                setPermissionsTeamId($companyId);
            }
        });
    }
}
