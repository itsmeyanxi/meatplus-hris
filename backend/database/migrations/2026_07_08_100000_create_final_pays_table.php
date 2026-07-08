<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('final_pays', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained('companies');
            $table->foreignId('employee_id')->constrained('employees');
            $table->foreignId('computed_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->date('last_working_day');
            $table->string('separation_type', 50); // resigned|terminated_just|terminated_authorized|end_of_contract|retired|deceased

            // Basis
            $table->decimal('basic_monthly', 12, 2)->default(0);
            $table->decimal('daily_rate', 12, 4)->default(0);
            $table->unsignedSmallInteger('days_worked_last_period')->default(0);
            $table->decimal('years_of_service', 8, 2)->default(0);

            // Earnings
            $table->decimal('unpaid_salary', 12, 2)->default(0);
            $table->decimal('thirteenth_month_pay', 12, 2)->default(0);
            $table->decimal('unused_leave_days', 8, 2)->default(0);
            $table->decimal('leave_conversion', 12, 2)->default(0);
            $table->decimal('separation_pay', 12, 2)->default(0);
            $table->decimal('other_earnings', 12, 2)->default(0);
            $table->string('other_earnings_note')->nullable();

            // Deductions
            $table->decimal('sss_deduction', 12, 2)->default(0);
            $table->decimal('philhealth_deduction', 12, 2)->default(0);
            $table->decimal('pagibig_deduction', 12, 2)->default(0);
            $table->decimal('tax_deduction', 12, 2)->default(0);
            $table->decimal('other_deductions', 12, 2)->default(0);
            $table->string('other_deductions_note')->nullable();

            // Totals
            $table->decimal('total_gross', 12, 2)->default(0);
            $table->decimal('total_deductions_amount', 12, 2)->default(0);
            $table->decimal('net_final_pay', 12, 2)->default(0);

            $table->text('notes')->nullable();
            $table->string('status', 20)->default('draft'); // draft | finalized

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('final_pays');
    }
};
