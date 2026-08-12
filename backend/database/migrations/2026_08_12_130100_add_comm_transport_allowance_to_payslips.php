<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Communication + Transportation allowances as first-class payslip earnings. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->decimal('communication_allowance', 12, 2)->default(0)->after('de_minimis');
            $table->decimal('transportation_allowance', 12, 2)->default(0)->after('communication_allowance');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['communication_allowance', 'transportation_allowance']);
        });
    }
};
