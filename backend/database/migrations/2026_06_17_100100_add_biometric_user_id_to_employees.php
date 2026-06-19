<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // The "Employee No." enrolled on the biometric terminal. When null, the
            // sync falls back to matching the device person ID against employee_no.
            $table->string('biometric_user_id', 50)->nullable()->after('employee_no');
            $table->index(['company_id', 'biometric_user_id']);
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'biometric_user_id']);
            $table->dropColumn('biometric_user_id');
        });
    }
};
