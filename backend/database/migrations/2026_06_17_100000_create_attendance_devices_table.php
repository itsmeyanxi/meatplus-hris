<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_devices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('branch_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('vendor', 30)->default('hikvision'); // future: zkteco, etc.
            $table->string('serial_no', 100)->nullable();
            $table->string('ip_address', 45);
            $table->unsignedSmallInteger('port')->default(80); // ISAPI HTTP port
            $table->string('username');
            $table->text('password'); // encrypted at rest (model cast)
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamp('last_event_at')->nullable(); // newest device-event time ingested
            $table->timestamps();

            $table->index(['company_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_devices');
    }
};
