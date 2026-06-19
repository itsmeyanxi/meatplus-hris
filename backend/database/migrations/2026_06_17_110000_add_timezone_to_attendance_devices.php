<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            // The terminal's local timezone. ISAPI matches its own wall-clock, so the
            // query window and stored punches are built in this zone (not app UTC).
            $table->string('timezone', 64)->default('Asia/Manila')->after('port');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            $table->dropColumn('timezone');
        });
    }
};
