<?php

namespace App\Providers;

use App\Mail\Transport\MicrosoftGraphTransport;
use Illuminate\Auth\Events\Authenticated;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;
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
        // One password policy for the whole app: at least one lowercase, uppercase,
        // number and symbol. Length min is 8 here; the 20-char max is applied
        // alongside via a 'max:20' rule at each call site.
        Password::defaults(fn () => Password::min(8)->mixedCase()->numbers()->symbols());

        // Rate limiters. `login` stops password brute-force (per email+IP, plus a
        // broader per-IP cap for credential stuffing); `password` guards the
        // reset/invite flows; `api` is a generous per-user backstop against abuse
        // that won't trip a normal data-heavy dashboard.
        RateLimiter::for('login', fn (Request $r) => [
            Limit::perMinute(5)->by(strtolower((string) $r->input('email')).'|'.$r->ip()),
            Limit::perMinute(20)->by($r->ip()),
        ]);
        RateLimiter::for('password', fn (Request $r) => Limit::perMinute(4)->by(strtolower((string) $r->input('email')).'|'.$r->ip()));
        RateLimiter::for('api', fn (Request $r) => Limit::perMinute(300)->by(optional($r->user())->id ?: $r->ip()));

        // Microsoft 365 mail transport (Graph API). Enabled by MAIL_MAILER=microsoft-graph.
        Mail::extend('microsoft-graph', function (array $config) {
            return new MicrosoftGraphTransport(
                (string) ($config['tenant_id'] ?? ''),
                (string) ($config['client_id'] ?? ''),
                (string) ($config['client_secret'] ?? ''),
                (string) ($config['from'] ?? ''),
            );
        });

        Gate::before(function ($user, string $ability) {
            // The `admin` super-role and IT Admin both bypass every ability check
            // in every company, regardless of the active team. (admin additionally
            // bypasses the company scope — see CompanyScope.)
            if (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin()) {
                return true;
            }
            if (method_exists($user, 'isItAdmin') && $user->isItAdmin()) {
                return true;
            }

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
