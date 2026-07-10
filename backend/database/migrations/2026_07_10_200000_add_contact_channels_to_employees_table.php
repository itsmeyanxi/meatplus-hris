<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Contact channels from the reference form.
     *
     * The primary contact number is `mobile`, which already exists. `phone_home`
     * also exists and stays; the trunk line is the office landline, a different
     * thing, so it gets its own column alongside its extension PIN.
     */
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('local_trunk_line', 50)->nullable()->after('phone_home');
            $table->string('trunk_pin', 20)->nullable()->after('local_trunk_line');
            $table->string('skype_id', 100)->nullable()->after('trunk_pin');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->dropColumn(['local_trunk_line', 'trunk_pin', 'skype_id']);
        });
    }
};
