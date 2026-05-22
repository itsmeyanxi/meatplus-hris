<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_time_records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('work_date');

            $table->time('scheduled_in')->nullable();
            $table->time('scheduled_out')->nullable();
            $table->timestamp('actual_in')->nullable();
            $table->timestamp('actual_out')->nullable();

            $table->decimal('hours_worked', 5, 2)->default(0);
            $table->integer('late_minutes')->default(0);
            $table->integer('undertime_minutes')->default(0);
            $table->integer('overtime_minutes')->default(0);
            $table->integer('night_diff_minutes')->default(0);

            $table->string('holiday_type', 30)->nullable();
            $table->boolean('is_rest_day')->default(false);
            $table->boolean('is_absent')->default(false);
            $table->boolean('is_on_leave')->default(false);
            $table->unsignedBigInteger('leave_application_id')->nullable();

            $table->string('status', 20)->default('draft'); // draft | posted | locked
            $table->text('remarks')->nullable();

            $table->timestamps();

            $table->unique(['employee_id', 'work_date']);
            $table->index(['company_id', 'work_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_time_records');
    }
};
