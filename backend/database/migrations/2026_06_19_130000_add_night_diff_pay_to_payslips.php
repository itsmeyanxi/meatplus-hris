<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->unsignedInteger('night_diff_minutes')->default(0)->after('overtime_minutes');
            $table->decimal('night_diff_pay', 12, 2)->default(0)->after('overtime_pay');
        });
    }

    public function down(): void
    {
        Schema::table('payslips', function (Blueprint $table) {
            $table->dropColumn(['night_diff_minutes', 'night_diff_pay']);
        });
    }
};
