<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EmployeePhoto extends Model
{
    protected $table = 'employee_photos';

    protected $fillable = ['employee_id', 'mime', 'size_bytes', 'data'];

    protected function casts(): array
    {
        return ['size_bytes' => 'integer'];
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    /** Raw image bytes, decoded from the stored base64. */
    public function bytes(): string
    {
        return base64_decode($this->data, true) ?: '';
    }
}
