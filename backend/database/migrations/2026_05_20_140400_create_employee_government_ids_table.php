<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_government_ids', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->unique()->constrained()->cascadeOnDelete();
            $table->text('tin')->nullable();
            $table->text('sss_no')->nullable();
            $table->text('philhealth_no')->nullable();
            $table->text('pagibig_no')->nullable();
            $table->string('prc_no', 50)->nullable();
            $table->date('prc_expiry')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_government_ids');
    }
};
