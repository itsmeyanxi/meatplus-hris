<?php

namespace App\Http\Requests\Payroll;

use App\Domain\Payroll\Models\PayrollRun;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class StorePayrollRunRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('payroll.run') ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'pay_group' => ['nullable', 'in:confidential,non_confidential'],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'pay_date' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * Reject a run whose period overlaps an existing run for the SAME set of
     * employees — otherwise the same cutoff could be paid twice (double salary +
     * loan balances drawn down twice on post). A null pay_group covers everyone,
     * so it conflicts with any existing run in the period; confidential and
     * non_confidential are disjoint sets and only conflict with their own group
     * or an everyone (null) run.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            if ($validator->errors()->isNotEmpty()) {
                return; // dates weren't valid; skip the overlap check
            }

            $group = $this->input('pay_group'); // null = everyone
            $conflict = PayrollRun::query() // CompanyScope limits this to the active company
                ->where('period_start', '<=', $this->input('period_end'))
                ->where('period_end', '>=', $this->input('period_start'))
                ->when($group !== null, fn ($q) => $q->where(
                    fn ($w) => $w->whereNull('pay_group')->orWhere('pay_group', $group)
                ))
                ->first();

            if ($conflict) {
                $validator->errors()->add(
                    'period_start',
                    "A payroll run (\"{$conflict->name}\", {$conflict->status}) already covers this period for these employees. Delete or edit it instead of creating a duplicate.",
                );
            }
        });
    }
}
