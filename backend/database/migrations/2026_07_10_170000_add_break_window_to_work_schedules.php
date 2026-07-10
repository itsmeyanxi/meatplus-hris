<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The reference form captures a break *window* (start and end) per day, while
     * this app stores only `break_minutes`. Keep break_minutes -- DtrComputer reads
     * it -- and derive it from the window when one is given.
     *
     * `hours_per_day` is the reference's "No of hours to work including break hours".
     */
    public function up(): void
    {
        Schema::table('work_schedule_days', function (Blueprint $table) {
            $table->time('break_start')->nullable()->after('time_out');
            $table->time('break_end')->nullable()->after('break_start');
        });

        Schema::table('work_schedules', function (Blueprint $table) {
            $table->decimal('hours_per_day', 4, 2)->nullable()->after('weekly_workdays');
        });
    }

    public function down(): void
    {
        Schema::table('work_schedule_days', function (Blueprint $table) {
            $table->dropColumn(['break_start', 'break_end']);
        });

        Schema::table('work_schedules', function (Blueprint $table) {
            $table->dropColumn('hours_per_day');
        });
    }
};
