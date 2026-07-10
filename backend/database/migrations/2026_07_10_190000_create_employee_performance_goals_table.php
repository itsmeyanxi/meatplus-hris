<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Performance *goals* — what the reference form captures on registration.
     *
     * Distinct from `employee_performance`, which holds a completed appraisal
     * (review period, rating, reviewer). A goal is forward-looking: what the
     * employee is expected to achieve, by when, and the feedback against it.
     */
    public function up(): void
    {
        Schema::create('employee_performance_goals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('goal', 500);
            $table->date('due_date')->nullable();
            $table->text('feedback')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'due_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_performance_goals');
    }
};
