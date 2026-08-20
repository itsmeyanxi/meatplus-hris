<?php

namespace App\Domain\Attendance\Services\Biometric;

use App\Domain\Attendance\Models\AttendanceDevice;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Health of every biometric terminal: is it still talking to us, is what it sends
 * actually landing on an employee, and who loses attendance while it is silent.
 *
 * Built because "is the biometric working?" could only be answered by hand-running
 * queries. A terminal can look fine in the device list (is_active = true, a serial,
 * a company) while having sent nothing for weeks — and because absence is judged
 * from missing punches, a silent device quietly marks its people ABSENT every day.
 */
class ConnectionReport
{
    /** A device that pushed within this many minutes is considered live. */
    private const LIVE_MINUTES = 60;

    /** Beyond this many days of silence a device is treated as offline, not idle. */
    private const OFFLINE_DAYS = 3;

    /** Window used for throughput and the ingestion match rate. */
    private const WINDOW_DAYS = 30;

    /**
     * @return array{devices: array<int, array<string, mixed>>, summary: array<string, mixed>}
     */
    public function build(): array
    {
        $now = now();
        $since30 = $now->copy()->subDays(self::WINDOW_DAYS);

        // Throughput per device, from the punches that actually landed on an employee.
        $logs = DB::table('time_logs')
            ->where('logged_at', '>=', $since30)
            ->selectRaw('device_id,
                count(*) AS total,
                sum(case when logged_at >= ? then 1 else 0 end) AS last7,
                sum(case when logged_at::date = current_date then 1 else 0 end) AS today,
                count(distinct employee_id) AS employees,
                max(logged_at) AS last_punch', [$now->copy()->subDays(7)])
            ->groupBy('device_id')
            ->get()
            ->keyBy('device_id');

        // Punches the device sent that matched NOBODY — the other half of "is it working".
        $staged = DB::table('unmatched_punches')
            ->whereNull('reclaimed_at')
            ->selectRaw('device_key, count(*) AS pending, count(distinct pin) AS pins')
            ->groupBy('device_key')
            ->get()
            ->keyBy('device_key');

        $staged30 = DB::table('unmatched_punches')
            ->where('logged_at', '>=', $since30)
            ->selectRaw('device_key, count(*) AS c')
            ->groupBy('device_key')
            ->get()
            ->keyBy('device_key');

        $devices = [];

        foreach (AttendanceDevice::query()->with('company:id,code')->orderBy('name')->get() as $d) {
            $key = $d->serial_no;
            $t = $logs->get($key);
            $s = $staged->get($key);
            $s30 = $staged30->get($key);

            $lastEvent = $d->last_event_at ? Carbon::parse($d->last_event_at) : null;
            $minutes = $lastEvent ? $lastEvent->diffInMinutes($now) : null;

            $matched30 = (int) ($t->total ?? 0);
            $unmatched30 = (int) ($s30->c ?? 0);
            $seen30 = $matched30 + $unmatched30;

            $devices[] = [
                'id' => $d->id,
                'name' => $d->name,
                'serial_no' => $d->serial_no,
                'vendor' => $d->vendor,
                'company' => $d->company?->code,
                'is_active' => (bool) $d->is_active,
                'last_event_at' => $lastEvent?->toIso8601String(),
                'last_synced_at' => $d->last_synced_at?->toIso8601String(),
                'silent_minutes' => $minutes,
                'state' => $this->state($d, $minutes),
                'punches_today' => (int) ($t->today ?? 0),
                'punches_7d' => (int) ($t->last7 ?? 0),
                'punches_30d' => $matched30,
                'employees_30d' => (int) ($t->employees ?? 0),
                'last_punch_at' => $t->last_punch ?? null,
                // Staged = the device is reachable but its PINs map to nobody.
                'staged_pending' => (int) ($s->pending ?? 0),
                'staged_pins' => (int) ($s->pins ?? 0),
                // What share of what it sent in the window actually landed on a person.
                'match_rate' => $seen30 > 0 ? round($matched30 / $seen30 * 100, 1) : null,
                'attention' => $this->attention($d, $minutes, $matched30, (int) ($s->pending ?? 0), $seen30),
            ];
        }

        return [
            'devices' => $devices,
            'summary' => [
                'generated_at' => $now->toIso8601String(),
                'total' => count($devices),
                'live' => collect($devices)->where('state', 'live')->count(),
                'idle' => collect($devices)->where('state', 'idle')->count(),
                'quiet' => collect($devices)->where('state', 'quiet')->count(),
                'offline' => collect($devices)->where('state', 'offline')->count(),
                'never' => collect($devices)->where('state', 'never')->count(),
                'pending_devices' => collect($devices)->where('is_active', false)->count(),
                'punches_today' => collect($devices)->sum('punches_today'),
                'staged_pending' => collect($devices)->sum('staged_pending'),
                'needs_attention' => collect($devices)->reject(fn ($d) => $d['attention'] === null)->count(),
            ],
        ];
    }

    /** live · idle · quiet · offline · never — from how long since the device last pushed. */
    private function state(AttendanceDevice $d, ?int $minutes): string
    {
        if ($minutes === null) {
            return 'never';
        }
        if ($minutes <= self::LIVE_MINUTES) {
            return 'live';
        }
        if ($minutes < 60 * 24) {
            return 'idle';           // same day — normal outside punch hours
        }
        if ($minutes < 60 * 24 * self::OFFLINE_DAYS) {
            return 'quiet';          // a day or two — suspicious, not yet damning
        }

        return 'offline';
    }

    /**
     * One plain sentence when a device needs a human, otherwise null. Ordered so the
     * most consequential problem wins — a dead terminal matters more than a low
     * match rate, because silence is what silently marks people absent.
     */
    private function attention(AttendanceDevice $d, ?int $minutes, int $matched30, int $pending, int $seen30): ?string
    {
        if (! $d->is_active) {
            return 'Not approved — its punches are being REJECTED. Set the company and activate it.';
        }
        if ($minutes === null) {
            return 'Has never contacted the server. Check power, network and the ADMS/server address on the terminal.';
        }

        $days = intdiv($minutes, 60 * 24);

        if ($days >= self::OFFLINE_DAYS) {
            return "Silent for {$days} days. Anyone who normally punches here is being marked ABSENT — check the terminal.";
        }
        if ($days >= 1 && $matched30 > 0) {
            return "No contact for {$days} day(s) after being active — worth checking before it costs someone a day's pay.";
        }
        if ($pending > 0 && $seen30 > 0 && $matched30 === 0) {
            return "Reachable, but NONE of its punches match an employee — {$pending} staged. The PINs on this terminal are not mapped in the HRIS.";
        }
        if ($pending > 500) {
            return "{$pending} punches staged against unmapped PINs — map them so the attendance can be recovered.";
        }

        return null;
    }
}
