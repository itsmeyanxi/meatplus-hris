<?php

namespace App\Domain\Identity\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Branch extends Model
{
    use BelongsToCompany;
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'code', 'name',
        'address_line1', 'address_line2', 'city', 'province', 'postal_code', 'country',
        'latitude', 'longitude', 'geofence_radius_m',
        'is_head_office', 'is_agency', 'is_project_crew', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_head_office' => 'boolean',
            'is_agency' => 'boolean',
            'is_project_crew' => 'boolean',
            'is_active' => 'boolean',
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'geofence_radius_m' => 'integer',
        ];
    }

    public function employees(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(\App\Domain\HRIS\Models\Employee::class);
    }
}
