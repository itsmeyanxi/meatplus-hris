<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeePerformance extends Model
{
    protected $table = 'employee_performance';

    protected $fillable = [
        'employee_id', 'review_period_start', 'review_period_end',
        'rating', 'rating_label', 'reviewer_employee_id',
        'strengths', 'areas_for_improvement', 'remarks', 'next_review_date',
    ];

    protected function casts(): array
    {
        return [
            'review_period_start' => 'date',
            'review_period_end' => 'date',
            'next_review_date' => 'date',
            'rating' => 'decimal:2',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'reviewer_employee_id');
    }
}
