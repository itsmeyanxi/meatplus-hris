<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\DB;

abstract class Controller
{
    /**
     * Case-insensitive LIKE operator for the active driver. MySQL's LIKE is
     * already case-insensitive; PostgreSQL needs ILIKE.
     */
    protected function likeOperator(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }
}
