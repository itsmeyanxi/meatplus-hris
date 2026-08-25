<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drop the per-device alert bookkeeping added a few hours earlier the same day.
 *
 * It existed to stop a per-terminal offline alert repeating inside 24 hours. Alerting
 * per terminal is now gone — biometric problems are reported once a day, together, by
 * BiometricDigestBuilder — and a daily digest is its own cooldown, so these two
 * columns track nothing. `last_seen_at` stays: it is the heartbeat everything else is
 * judged on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            $table->dropColumn(['silence_notified_at', 'silence_emailed_at']);
        });
    }

    public function down(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            $table->timestamp('silence_notified_at')->nullable()->after('last_seen_at');
            $table->timestamp('silence_emailed_at')->nullable()->after('silence_notified_at');
        });
    }
};
