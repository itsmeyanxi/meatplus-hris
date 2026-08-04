<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class TrackUserActivity
{
    /**
     * Stamp the authenticated user's last_seen_at so we can tell who is online
     * "right now". Throttled: we only write when the stored value is missing or
     * older than THROTTLE_SECONDS, so we don't issue a DB write on every request.
     */
    private const THROTTLE_SECONDS = 60;

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user) {
            $last = $user->last_seen_at;
            if (! $last || $last->diffInSeconds(now()) >= self::THROTTLE_SECONDS) {
                // Direct UPDATE (not model save) to avoid touching updated_at,
                // firing observers/audit logs, or clobbering a concurrent write.
                DB::table('users')->where('id', $user->id)->update(['last_seen_at' => now()]);
                $user->setAttribute('last_seen_at', now());
            }
        }

        return $next($request);
    }
}
