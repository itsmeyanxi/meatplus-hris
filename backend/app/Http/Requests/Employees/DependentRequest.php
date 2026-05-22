<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class DependentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'full_name' => [$req, 'string', 'max:200'],
            'relationship' => [$req, 'string', 'in:spouse,child,parent,sibling,grandparent,other'],
            'birth_date' => ['nullable', 'date', 'before:today'],
            'is_minor' => ['sometimes', 'boolean'],
            'is_pwd' => ['sometimes', 'boolean'],
            'is_qualified_for_tax_exemption' => ['sometimes', 'boolean'],
        ];
    }
}
