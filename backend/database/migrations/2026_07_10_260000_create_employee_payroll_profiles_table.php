<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-employee payroll settings from the reference's Current Payroll Information.
     *
     * Deliberately NOT stored here:
     *   - Basic Salary and allowance -> employee_compensations (the salary history).
     *     Duplicating them would give payroll two sources of truth for what to pay.
     *   - Bank details -> employee_bank_accounts, which already exists.
     *
     * The contribution columns record an INTENT. PayrollComputer today always asks
     * StatutoryCalculator to derive SSS / PhilHealth / Pag-IBIG from basic pay, which
     * is the "Let System Decide" behaviour. A 'fixed' mode is stored but not yet
     * honoured — wiring it changes what people are paid and belongs in its own change.
     */
    public function up(): void
    {
        Schema::create('employee_payroll_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_id')->unique()->constrained()->cascadeOnDelete();

            // Employment details
            $table->unsignedSmallInteger('work_days_per_year')->nullable();
            $table->string('cost_center', 100)->nullable();
            $table->boolean('is_rohq')->default(false);   // expanded withholding tax of 15%

            // Compensation and benefits
            $table->boolean('is_minimum_wage_earner')->default(false);
            $table->decimal('daily_allowance', 12, 2)->default(0);
            $table->decimal('de_minimis', 12, 2)->default(0);
            $table->string('pay_group', 60)->nullable();
            $table->decimal('consultant_percent_tax', 5, 2)->nullable(); // null = not a consultant
            $table->decimal('work_hours_per_day', 4, 2)->nullable();
            $table->string('ot_computation_table', 60)->nullable();

            // Government contributions: 'system' (derive) or 'fixed'
            $table->string('sss_contribution_mode', 10)->default('system');
            $table->decimal('sss_fixed_amount', 12, 2)->nullable();
            $table->string('hdmf_contribution_mode', 10)->default('system');
            $table->decimal('hdmf_additional', 12, 2)->default(0);
            $table->string('philhealth_contribution_mode', 10)->default('system');
            $table->decimal('philhealth_fixed_amount', 12, 2)->nullable();

            // Previous employment (from last employer, for year-end tax annualisation)
            $table->boolean('has_previous_employment')->default(false);
            $table->decimal('prev_nontax_13th_month', 14, 2)->default(0);
            $table->decimal('prev_nontax_other_bonus', 14, 2)->default(0);
            $table->decimal('prev_nontax_salaries', 14, 2)->default(0);
            $table->decimal('prev_13th_month', 14, 2)->default(0);
            $table->decimal('prev_other_bonus', 14, 2)->default(0);
            $table->decimal('prev_taxable_gross', 14, 2)->default(0);
            $table->decimal('prev_tax_withheld', 14, 2)->default(0);
            $table->decimal('prev_government_deductions', 14, 2)->default(0);
            $table->decimal('prev_de_minimis', 14, 2)->default(0);
            $table->decimal('prev_taxable_compensation', 14, 2)->default(0);
            $table->decimal('prev_monetized_leave', 14, 2)->default(0);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_payroll_profiles');
    }
};
