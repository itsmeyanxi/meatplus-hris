<?php

namespace App\Http\Resources\AccessControl;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AccessRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'request_type' => $this->request_type,
            'effective_date' => $this->effective_date?->toDateString(),
            'ticket_number' => $this->ticket_number,

            'employee_name' => $this->employee_name,
            'employee_id_number' => $this->employee_id_number,
            'position' => $this->position,
            'department' => $this->department,
            'employment_status' => $this->employment_status,
            'immediate_supervisor' => $this->immediate_supervisor,
            'company_email' => $this->company_email,
            'contact_number' => $this->contact_number,

            'justification' => $this->justification,

            'status' => $this->status,
            'current_stage' => $this->current_stage,
            'submitted_at' => $this->submitted_at,
            'created_at' => $this->created_at,

            'requested_by' => $this->whenLoaded('requester', fn () => $this->requester ? [
                'id' => $this->requester->id,
                'name' => $this->requester->name,
                'email' => $this->requester->email,
            ] : null),

            'modules' => $this->whenLoaded('modules', fn () => $this->modules->map(fn ($m) => [
                'module' => $m->module,
                'levels' => collect(['view', 'user', 'approver', 'admin'])
                    ->filter(fn ($lvl) => $m->{$lvl})
                    ->values(),
            ])),

            'approvals' => $this->whenLoaded('approvals', fn () => $this->approvals->map(fn ($a) => [
                'stage' => $a->stage,
                'sequence' => $a->sequence,
                'status' => $a->status,
                'decided_at' => $a->decided_at,
                'remarks' => $a->remarks,
                'decided_by' => $a->relationLoaded('decider') && $a->decider ? [
                    'id' => $a->decider->id,
                    'name' => $a->decider->name,
                ] : null,
            ])),
        ];
    }
}
