<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Detected biometric-mapping problems worth an HR alert — chiefly a "PIN reuse
 * collision": a device PIN that once belonged to an employee (their old employee
 * number) has been re-enrolled on the terminal for a DIFFERENT person, so that
 * person's punches are being credited to the original employee via the
 * employee-number fallback. One open row per (employee, pin, kind); resolved_at is
 * stamped once the collision stops appearing so the same issue is not re-notified.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('biometric_anomalies', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('employee_id');       // who the punches are (mis)attributed to
            $table->string('pin', 50);                       // the device PIN involved
            $table->string('device_key', 50)->nullable();
            $table->string('kind', 40)->default('pin_reuse_collision');
            $table->string('device_name')->nullable();       // name the DEVICE has enrolled under this PIN
            $table->unsignedInteger('punches')->default(0);  // affected punches in the detection window
            $table->text('detail')->nullable();
            $table->timestamp('detected_at')->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'pin', 'kind']);
            $table->index(['company_id', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('biometric_anomalies');
    }
};
