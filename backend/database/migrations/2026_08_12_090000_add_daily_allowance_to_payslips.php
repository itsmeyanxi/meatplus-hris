<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-day (e.g. meal) allowance paid on a payslip: the profile's daily_allowance
 * rate × the employee's days of attendance in the cutoff.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('daily_allowance', 12, 2)->default(0)->after('transportation_allowance');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn('daily_allowance');
        });
    }
};
