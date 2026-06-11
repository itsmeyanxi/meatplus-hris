<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shift_adjustments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->date('work_date');
            $table->boolean('is_rest_day')->default(false);
            $table->time('time_in')->nullable();
            $table->time('time_out')->nullable();
            $table->unsignedSmallInteger('break_minutes')->default(60);
            $table->string('reason')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['employee_id', 'work_date']);
        });

        Schema::table('daily_time_records', function (Blueprint $table) {
            $table->boolean('is_adjusted')->default(false)->after('is_on_leave');
        });
    }

    public function down(): void
    {
        Schema::table('daily_time_records', function (Blueprint $table) {
            $table->dropColumn('is_adjusted');
        });
        Schema::dropIfExists('shift_adjustments');
    }
};
