<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Photos live in the database, not on disk.
     *
     * The API runs both on Render (ephemeral filesystem, wiped on every deploy)
     * and on the office PC. Those two have separate disks, so a file written by
     * one is invisible to the other. The database is the only storage both share.
     *
     * `data` holds base64 rather than a binary column so the same migration works
     * on Postgres (bytea) and MySQL (blob) without driver-specific handling.
     */
    public function up(): void
    {
        Schema::create('employee_photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('mime', 40);
            $table->unsignedInteger('size_bytes');
            $table->longText('data');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_photos');
    }
};
