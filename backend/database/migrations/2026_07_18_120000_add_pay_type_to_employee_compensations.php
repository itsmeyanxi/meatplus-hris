<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_compensations', function (Blueprint $table) {
            // 'monthly' → paid basic_monthly (÷2 per semi-monthly cutoff).
            // 'daily'   → paid daily_rate × days worked in the cutoff.
            $table->string('pay_type', 10)->default('monthly')->after('basic_monthly');
            $table->decimal('daily_rate', 15, 4)->nullable()->after('pay_type');
        });
    }

    public function down(): void
    {
        Schema::table('employee_compensations', function (Blueprint $table) {
            $table->dropColumn(['pay_type', 'daily_rate']);
        });
    }
};
