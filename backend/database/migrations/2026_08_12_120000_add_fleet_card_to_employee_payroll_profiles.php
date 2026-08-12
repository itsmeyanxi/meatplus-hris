<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Fleet Card: a per-employee benefit amount that is TRACKED only — it is
     * deliberately never read by PayrollComputer, so it does not affect gross,
     * taxable income, or net pay. Sits next to de_minimis (which IS paid).
     */
    public function up(): void
    {
        Schema::table('employee_payroll_profiles', function (Blueprint $table) {
            $table->decimal('fleet_card', 12, 2)->default(0)->after('de_minimis');
        });
    }

    public function down(): void
    {
        Schema::table('employee_payroll_profiles', function (Blueprint $table) {
            $table->dropColumn('fleet_card');
        });
    }
};
