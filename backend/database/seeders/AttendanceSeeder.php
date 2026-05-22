<?php

namespace Database\Seeders;

use App\Domain\Attendance\Models\Holiday;
use App\Domain\Attendance\Models\WorkSchedule;
use App\Domain\Attendance\Models\WorkScheduleDay;
use App\Domain\Identity\Models\Company;
use Illuminate\Database\Seeder;

class AttendanceSeeder extends Seeder
{
    public function run(): void
    {
        $company = Company::where('code', 'MPP-MAIN')->firstOrFail();

        // Default Mon-Fri 8am-5pm work schedule with 1-hour unpaid break
        $schedule = WorkSchedule::firstOrCreate(
            ['company_id' => $company->id, 'code' => 'STD-MF-8-5'],
            [
                'name' => 'Standard Mon-Fri 8:00 AM - 5:00 PM',
                'description' => '8-hour day shift, 1-hour unpaid lunch break, Sat-Sun rest',
                'is_flexible' => false,
                'breaks_paid' => false,
                'weekly_workdays' => 5,
                'is_active' => true,
            ],
        );

        // 0=Sun, 1=Mon, ..., 6=Sat
        $days = [
            ['day_of_week' => 0, 'is_rest_day' => true, 'time_in' => null, 'time_out' => null, 'break_minutes' => 0, 'required_hours' => 0],
            ['day_of_week' => 1, 'is_rest_day' => false, 'time_in' => '08:00:00', 'time_out' => '17:00:00', 'break_minutes' => 60, 'required_hours' => 8],
            ['day_of_week' => 2, 'is_rest_day' => false, 'time_in' => '08:00:00', 'time_out' => '17:00:00', 'break_minutes' => 60, 'required_hours' => 8],
            ['day_of_week' => 3, 'is_rest_day' => false, 'time_in' => '08:00:00', 'time_out' => '17:00:00', 'break_minutes' => 60, 'required_hours' => 8],
            ['day_of_week' => 4, 'is_rest_day' => false, 'time_in' => '08:00:00', 'time_out' => '17:00:00', 'break_minutes' => 60, 'required_hours' => 8],
            ['day_of_week' => 5, 'is_rest_day' => false, 'time_in' => '08:00:00', 'time_out' => '17:00:00', 'break_minutes' => 60, 'required_hours' => 8],
            ['day_of_week' => 6, 'is_rest_day' => true, 'time_in' => null, 'time_out' => null, 'break_minutes' => 0, 'required_hours' => 0],
        ];

        foreach ($days as $d) {
            WorkScheduleDay::firstOrCreate(
                ['work_schedule_id' => $schedule->id, 'day_of_week' => $d['day_of_week']],
                $d,
            );
        }

        // 2026 PH holidays (baseline — HR adjusts annually as proclamations drop)
        $regular = [
            ['2026-01-01', "New Year's Day"],
            ['2026-04-09', 'Araw ng Kagitingan'],
            ['2026-04-02', 'Maundy Thursday'],     // approx — moves yearly
            ['2026-04-03', 'Good Friday'],         // approx
            ['2026-05-01', 'Labor Day'],
            ['2026-06-12', 'Independence Day'],
            ['2026-08-31', 'National Heroes Day'], // last Mon of Aug — placeholder
            ['2026-11-30', 'Bonifacio Day'],
            ['2026-12-25', 'Christmas Day'],
            ['2026-12-30', 'Rizal Day'],
        ];

        $special = [
            ['2026-02-17', 'Chinese New Year'],
            ['2026-02-25', 'EDSA Revolution Anniversary'],
            ['2026-04-04', 'Black Saturday'],
            ['2026-08-21', 'Ninoy Aquino Day'],
            ['2026-11-01', "All Saints' Day"],
            ['2026-12-08', 'Feast of the Immaculate Conception'],
            ['2026-12-24', 'Christmas Eve'],
            ['2026-12-31', "New Year's Eve"],
        ];

        foreach ($regular as [$date, $name]) {
            Holiday::firstOrCreate(
                ['company_id' => $company->id, 'holiday_date' => $date],
                ['name' => $name, 'type' => 'regular'],
            );
        }
        foreach ($special as [$date, $name]) {
            Holiday::firstOrCreate(
                ['company_id' => $company->id, 'holiday_date' => $date],
                ['name' => $name, 'type' => 'special_non_working'],
            );
        }
    }
}
