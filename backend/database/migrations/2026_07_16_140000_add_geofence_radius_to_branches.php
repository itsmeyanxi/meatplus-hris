<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            // Allowed distance (metres) between a web punch and the branch pin before
            // it's flagged as "outside". Null = use the app default (GeofenceService).
            $table->unsignedSmallInteger('geofence_radius_m')->nullable()->after('longitude');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('geofence_radius_m');
        });
    }
};
