<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            // A "project crew" is a branch used to group project-based workers into
            // operational crews (BLAST, ICE, CUTTER, …) — the same idea as is_agency,
            // but for internal project crews rather than manpower agencies. Kept out of
            // the organic employee/attendance lists and shown on their own Crews board.
            $table->boolean('is_project_crew')->default(false)->after('is_agency');
        });
    }

    public function down(): void
    {
        Schema::table('branches', function (Blueprint $table) {
            $table->dropColumn('is_project_crew');
        });
    }
};
