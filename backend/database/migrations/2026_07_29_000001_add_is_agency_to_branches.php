<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks which branches are manpower "agencies" (used by companies like PASEI
 * whose branches are really agencies). The Agencies page shows only flagged
 * branches when any exist; ordinary branch-based companies leave this false and
 * keep showing all branches.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->boolean('is_agency')->default(false)->after('is_head_office');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('is_agency');
        });
    }
};
