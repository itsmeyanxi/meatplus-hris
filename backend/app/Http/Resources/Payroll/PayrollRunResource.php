<?php

namespace App\Http\Resources\Payroll;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollRunResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'pay_date' => $this->pay_date?->toDateString(),
            'status' => $this->status,
            'notes' => $this->notes,
            'computed_at' => $this->computed_at?->toIso8601String(),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'posted_at' => $this->posted_at?->toIso8601String(),
            'payslip_count' => $this->whenCounted('payslips'),
            'total_gross' => $this->when(isset($this->payslips_sum_gross_pay), fn () => (float) $this->payslips_sum_gross_pay),
            'total_net' => $this->when(isset($this->payslips_sum_net_pay), fn () => (float) $this->payslips_sum_net_pay),
            'payslips' => PayslipResource::collection($this->whenLoaded('payslips')),
        ];
    }
}
