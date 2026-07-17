<?php

namespace App\Domain\Attendance\Models;

use App\Domain\HRIS\Models\Employee;
use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An admin-uploaded time log awaiting approval. While PENDING it has no effect on
 * attendance; approving it writes real punches into time_logs (see the controller)
 * and recomputes that day's DTR.
 */
class TimeLogRequest extends Model
{
    use BelongsToCompany;

    protected $fillable = [
        'company_id', 'employee_id', 'batch_id', 'work_date', 'time_in', 'time_out',
        'status', 'note', 'uploaded_by', 'decided_by', 'decided_at', 'decision_remarks',
    ];

    protected function casts(): array
    {
        return [
            'work_date' => 'date',
            'decided_at' => 'datetime',
        ];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
