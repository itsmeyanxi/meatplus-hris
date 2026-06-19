<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('time_logs', function (Blueprint $table) {
            // Device-side event identifier (Hikvision AcsEvent serialNo). Used to make
            // re-pulling the same window idempotent — one punch per device event.
            $table->string('source_event_id', 100)->nullable()->after('device_id');
            $table->unique(['device_id', 'source_event_id'], 'time_logs_device_event_unique');
        });
    }

    public function down(): void
    {
        Schema::table('time_logs', function (Blueprint $table) {
            $table->dropUnique('time_logs_device_event_unique');
            $table->dropColumn('source_event_id');
        });
    }
};
