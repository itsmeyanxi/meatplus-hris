<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Detected employee-data problems worth HR's attention — missing payroll/attendance
 * essentials (employment type, compensation, position, biometric id, …) and
 * "silent attendance" (a scheduled, active employee with no punches for weeks, the
 * classic broken-enrollment signal). One open row per (employee, category);
 * auto-resolves when the data is fixed, so the list always reflects reality. HR can
 * `ignored` a row for an intentional gap (e.g. an office manager who never scans).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_data_issues', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('employee_id');
            $table->string('category', 40);          // e.g. missing_compensation, attendance_silent
            $table->string('severity', 10)->default('medium'); // high | medium | low
            $table->text('detail')->nullable();
            $table->timestamp('detected_at')->nullable();
            $table->timestamp('resolved_at')->nullable();     // auto-set when no longer detected
            $table->boolean('ignored')->default(false);       // HR dismissed an intentional gap
            $table->timestamp('first_notified_at')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'category']);
            $table->index(['company_id', 'resolved_at']);
            $table->index(['severity', 'resolved_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_data_issues');
    }
};
