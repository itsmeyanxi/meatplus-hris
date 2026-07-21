<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            // A one-shot ADMS command handed to the device on its next getrequest
            // poll (e.g. DATA QUERY ATTLOG to re-upload stored history), then cleared.
            $table->text('pending_command')->nullable()->after('last_event_at');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            $table->dropColumn('pending_command');
        });
    }
};
