<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_compensations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->decimal('basic_monthly', 12, 2);   // monthly basic salary
            $table->decimal('allowance_monthly', 12, 2)->default(0); // non-taxable allowance
            $table->date('effective_from')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique('employee_id'); // one current compensation per employee
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_compensations');
    }
};
