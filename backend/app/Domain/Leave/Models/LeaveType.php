<?php

namespace App\Domain\Leave\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class LeaveType extends Model
{
    use BelongsToCompany;
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'code', 'name', 'default_credits_per_year',
        'is_paid', 'is_convertible_to_cash', 'requires_attachment',
        'min_days_filing_lead', 'max_consecutive_days',
        'gender_restriction', 'accrual_method', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'default_credits_per_year' => 'decimal:2',
            'is_paid' => 'boolean',
            'is_convertible_to_cash' => 'boolean',
            'requires_attachment' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
