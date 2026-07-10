<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_benefits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();

            $table->string('type', 80);              // HMO, Life Insurance, Retirement…
            $table->boolean('is_active')->default(true);
            $table->date('effective_date')->nullable();
            $table->date('enrollment_date')->nullable();
            $table->string('plan', 150)->nullable();
            $table->string('beneficiary', 150)->nullable();
            $table->string('payment_type', 30)->nullable(); // employer | employee | shared
            $table->string('notes', 500)->nullable();

            $table->timestamps();

            $table->index(['employee_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_benefits');
    }
};
