<?php

namespace App\Domain\Identity\Services;

use App\Domain\HRIS\Models\Employee;

/**
 * Suggests a role for an employee from their job title. This is only a HINT for
 * HR — it never assigns anything. Deliberately conservative: it will NEVER
 * suggest sensitive roles (it_admin, hr_admin, payroll, compensation) — those
 * must always be granted by hand.
 */
class RoleSuggester
{
    /**
     * Ordered title patterns → role. First match wins, so more specific groups
     * (IT, HR) come before broader ones (manager, supervisor).
     *
     * @var array<string, string>
     */
    private const RULES = [
        'it_staff'         => '/information technology|\bI\.?T\.?\b\s*(staff|technician|support|personnel)|system admin/i',
        'hr_coordinator'   => '/human resource|\bHR\b/i',
        'dept_head'        => '/\bmanager\b|department head|plant manager|\bhead\b/i',
        'supervisor'       => '/supervisor|foreman/i',
        'team_lead'        => '/team\s*lead|lead\s*man|leadman/i',
        'timekeeper'       => '/timekeeper|time\s*keeper/i',
        'transport_access' => '/\bdriver\b/i',
    ];

    /** @return string|null role name, or 'employee' as the safe default, null if no title */
    public function suggest(?Employee $employee): ?string
    {
        $title = $employee?->position?->title;
        if (! $title) {
            return null;
        }

        foreach (self::RULES as $role => $pattern) {
            if (preg_match($pattern, $title) === 1) {
                return $role;
            }
        }

        return 'employee';
    }
}
