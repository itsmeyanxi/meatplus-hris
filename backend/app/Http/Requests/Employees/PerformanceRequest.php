<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class PerformanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'review_period_start' => [$req, 'date'],
            'review_period_end' => [$req, 'date', 'after_or_equal:review_period_start'],
            'rating' => ['nullable', 'numeric', 'min:1', 'max:5'],
            'rating_label' => ['nullable', 'string', 'max:40'],
            'reviewer_employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'strengths' => ['nullable', 'string', 'max:2000'],
            'areas_for_improvement' => ['nullable', 'string', 'max:2000'],
            'remarks' => ['nullable', 'string', 'max:2000'],
            'next_review_date' => ['nullable', 'date', 'after:review_period_end'],
        ];
    }
}
