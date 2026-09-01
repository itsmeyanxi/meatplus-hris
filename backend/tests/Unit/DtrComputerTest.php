<?php

namespace Tests\Unit;

use App\Domain\Attendance\Models\TimeLog;
use App\Domain\Attendance\Services\DtrComputer;
use App\Domain\HRIS\Models\Employee;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Regression cover for the DTR engine's shift-pairing rules.
 *
 * These run with NO database: computeDay() takes plain model instances, so the tests
 * build unsaved Employee / TimeLog objects and invoke it directly. That keeps them
 * fast and, more importantly, means the suite cannot touch real attendance data.
 *
 * The bug they exist to stop coming back: `logged_at` is a MUTABLE Carbon (the model's
 * datetime cast), and the 16-hour shift cap did `$actualIn->addMinutes(...)` without
 * copy(). That moved $actualIn itself into the future and made the cutoff the same
 * instant, so the "latest punch within the cap" filter read "> X and <= X", matched
 * nothing, and the day was persisted with a time-in 16 hours after the real punch and
 * no time-out at all. It produced 4,049 wrong rows across 250 employees over ten
 * months, each losing night differential and any rest-day or holiday premium.
 */
class DtrComputerTest extends TestCase
{
    private function computeDay(Employee $employee, CarbonImmutable $day, Collection $logs): array
    {
        $m = new ReflectionMethod(DtrComputer::class, 'computeDay');
        $m->setAccessible(true);

        // (employee, day, scheduleDay, holiday, dayLogs) - the rest default to null.
        return $m->invoke(new DtrComputer, $employee, $day, null, null, $logs);
    }

    private function employee(): Employee
    {
        $e = new Employee;
        $e->forceFill([
            'id' => 1,
            'company_id' => 1,
            'employee_no' => 'TEST-1',
            'first_name' => 'Test',
            'last_name' => 'Employee',
            'is_active' => true,
            'time_in_out_required' => true,
            'schedule_type' => 'regular',
        ]);

        return $e;
    }

    /** @param array<int, string> $times */
    private function punches(array $times): Collection
    {
        return collect($times)->map(function (string $t) {
            $log = new TimeLog;
            $log->forceFill(['logged_at' => $t, 'direction' => null]);

            return $log;
        });
    }

    public function test_a_span_beyond_the_shift_cap_keeps_the_real_time_in(): void
    {
        $day = CarbonImmutable::parse('2026-08-02');
        // 05:25 arrival, then a punch 16h36m later - beyond MAX_SHIFT_MINUTES.
        $logs = $this->punches([
            '2026-08-02 05:25:20',
            '2026-08-02 13:53:34',
            '2026-08-02 22:01:02',
        ]);

        $dtr = $this->computeDay($this->employee(), $day, $logs);

        $this->assertSame(
            '2026-08-02 05:25:20',
            CarbonImmutable::parse($dtr['actual_in'])->toDateTimeString(),
            'actual_in must be the real first punch, never a fabricated one'
        );
    }

    public function test_the_out_punch_is_the_latest_one_inside_the_cap(): void
    {
        $day = CarbonImmutable::parse('2026-08-02');
        $logs = $this->punches([
            '2026-08-02 05:25:20',
            '2026-08-02 13:53:34',   // within 16h - the best available out
            '2026-08-02 22:01:02',   // beyond the cap - belongs to a later shift
        ]);

        $dtr = $this->computeDay($this->employee(), $day, $logs);

        $this->assertNotNull($dtr['actual_out'], 'a punch inside the cap must be used as the time-out');
        $this->assertSame(
            '2026-08-02 13:53:34',
            CarbonImmutable::parse($dtr['actual_out'])->toDateTimeString()
        );
        $this->assertGreaterThan(0, (float) $dtr['hours_worked'], 'a paired shift must credit hours');
    }

    public function test_the_time_in_is_never_exactly_the_cap_after_a_real_punch(): void
    {
        // The precise signature of the old bug: actual_in landing exactly
        // MAX_SHIFT_MINUTES after a punch that really happened.
        $day = CarbonImmutable::parse('2026-08-02');
        $logs = $this->punches(['2026-08-02 05:25:20', '2026-08-02 22:01:02']);

        $dtr = $this->computeDay($this->employee(), $day, $logs);

        $phantom = CarbonImmutable::parse('2026-08-02 05:25:20')
            ->addMinutes(DtrComputer::MAX_SHIFT_MINUTES)
            ->toDateTimeString();

        $this->assertNotSame(
            $phantom,
            CarbonImmutable::parse($dtr['actual_in'])->toDateTimeString(),
            'actual_in is the +16h phantom - the mutable-Carbon bug is back'
        );
    }

    public function test_computing_a_day_does_not_mutate_the_punches_it_was_given(): void
    {
        $day = CarbonImmutable::parse('2026-08-02');
        $logs = $this->punches([
            '2026-08-02 05:25:20',
            '2026-08-02 13:53:34',
            '2026-08-02 22:01:02',
        ]);
        $before = $logs->map(fn (TimeLog $l) => $l->logged_at->toDateTimeString())->all();

        $this->computeDay($this->employee(), $day, $logs);

        $after = $logs->map(fn (TimeLog $l) => $l->logged_at->toDateTimeString())->all();
        $this->assertSame($before, $after, 'computeDay must not rewrite the timestamps handed to it');
    }

    public function test_a_normal_shift_pairs_and_credits_hours(): void
    {
        $day = CarbonImmutable::parse('2026-08-02');
        $logs = $this->punches(['2026-08-02 06:00:00', '2026-08-02 15:00:00']);

        $dtr = $this->computeDay($this->employee(), $day, $logs);

        $this->assertSame('2026-08-02 06:00:00', CarbonImmutable::parse($dtr['actual_in'])->toDateTimeString());
        $this->assertSame('2026-08-02 15:00:00', CarbonImmutable::parse($dtr['actual_out'])->toDateTimeString());
        $this->assertSame(9.0, (float) $dtr['hours_worked'], 'no schedule means no unpaid break is deducted');
        $this->assertFalse($dtr['is_absent'], 'a day with punches is never absent');
    }

    public function test_a_second_tap_moments_after_arrival_is_not_treated_as_a_time_out(): void
    {
        $day = CarbonImmutable::parse('2026-08-02');
        $logs = $this->punches(['2026-08-02 06:00:00', '2026-08-02 06:02:00']);

        $dtr = $this->computeDay($this->employee(), $day, $logs);

        $this->assertNull($dtr['actual_out'], 'a double-tap at arrival must not close the shift');
    }
}
