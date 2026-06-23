<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            // Testing aid: anchor incoming punches to the server clock instead of
            // the device's reported timestamp (useful when the terminal clock is off).
            $table->boolean('use_server_time')->default(false)->after('timezone');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            $table->dropColumn('use_server_time');
        });
    }
};
