<?php

namespace App\Http\Requests\Employees;

use Illuminate\Foundation\Http\FormRequest;

class AssetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('employee.update') ?? false;
    }

    public function rules(): array
    {
        $req = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'item' => [$req, 'string', 'max:150'],
            'category' => ['nullable', 'string', 'max:100'],
            'condition' => ['nullable', 'string', 'max:50'],
            'purchase_price' => ['nullable', 'numeric', 'min:0'],
            'serial_number' => ['nullable', 'string', 'max:150'],
            'acquired_date' => ['nullable', 'date'],
            'date_issued' => ['nullable', 'date'],
            'date_returned' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
