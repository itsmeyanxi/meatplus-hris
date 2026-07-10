<?php

namespace App\Domain\HRIS\Models;

use App\Domain\Identity\Models\Branch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeeLocation extends Model
{
    protected $table = 'employee_locations';

    protected $fillable = ['employee_id', 'branch_id', 'designated_workplace', 'is_primary'];

    protected function casts(): array
    {
        return ['is_primary' => 'boolean'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }
}
