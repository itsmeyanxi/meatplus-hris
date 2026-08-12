<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HR-defined recurring pay benefits/allowances that add to an employee's pay each
 * cutoff. Unlike the fixed allowance columns, HR names these and sets the amount
 * and cadence themselves (per month, per cutoff, or per day of attendance).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_pay_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('label', 100);
            $table->decimal('amount', 12, 2)->default(0);
            // monthly = halved per cutoff · per_cutoff = flat each run · per_day = × days present
            $table->string('cadence', 20)->default('monthly');
            $table->boolean('is_active')->default(true);
            $table->string('notes', 255)->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_pay_items');
    }
};
