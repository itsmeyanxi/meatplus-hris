<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The employee's schedule type, which drives how attendance is judged:
 *   regular   — punches; late & absence tracked
 *   flexible  — punches; absence tracked but NO late penalty
 *   shifting  — punches; late & absence tracked (rotating shifts)
 *   part_time — punches; tracked; paid by the hour
 *   exempted  — no punch; always present, credited scheduled hours
 *   field     — no punch; always present (field personnel)
 *
 * time_in_out_required is kept in sync from this (false for exempted/field).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('schedule_type', 20)->default('regular')->after('time_in_out_required');
        });

        // Existing punch-exempt employees become 'exempted'.
        DB::table('employees')->where('time_in_out_required', false)->update(['schedule_type' => 'exempted']);
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn('schedule_type');
        });
    }
};
