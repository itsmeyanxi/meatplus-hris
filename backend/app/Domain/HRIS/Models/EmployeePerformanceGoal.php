<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeePerformanceGoal extends Model
{
    protected $table = 'employee_performance_goals';

    protected $fillable = ['employee_id', 'goal', 'due_date', 'feedback'];

    protected function casts(): array
    {
        return ['due_date' => 'date'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
