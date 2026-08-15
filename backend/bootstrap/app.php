<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        apiPrefix: 'api',
        // ZKTeco ADMS endpoints run with NO middleware (no CSRF/session/auth).
        then: function () {
            Route::middleware([])->group(base_path('routes/iclock.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Render (and any load balancer) terminates TLS upstream. Without this,
        // Laravel sees plain HTTP, generates http:// URLs and refuses to set
        // secure session cookies.
        $middleware->trustProxies(at: '*');

        $middleware->statefulApi();

        $middleware->api(prepend: [
            EnsureFrontendRequestsAreStateful::class,
            \App\Http\Middleware\SetPermissionsTeam::class,
        ]);

        // Generous per-user rate-limit backstop against abuse/DoS (won't trip a
        // normal dashboard), plus "online now" tracking (stamps last_seen_at).
        // Appended so both run after auth has resolved the user.
        $middleware->api(append: [
            'throttle:api',
            \App\Http\Middleware\TrackUserActivity::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        });
        $exceptions->render(function (\Symfony\Component\Routing\Exception\RouteNotFoundException $e, Request $request) {
            // Unauthenticated requests to guarded endpoints try to redirect to a
            // 'login' route that this API-only app doesn't define. Answer 401 (for
            // api/* or the login-redirect case) instead of a 500 error page.
            if ($request->is('api/*') || str_contains($e->getMessage(), 'login')) {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });
        // …and don't log that login-redirect case — it's pure noise, not a fault.
        $exceptions->report(function (\Symfony\Component\Routing\Exception\RouteNotFoundException $e) {
            if (str_contains($e->getMessage(), 'login')) {
                return false;
            }
        });
    })->create();
