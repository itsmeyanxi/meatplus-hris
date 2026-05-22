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
            'year_to' => ['nullable', 'integer', 'min:1900', 'max:'.(date('Y') + 10),
                'gte:year_from'],
            'honors' => ['nullable', 'string', 'max:200'],
        ];
    }
}
