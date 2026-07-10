<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * passport_no is `text` because it is encrypted at rest like tin/sss/philhealth/
     * pagibig -- ciphertext is far longer than the plain value. rdo_code is a plain
     * BIR district code and is not sensitive.
     */
    public function up(): void
    {
        Schema::table('employee_government_ids', function (Blueprint $table) {
            $table->text('passport_no')->nullable()->after('prc_expiry');
            $table->string('rdo_code', 10)->nullable()->after('passport_no');
        });
    }

    public function down(): void
    {
        Schema::table('employee_government_ids', function (Blueprint $table) {
            $table->dropColumn(['passport_no', 'rdo_code']);
        });
    }
};
