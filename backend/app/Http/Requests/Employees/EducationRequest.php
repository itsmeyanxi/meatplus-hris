<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class EducationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'level' => [$req, 'string', 'in:elementary,secondary,vocational,tertiary,graduate'],
            'school' => [$req, 'string', 'max:200'],
            'degree' => ['nullable', 'string', 'max:200'],
            'year_from' => ['nullable', 'integer', 'min:1900', 'max:'.(date('Y') + 5)],
            // `gte:year_from` compares against null when year_from is absent, which
            // rejects an entry that gives only the end year. Apply it only when
            // there is something to compare against.
            'year_to' => array_filter([
                'nullable', 'integer', 'min:1900', 'max:'.(date('Y') + 10),
                $this->filled('year_from') ? 'gte:year_from' : null,
            ]),
            'honors' => ['nullable', 'string', 'max:200'],
        ];
    }
}
