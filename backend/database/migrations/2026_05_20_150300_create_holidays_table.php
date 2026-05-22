<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('holidays', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained()->cascadeOnDelete();
            $table->date('holiday_date');
            $table->string('name', 150);
            $table->string('type', 30); // regular | special_non_working | special_working | local
            $table->foreignId('applicable_branch_id')->nullable()
                ->constrained('branches')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'holiday_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('holidays');
    }
};
