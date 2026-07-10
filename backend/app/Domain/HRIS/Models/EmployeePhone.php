<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeePhone extends Model
{
    protected $table = 'employee_phones';

    protected $fillable = ['employee_id', 'title', 'contact_no', 'contact_name'];

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }
}
