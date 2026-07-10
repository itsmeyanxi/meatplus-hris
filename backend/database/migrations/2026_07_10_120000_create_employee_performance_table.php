<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_performance', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();

            $table->date('review_period_start');
            $table->date('review_period_end');

            // 1.00 - 5.00, the scale used on the paper appraisal form.
            $table->decimal('rating', 3, 2)->nullable();
            $table->string('rating_label', 40)->nullable();

            $table->foreignId('reviewer_employee_id')->nullable()
                ->constrained('employees')->nullOnDelete();

            $table->text('strengths')->nullable();
            $table->text('areas_for_improvement')->nullable();
            $table->text('remarks')->nullable();
            $table->date('next_review_date')->nullable();

            $table->timestamps();

            $table->index(['employee_id', 'review_period_end']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_performance');
    }
};
