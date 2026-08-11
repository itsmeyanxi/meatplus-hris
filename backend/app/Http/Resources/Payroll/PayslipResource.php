<?php

namespace App\Http\Resources\Payroll;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayslipResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $sssParts = $this->sssParts();

        return [
            'id' => $this->id,
            'payroll_run_id' => $this->payroll_run_id,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'employee_no' => $this->employee->employee_no,
                'name' => $this->employee->full_name,
            ]),
            'days_worked' => $this->days_worked,
            'days_absent' => $this->days_absent,
            'late_minutes' => $this->late_minutes,
            'overtime_minutes' => $this->overtime_minutes,
            'basic_pay' => $this->basic_pay,
            'overtime_pay' => $this->overtime_pay,
            'night_diff_pay' => $this->night_diff_pay,
            'holiday_pay' => $this->holiday_pay,
            'rest_day_pay' => $this->rest_day_pay,
            'allowance' => $this->allowance,
            'de_minimis' => $this->de_minimis,
            'loans_deduction' => $this->loans_deduction,
            'gross_pay' => $this->gross_pay,
            'sss' => $this->sss,
            'sss_regular' => $sssParts['regular'],
            'sss_wisp' => $sssParts['wisp'],
            'philhealth' => $this->philhealth,
            'pagibig' => $this->pagibig,
            'withholding_tax' => $this->withholding_tax,
            'absences_deduction' => $this->absences_deduction,
            'tardiness_deduction' => $this->tardiness_deduction,
            'total_deductions' => $this->total_deductions,
            'net_pay' => $this->net_pay,
        ];
    }
}
