<?php

namespace App\Domain\HRIS\Models;

use Illuminate\Database\Eloquent\Model;

class ReferenceItem extends Model
{
    protected $fillable = ['category', 'name', 'description', 'is_active', 'sort_order'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
