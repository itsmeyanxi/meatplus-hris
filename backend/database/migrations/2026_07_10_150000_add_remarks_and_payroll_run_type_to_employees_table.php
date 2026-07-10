<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * "Other Information" from the reference form.
     *
     * Biometric ID is not added here: `biometric_user_id` already exists on
     * employees and is what the ZKTeco ADMS receiver matches punches against.
     */
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('payroll_run_type', 20)->nullable()->after('billability');
            $table->string('remarks', 300)->nullable()->after('separation_reason');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['payroll_run_type', 'remarks']);
        });
    }
};
