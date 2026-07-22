<?php

namespace App\Domain\Identity\Services;

use App\Domain\HRIS\Models\Employee;

/**
 * Suggests a role for an employee — DEPARTMENT first, then job title. This is
 * only a HINT for HR; it never assigns anything. Deliberately conservative: it
 * will NEVER suggest sensitive roles (it_admin, hr_admin, payroll, compensation)
 * — those must always be granted by hand.
 */
class RoleSuggester
{
    /**
     * Specialised departments where the DEPARTMENT itself defines the role,
     * regardless of the person's level. Checked first.
     *
     * @var array<string, string>
     */
    private const DEPARTMENT_RULES = [
        'hr_coordinator' => '/human resource/i',
        'it_staff' => '/\bISR\b|information system|information technology/i',
        'sales_employee' => '/\bsales\b|commercial/i',
    ];

    /**
     * For every other department, the TITLE sets the level. First match wins.
     *
     * @var array<string, string>
     */
    private const TITLE_RULES = [
        'it_staff' => '/information technology|\bI\.?T\.?\b\s*(staff|technician|support|admin|personnel)/i',
        'dept_head' => '/\bmanager\b|department head|plant manager|\bhead\b|\bchief\b|\bdirector\b/i',
        'supervisor' => '/supervisor|foreman/i',
        'team_lead' => '/team\s*lead|lead\s*man|leadman/i',
        'timekeeper' => '/timekeeper|time\s*keeper/i',
        'transport_access' => '/\bdriver\b/i',
    ];

    /** @return string|null role name, 'employee' as the safe default, or null if no dept/title */
    public function suggest(?Employee $employee): ?string
    {
        $dept = (string) ($employee?->department?->name ?? '');
        $title = (string) ($employee?->position?->title ?? '');

        if ($dept === '' && $title === '') {
            return null;
        }

        // 1. Department first — HR / IT / Sales get their role from the department.
        foreach (self::DEPARTMENT_RULES as $role => $pattern) {
            if ($dept !== '' && preg_match($pattern, $dept) === 1) {
                return $role;
            }
        }

        // 2. Otherwise the title's seniority/level.
        foreach (self::TITLE_RULES as $role => $pattern) {
            if ($title !== '' && preg_match($pattern, $title) === 1) {
                return $role;
            }
        }

        return 'employee';
    }
}
