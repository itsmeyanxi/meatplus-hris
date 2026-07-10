<?php

namespace App\Domain\HRIS\Models;

use App\Domain\Identity\Concerns\BelongsToCompany;
use App\Domain\Identity\Models\Branch;
use App\Models\User;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use BelongsToCompany;
    use SoftDeletes;

    protected $fillable = [
        'company_id', 'user_id', 'employee_no', 'biometric_user_id',
        'first_name', 'middle_name', 'last_name', 'suffix',
        'birth_date', 'gender', 'civil_status', 'nationality', 'religion',
        'email_personal', 'email_company', 'mobile', 'phone_home',
        'address_line1', 'address_line2', 'city', 'province', 'postal_code', 'country',
        'permanent_address_line1', 'permanent_address_line2', 'permanent_city',
        'permanent_province', 'permanent_postal_code', 'permanent_country',
        'branch_id', 'department_id', 'position_id', 'employment_type_id',
        'manager_employee_id',
        'date_hired', 'date_regularized', 'date_separated', 'separation_reason',
        'is_active', 'photo_path',
    ];

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'date_hired' => 'date',
            'date_regularized' => 'date',
            'date_separated' => 'date',
            'is_active' => 'boolean',
        ];
    }

    protected function fullName(): Attribute
    {
        return Attribute::make(
            get: fn () => trim(implode(' ', array_filter([
                $this->first_name,
                $this->middle_name,
                $this->last_name,
                $this->suffix,
            ]))),
        );
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    public function compensation(): HasOne
    {
        return $this->hasOne(\App\Domain\Payroll\Models\EmployeeCompensation::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function position(): BelongsTo
    {
        return $this->belongsTo(Position::class);
    }

    public function employmentType(): BelongsTo
    {
        return $this->belongsTo(EmploymentType::class);
    }

    public function manager(): BelongsTo
    {
        return $this->belongsTo(Employee::class, 'manager_employee_id');
    }

    public function directReports(): HasMany
    {
        return $this->hasMany(Employee::class, 'manager_employee_id');
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(\App\Models\Invitation::class);
    }

    public function governmentIds(): HasOne
    {
        return $this->hasOne(EmployeeGovernmentId::class);
    }

    public function contracts(): HasMany
    {
        return $this->hasMany(EmployeeContract::class);
    }

    public function bankAccounts(): HasMany
    {
        return $this->hasMany(EmployeeBankAccount::class);
    }

    public function dependents(): HasMany
    {
        return $this->hasMany(EmployeeDependent::class);
    }

    public function emergencyContacts(): HasMany
    {
        return $this->hasMany(EmployeeEmergencyContact::class);
    }

    public function education(): HasMany
    {
        return $this->hasMany(EmployeeEducation::class);
    }

    public function performanceReviews(): HasMany
    {
        return $this->hasMany(EmployeePerformance::class);
    }

    public function photo(): HasOne
    {
        return $this->hasOne(EmployeePhoto::class);
    }

    public function employmentHistory(): HasMany
    {
        return $this->hasMany(EmployeeEmploymentHistory::class);
    }

    public function scheduleAssignments(): HasMany
    {
        return $this->hasMany(\App\Domain\Attendance\Models\EmployeeSchedule::class);
    }

    public function timeLogs(): HasMany
    {
        return $this->hasMany(\App\Domain\Attendance\Models\TimeLog::class);
    }

    public function dailyTimeRecords(): HasMany
    {
        return $this->hasMany(\App\Domain\Attendance\Models\DailyTimeRecord::class);
    }
}
