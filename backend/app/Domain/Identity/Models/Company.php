<?php

namespace App\Domain\Identity\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Crypt;

class Company extends Model
{
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'code', 'legal_name', 'trade_name',
        'tin', 'sss_employer_no', 'philhealth_employer_no', 'pagibig_employer_no',
        'rdo_code',
        'address_line1', 'address_line2', 'city', 'province', 'postal_code', 'country',
        'contact_email', 'contact_phone', 'logo_path',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    protected function tin(): Attribute
    {
        return $this->encryptedAttribute();
    }

    protected function sssEmployerNo(): Attribute
    {
        return $this->encryptedAttribute();
    }

    protected function philhealthEmployerNo(): Attribute
    {
        return $this->encryptedAttribute();
    }

    protected function pagibigEmployerNo(): Attribute
    {
        return $this->encryptedAttribute();
    }

    private function encryptedAttribute(): Attribute
    {
        return Attribute::make(
            get: fn ($v) => $v ? Crypt::decryptString($v) : null,
            set: fn ($v) => $v ? Crypt::encryptString($v) : null,
        );
    }

    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'company_user')
            ->withPivot('is_default')
            ->withTimestamps();
    }
}
