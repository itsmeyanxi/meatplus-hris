<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_assets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('item');
            $table->string('category')->nullable();
            $table->string('condition')->nullable();
            $table->decimal('purchase_price', 12, 2)->nullable();
            $table->string('serial_number')->nullable();
            $table->date('acquired_date')->nullable();
            $table->date('date_issued')->nullable();
            $table->date('date_returned')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('employee_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_assets');
    }
};
