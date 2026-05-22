<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_dependents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('full_name', 200);
            $table->string('relationship', 50);
            $table->date('birth_date')->nullable();
            $table->boolean('is_minor')->default(false);
            $table->boolean('is_pwd')->default(false);
            $table->boolean('is_qualified_for_tax_exemption')->default(false);
            $table->timestamps();

            $table->index('employee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_dependents');
    }
};
