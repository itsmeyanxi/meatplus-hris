<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('code', 20);
            $table->string('name');
            $table->decimal('default_credits_per_year', 6, 2)->default(0);
            $table->boolean('is_paid')->default(true);
            $table->boolean('is_convertible_to_cash')->default(false);
            $table->boolean('requires_attachment')->default(false);
            $table->smallInteger('min_days_filing_lead')->default(0);
            $table->smallInteger('max_consecutive_days')->nullable();
            $table->string('gender_restriction', 10)->nullable(); // male | female | null
            $table->string('accrual_method', 20)->default('annual'); // annual | monthly | none
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['company_id', 'code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_types');
    }
};
