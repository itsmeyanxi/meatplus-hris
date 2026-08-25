<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\BiometricAnomaly;
use App\Domain\Identity\Support\HrRecipients;
use App\Models\User;
use App\Notifications\BiometricHealthDigest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/**
 * ONE daily bell item per person covering every biometric problem at once, instead of
 * a separate notification per terminal and per PIN collision.
 *
 * The old per-item fan-out is why nobody read them: 485 notifications had piled up
 * with 79% unread, the PIN-collision alerts sitting at 12% — the same two collisions
 * re-announced for twelve days while both stayed unfixed. Volume was the problem, not
 * awareness, so this trades immediacy for something a person will actually open.
 *
 * A recipient who oversees several companies gets their problems MERGED into a single
 * notification rather than one per company. Nothing is sent when nothing is wrong: a
 * daily "all clear" is exactly the noise this replaces.
 */
class BiometricDigestBuilder
{
    /** Staged (unmatched) punches above this are worth naming in the digest. */
    private const STAGED_FLOOR = 100;

    /** Below this match rate a device is losing a meaningful share of what it sends. */
    private const MATCH_RATE_FLOOR = 80.0;

    public function __construct(private readonly DeviceSilenceDetector $silence) {}

    /**
     * Build and send today's digest.
     *
     * @return array{recipients:int, offline:int, collisions:int, staged:int, emailed:bool}
     */
    public function sendDaily(): array
    {
        $offline = $this->silence->downDevices();
        $collisions = $this->openCollisions();
        $staged = $this->stagedByCompany();

        $emailToday = $this->emailAllowedToday();

        // Every company that has something wrong, and what.
        $companyIds = collect()
            ->merge($offline->pluck('company_id'))
            ->merge($collisions->pluck('company_id'))
            ->merge($staged->keys())
            ->filter()
            ->unique()
            ->values();

        if ($companyIds->isEmpty()) {
            return ['recipients' => 0, 'offline' => 0, 'collisions' => 0, 'staged' => 0, 'emailed' => false];
        }

        // Resolve recipients per company, then invert to user => companies so anyone
        // covering several tenants receives ONE merged digest, not one per company.
        $perUser = [];
        foreach ($companyIds as $companyId) {
            $users = HrRecipients::withPermissionForCompany('device.manage', $companyId)
                ->concat(HrRecipients::withPermissionForCompany('attendance.manage', $companyId))
                ->unique('id');

            foreach ($users as $user) {
                $perUser[$user->id]['user'] = $user;
                $perUser[$user->id]['companies'][] = $companyId;
            }
        }

        $sent = 0;
        foreach ($perUser as $entry) {
            /** @var User $user */
            $user = $entry['user'];
            $scope = $entry['companies'];

            $payload = [
                'offline' => $offline->whereIn('company_id', $scope)->values()->all(),
                'collisions' => $collisions->whereIn('company_id', $scope)->values()->all(),
                'staged' => $staged->only($scope)->sum(),
                'weak_devices' => $this->weakDevices()->whereIn('company_id', $scope)->values()->all(),
            ];

            // A recipient whose own companies are all healthy gets nothing.
            if (! $payload['offline'] && ! $payload['collisions'] && ! $payload['weak_devices'] && $payload['staged'] < self::STAGED_FLOOR) {
                continue;
            }

            $channels = $emailToday ? ['database', 'mail'] : ['database'];
            Notification::send($user, new BiometricHealthDigest($payload, $channels));
            $sent++;
        }

        // Record that HR has now been told about these collisions, so the review page
        // and any later audit can see when the last notice went out.
        if ($sent > 0 && $collisions->isNotEmpty()) {
            BiometricAnomaly::whereIn('id', $collisions->pluck('id'))->update(['notified_at' => now()]);
        }

        return [
            'recipients' => $sent,
            'offline' => $offline->count(),
            'collisions' => $collisions->count(),
            'staged' => (int) $staged->sum(),
            'emailed' => $emailToday && $sent > 0,
        ];
    }

    /**
     * Email goes out on MONDAYS and FRIDAYS only — start of the week and before the
     * weekend, when someone is actually around to go and look at a terminal. The
     * in-app digest lands every day regardless, so nothing is ever hidden; this only
     * limits which days it also arrives in an inbox.
     */
    public function emailAllowedToday(?Carbon $now = null): bool
    {
        $day = ($now ?? now())->dayOfWeek;

        return $day === Carbon::MONDAY || $day === Carbon::FRIDAY;
    }

    /**
     * Open PIN-reuse collisions — someone else's punches landing on an employee.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function openCollisions(): Collection
    {
        return BiometricAnomaly::query()
            ->whereNull('resolved_at')
            ->with('employee:id,first_name,last_name,employee_no')
            ->orderByDesc('punches')
            ->get()
            ->map(fn (BiometricAnomaly $a) => [
                'id' => $a->id,
                'company_id' => $a->company_id ? (int) $a->company_id : null,
                'employee' => $a->employee
                    ? \App\Domain\HRIS\Models\Employee::formatName($a->employee->first_name, $a->employee->last_name)
                    : 'Unknown employee',
                'pin' => $a->pin,
                'device_name' => $a->device_name,
                'punches' => (int) $a->punches,
                'days_open' => $a->detected_at ? (int) $a->detected_at->diffInDays(now()) : 0,
            ]);
    }

    /** Pending unmatched punches per company. @return Collection<int,int> */
    private function stagedByCompany(): Collection
    {
        return DB::table('unmatched_punches')
            ->whereNull('reclaimed_at')
            ->selectRaw('company_id, count(*) as c')
            ->groupBy('company_id')
            ->pluck('c', 'company_id')
            ->mapWithKeys(fn ($c, $id) => [(int) $id => (int) $c]);
    }

    /**
     * Active terminals reachable but throwing away a large share of what they send —
     * the PINs on them are not mapped in the HRIS.
     *
     * @return Collection<int, array<string, mixed>>
     */
    private function weakDevices(): Collection
    {
        $matched = DB::table('time_logs')
            ->where('logged_at', '>=', now()->subDays(30))
            ->selectRaw('device_id, count(*) c')
            ->groupBy('device_id')
            ->pluck('c', 'device_id');

        $unmatched = DB::table('unmatched_punches')
            ->where('logged_at', '>=', now()->subDays(30))
            ->selectRaw('device_key, count(*) c')
            ->groupBy('device_key')
            ->pluck('c', 'device_key');

        return \App\Domain\Attendance\Models\AttendanceDevice::withoutGlobalScopes()
            ->where('is_active', true)
            ->get()
            ->map(function ($d) use ($matched, $unmatched) {
                $ok = (int) ($matched[$d->serial_no] ?? 0);
                $bad = (int) ($unmatched[$d->serial_no] ?? 0);
                $seen = $ok + $bad;

                return [
                    'company_id' => $d->company_id ? (int) $d->company_id : null,
                    'name' => $d->name,
                    'match_rate' => $seen > 0 ? round($ok / $seen * 100, 1) : null,
                    'lost' => $bad,
                ];
            })
            // Only worth naming when the terminal is genuinely busy AND losing a lot;
            // a device with three stray punches is not a problem to wake anyone for.
            ->filter(fn ($r) => $r['match_rate'] !== null
                && $r['match_rate'] < self::MATCH_RATE_FLOOR
                && $r['lost'] >= self::STAGED_FLOOR)
            ->sortBy('match_rate')
            ->values();
    }
}
