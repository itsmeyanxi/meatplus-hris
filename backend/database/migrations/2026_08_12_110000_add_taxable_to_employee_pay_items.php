<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether an HR-defined benefit is taxable. Non-taxable (default) is added to pay
 * but not to the withholding-tax base; taxable adds to both.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_pay_items', function (Blueprint $table) {
            $table->boolean('taxable')->default(false)->after('cadence');
        });
    }

    public function down(): void
    {
        Schema::table('employee_pay_items', function (Blueprint $table) {
            $table->dropColumn('taxable');
        });
    }
};
