<?php

namespace App\Providers;

use Illuminate\Auth\Events\Authenticated;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
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
