<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether an employee must clock in/out. Most do (default true). Turn it OFF for
 * staff who are always present but don't punch — supervisors, managers, office
 * staff — so they are never flagged absent and are credited their scheduled hours
 * automatically.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->boolean('time_in_out_required')->default(true)->after('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('time_in_out_required');
        });
    }
};
