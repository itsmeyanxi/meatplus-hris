<?php

namespace App\Domain\Attendance\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class WorkSchedule extends Model
{
    use BelongsToCompany;
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'code', 'name', 'description',
        'is_flexible', 'breaks_paid', 'weekly_workdays', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_flexible' => 'boolean',
            'breaks_paid' => 'boolean',
            'is_active' => 'boolean',
            'weekly_workdays' => 'integer',
        ];
    }

    public function days(): HasMany
    {
        return $this->hasMany(WorkScheduleDay::class)->orderBy('day_of_week');
    }

    public function employeeAssignments(): HasMany
    {
        return $this->hasMany(EmployeeSchedule::class);
    }
}
