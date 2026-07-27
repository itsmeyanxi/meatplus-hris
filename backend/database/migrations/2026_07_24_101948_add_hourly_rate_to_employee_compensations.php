<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Part-timers are paid for the hours they actually work, which neither existing
 * model expresses — monthly and daily both pay a whole day for any attendance.
 * Adds the rate backing the new 'hourly' pay type.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_compensations', function (Blueprint $table) {
            $table->decimal('hourly_rate', 12, 4)->nullable()->after('daily_rate');
        });
    }

    public function down(): void
    {
        Schema::table('employee_compensations', function (Blueprint $table) {
            $table->dropColumn('hourly_rate');
        });
    }
};
