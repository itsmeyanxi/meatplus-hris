<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Give each terminal a real HEARTBEAT, separate from its punch activity.
 *
 * `last_event_at` only advances when a device pushes ATTLOG data, so a perfectly
 * healthy terminal at a quiet site looks identical to one that has been unplugged
 * for a week. The ZKTeco units poll /iclock/getrequest every ~30 seconds around the
 * clock, so `last_seen_at` — stamped on ANY iclock request — is the honest answer to
 * "is this thing still connected", and the only sound basis for a down alert.
 *
 * The two notified_at columns keep the alert from repeating: one per delivery
 * channel, because email is restricted to Mondays and Fridays while the in-app bell
 * fires as soon as the outage is detected. Both are cleared when a device recovers,
 * so the NEXT outage alerts fresh.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            $table->timestamp('last_seen_at')->nullable()->after('last_event_at');
            $table->timestamp('silence_notified_at')->nullable()->after('last_seen_at');
            $table->timestamp('silence_emailed_at')->nullable()->after('silence_notified_at');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_devices', function (Blueprint $table) {
            $table->dropColumn(['last_seen_at', 'silence_notified_at', 'silence_emailed_at']);
        });
    }
};
