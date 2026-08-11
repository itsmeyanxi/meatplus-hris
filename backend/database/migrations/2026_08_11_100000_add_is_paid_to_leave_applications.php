<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-application paid vs unpaid flag chosen at filing time. It's a label: it
 * records whether the filer intends this leave to be paid ("paid leave") or
 * not ("just leave") and drives the leave report's With/Without-Pay split. It
 * does NOT change DTR pay or credit logic — that stays driven by the leave
 * type's is_paid. Nullable so rows predating this (and imports carrying an
 * explicit with/without-pay split) fall back to the leave type / that split.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_applications', function (Blueprint $table) {
            $table->boolean('is_paid')->nullable()->after('half_day');
        });
    }

    public function down(): void
    {
        Schema::table('leave_applications', function (Blueprint $table) {
            $table->dropColumn('is_paid');
        });
    }
};
