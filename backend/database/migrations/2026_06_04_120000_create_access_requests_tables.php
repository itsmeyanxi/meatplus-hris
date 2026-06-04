<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('access_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            // Section A — Request information
            $table->string('request_type', 30); // new_access | access_modification | access_removal | temporary_access
            $table->date('effective_date');
            $table->string('ticket_number')->nullable();

            // Section B — Employee information
            $table->string('employee_name');
            $table->string('employee_id_number');
            $table->string('position');
            $table->string('department');
            $table->string('employment_status', 30); // regular | probationary | contractual | ojt_intern
            $table->string('immediate_supervisor');
            $table->string('company_email');
            $table->string('contact_number');

            // Section D — Justification
            $table->text('justification');

            // Workflow
            $table->string('status', 20)->default('pending'); // pending | approved | rejected
            $table->string('current_stage', 20)->default('supervisor'); // supervisor | hr | it | done
            $table->timestamp('submitted_at')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_id', 'status']);
            $table->index(['company_id', 'current_stage']);
        });

        // Section C — Requested module access (one row per module with selections)
        Schema::create('access_request_modules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('access_request_id')->constrained()->cascadeOnDelete();
            $table->string('module', 40); // ess | timekeeping | payroll | ...
            $table->boolean('view')->default(false);
            $table->boolean('user')->default(false);
            $table->boolean('approver')->default(false);
            $table->boolean('admin')->default(false);
            $table->timestamps();

            $table->unique(['access_request_id', 'module']);
        });

        // Supervisor -> HR -> IT approval steps (3 rows per request)
        Schema::create('access_request_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('access_request_id')->constrained()->cascadeOnDelete();
            $table->string('stage', 20); // supervisor | hr | it
            $table->unsignedTinyInteger('sequence'); // 1 | 2 | 3
            $table->string('status', 20)->default('pending'); // pending | approved | rejected
            $table->foreignId('decided_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamps();

            $table->unique(['access_request_id', 'stage']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('access_request_approvals');
        Schema::dropIfExists('access_request_modules');
        Schema::dropIfExists('access_requests');
    }
};
