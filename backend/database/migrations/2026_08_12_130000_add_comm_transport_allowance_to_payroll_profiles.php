<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Communication + Transportation allowances: monthly figures monetized across the
 * two semi-monthly cutoffs (each paid at monthly/2), added to pay like the
 * existing allowance / de-minimis. Stored on the payroll profile.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_payroll_profiles', function (Blueprint $table) {
            $table->decimal('communication_allowance', 12, 2)->default(0)->after('de_minimis');
            $table->decimal('transportation_allowance', 12, 2)->default(0)->after('communication_allowance');
        });
    }

    public function down(): void
    {
        Schema::table('employee_payroll_profiles', function (Blueprint $table) {
            $table->dropColumn(['communication_allowance', 'transportation_allowance']);
        });
    }
};
