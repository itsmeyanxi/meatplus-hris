<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class DependentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    /**
     * The form sends name parts; existing callers send full_name. Accept either,
     * composing full_name from the parts so the column reporting reads is never blank.
     */
    protected function prepareForValidation(): void
    {
        if ($this->filled('full_name')) {
            return;
        }

        $parts = array_filter([
            $this->input('first_name'),
            $this->input('middle_name'),
            $this->input('last_name'),
        ]);

        if ($parts) {
            $this->merge(['full_name' => implode(' ', $parts)]);
        }
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'first_name' => ['nullable', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'full_name' => [$req, 'string', 'max:200'],
            'relationship' => [$req, 'string', 'in:spouse,child,parent,sibling,grandparent,other'],
            'birth_date' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', 'string', 'in:male,female,other'],
            'is_minor' => ['sometimes', 'boolean'],
            'is_pwd' => ['sometimes', 'boolean'],
            'is_qualified_for_tax_exemption' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'full_name.required' => 'A dependent needs at least a first or last name.',
        ];
    }
}
