<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('work_schedule_days', function (Blueprint $table) {
            $table->id();
            $table->foreignId('work_schedule_id')->constrained()->cascadeOnDelete();
            $table->smallInteger('day_of_week'); // 0=Sun..6=Sat
            $table->boolean('is_rest_day')->default(false);
            $table->time('time_in')->nullable();
            $table->time('time_out')->nullable();
            $table->smallInteger('break_minutes')->default(60);
            $table->decimal('required_hours', 5, 2)->default(0);
            $table->timestamps();

            $table->unique(['work_schedule_id', 'day_of_week']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('work_schedule_days');
    }
};
