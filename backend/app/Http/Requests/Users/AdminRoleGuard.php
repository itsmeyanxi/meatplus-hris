<?php

namespace App\Http\Requests\Users;

use App\Models\User;

/**
 * Stops a `user.manage` holder from handing out an admin role they don't hold
 * themselves.
 *
 * Both guarded roles are company-WIDE (SwitchCompanyController::ADMIN_ROLES):
 * their holders are attached to every company on login. Without this, an HR
 * officer scoped to one company could mint an hr_admin — for themselves or
 * anyone else — and reach every other company's data.
 */
final class AdminRoleGuard
{
    /** Roles that may only be granted by someone who already holds them. */
    private const GUARDED = ['it_admin', 'hr_admin'];

    public static function rule(?User $actor): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($actor): void {
            if (! in_array($value, self::GUARDED, true)) {
                return;
            }

            // it_admin is the top-level role and may grant either.
            if ($actor?->hasRole('it_admin') || $actor?->hasRole($value)) {
                return;
            }

            $fail("You are not allowed to assign the {$value} role.");
        };
    }
}
