<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_audit_log', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->string('event', 50);
            $table->string('subject_type', 100);
            $table->unsignedBigInteger('subject_id');
            $table->unsignedBigInteger('causer_user_id')->nullable();
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->json('diff')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('occurred_at')->useCurrent();

            $table->index(['subject_type', 'subject_id']);
            $table->index(['company_id', 'occurred_at']);
            $table->index(['event', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_audit_log');
    }
};
