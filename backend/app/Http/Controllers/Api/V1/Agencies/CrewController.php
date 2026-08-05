<?php

namespace App\Http\Controllers\Api\V1\Agencies;

/**
 * Project Crews — internal project-based crews (BLAST, BASIC CREW, WAREHOUSE,
 * JANITORIAL, ICE, CUTTER for PASEI), separated from organic employees and shown
 * on their own attendance board. Same behaviour as the Agency module, but keyed
 * on branches tagged is_project_crew instead of is_agency (and no fall-back to
 * all branches — a company either has crews or it doesn't).
 */
class CrewController extends AgencyController
{
    protected function branchFlag(): string
    {
        return 'is_project_crew';
    }

    protected function fallbackToAllBranches(): bool
    {
        return false;
    }
}
