<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Holiday and rest-day premium pay as first-class payslip columns, so the
 * Philippine holiday/rest-day premiums the PayrollComputer now applies are
 * visible in the payslip, the report export and remittance summaries.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('holiday_pay', 12, 2)->default(0)->after('night_diff_pay');
            $table->decimal('rest_day_pay', 12, 2)->default(0)->after('holiday_pay');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['holiday_pay', 'rest_day_pay']);
        });
    }
};
