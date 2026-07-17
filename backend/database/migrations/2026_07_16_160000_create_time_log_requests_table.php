<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Staging area for admin-uploaded time logs. Rows sit here as PENDING and
        // do NOT affect DTR/attendance until an approver approves them — approval
        // writes the real punches into time_logs and recomputes that day.
        Schema::create('time_log_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->uuid('batch_id')->index(); // groups one upload
            $table->date('work_date');
            $table->time('time_in')->nullable();
            $table->time('time_out')->nullable();
            $table->string('status', 20)->default('pending'); // pending | approved | rejected
            $table->string('note')->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_remarks')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'status']);
            $table->index(['employee_id', 'work_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('time_log_requests');
    }
};
