<?php

namespace App\Domain\Attendance\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Domain\Identity\Models\Branch;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Holiday extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'holiday_date', 'name', 'type', 'applicable_branch_id',
    ];

    protected function casts(): array
    {
        return [
            'holiday_date' => 'date',
        ];
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class, 'applicable_branch_id');
    }
}
