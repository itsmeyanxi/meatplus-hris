<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Staging for biometric punches whose device ID (PIN) does not (yet) map to any
 * HRIS employee — instead of silently dropping them. When an employee is later
 * added, or their biometric_user_id is set to that PIN, the reclaimer converts the
 * staged rows into real time_logs. So no attendance is ever lost, even when the
 * HRIS has not yet been told about a re-enrolled or newly-added device user.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unmatched_punches', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('device_key', 50)->nullable();   // mirrors time_logs.device_id
            $table->string('pin', 50);                       // the on-device User ID that was sent
            $table->dateTime('logged_at');
            $table->string('status', 10)->nullable();        // device attendance status code
            $table->string('verify', 20)->nullable();
            $table->text('raw')->nullable();
            $table->string('source', 20)->default('biometric');
            $table->string('source_event_id')->nullable();   // idempotency; carried to time_logs
            $table->timestamp('reclaimed_at')->nullable();
            $table->timestamps();

            $table->unique(['device_key', 'source_event_id']);
            $table->index(['company_id', 'pin']);
            $table->index('reclaimed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unmatched_punches');
    }
};
