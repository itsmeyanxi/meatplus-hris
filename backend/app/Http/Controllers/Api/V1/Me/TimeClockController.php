<?php

namespace App\Http\Controllers\Api\V1\Me;

use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Services\DtrComputer;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Web time clock for the signed-in employee — the browser equivalent of the
 * biometric punch. Writes into the same `time_logs` table (source = "web") so
 * punches flow into DTR exactly like device punches (DtrComputer takes the
 * first `in` and last `out` of the day, regardless of source).
 *
 * Times are stamped in Asia/Manila to match the naive wall-clock the biometric
 * device stores, since the app's configured timezone is UTC.
 */
class TimeClockController extends Controller
{
    private const TZ = 'Asia/Manila';

    public function show(Request $request): JsonResponse
    {
        $employee = $request->user()->employee;
        if (! $employee) {
            return response()->json(['message' => 'Your account is not linked to an employee record.'], 422);
        }

        return response()->json(['data' => $this->todayState($employee->id)]);
    }

    public function store(Request $request, DtrComputer $dtr): JsonResponse
    {
        $employee = $request->user()->employee;
        if (! $employee) {
            return response()->json(['message' => 'Your account is not linked to an employee record.'], 422);
        }

        $validated = $request->validate([
            'direction' => 'required|in:in,out',
            'lat' => 'nullable|numeric|between:-90,90',
            'lng' => 'nullable|numeric|between:-180,180',
        ]);
        $direction = $validated['direction'];

        // Sequence guard: can't clock in twice, or clock out without clocking in.
        $state = $this->todayState($employee->id);
        if ($direction === 'in' && $state['state'] === 'in') {
            return response()->json(['message' => "You're already clocked in."], 422);
        }
        if ($direction === 'out' && $state['state'] !== 'in') {
            return response()->json(['message' => 'You need to clock in first.'], 422);
        }

        $now = CarbonImmutable::now(self::TZ);
        TimeLog::create([
            'company_id' => $employee->company_id,
            'employee_id' => $employee->id,
            'logged_at' => $now,
            'direction' => $direction,
            'source' => 'web',
            'device_id' => 'WEB',
            'source_event_id' => (string) Str::uuid(),
            'ip_address' => $request->ip(),
            'lat' => $validated['lat'] ?? null,
            'lng' => $validated['lng'] ?? null,
            'metadata' => ['user_agent' => Str::limit((string) $request->userAgent(), 250, '')],
        ]);

        // Refresh just today's DTR so the dashboard reflects the punch immediately.
        // One day is cheap; never let a compute hiccup fail the punch itself.
        try {
            $day = $now->startOfDay();
            $dtr->computeForEmployee($employee, $day, $day);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'data' => $this->todayState($employee->id),
            'message' => $direction === 'in' ? 'Clocked in.' : 'Clocked out.',
        ], 201);
    }

    /**
     * Today's punches for the employee plus the derived clock state.
     * Bypasses the company scope and keys off the (unique) employee id so it
     * works even when an admin's active company differs from the employee's.
     */
    private function todayState(int $employeeId): array
    {
        $start = CarbonImmutable::now(self::TZ)->startOfDay();
        $end = $start->endOfDay();

        $punches = TimeLog::withoutGlobalScopes()
            ->where('employee_id', $employeeId)
            ->whereBetween('logged_at', [$start, $end])
            ->orderBy('logged_at')
            ->get(['id', 'direction', 'logged_at', 'source']);

        $last = $punches->last();
        $state = $last && $last->direction === 'in' ? 'in' : 'out';
        $clockedInAt = $state === 'in'
            ? optional($punches->where('direction', 'in')->last())->logged_at?->toIso8601String()
            : null;

        return [
            'state' => $state, // "in" = currently clocked in, "out" = not
            'clocked_in_at' => $clockedInAt,
            'last_punch_at' => optional($last)->logged_at?->toIso8601String(),
            'server_time' => CarbonImmutable::now(self::TZ)->toIso8601String(),
            'punches' => $punches->map(fn (TimeLog $p) => [
                'id' => $p->id,
                'direction' => $p->direction,
                'logged_at' => $p->logged_at->toIso8601String(),
                'source' => $p->source,
            ])->values(),
        ];
    }
}
