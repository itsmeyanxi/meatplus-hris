<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Official half-day: an HR shift adjustment can be flagged is_half_day (the
 * employee officially works one half of the day). Each DTR carries a day_fraction
 * (1.00 normally, 0.50 for an official half-day) so payroll pays only the worked
 * portion — no leave used, not counted absent.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shift_adjustments', function (Blueprint $table) {
            $table->boolean('is_half_day')->default(false)->after('is_rest_day');
        });
        Schema::table('daily_time_records', function (Blueprint $table) {
            $table->decimal('day_fraction', 3, 2)->default(1.00)->after('hours_worked');
        });
    }

    public function down(): void
    {
        Schema::table('shift_adjustments', function (Blueprint $table) {
            $table->dropColumn('is_half_day');
        });
        Schema::table('daily_time_records', function (Blueprint $table) {
            $table->dropColumn('day_fraction');
        });
    }
};
