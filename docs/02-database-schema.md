# ALL COMPANY HRIS — Database Schema

> **Engine (live):** **PostgreSQL 17**, self-hosted via Laragon on the office PC
> (`127.0.0.1:5433`, database `meatplus_hris`) — see [04-operations.md](04-operations.md).
> This doc was first written against MySQL 8, so the **types below use MySQL spelling** —
> read them as the design contract, with the Postgres equivalents noted under "Portability"
> below. The app is driver-agnostic and runs on either. The Laravel migration files are the
> executable source of truth.
>
> ⚠️ **On MySQL, string comparison is case-insensitive** (`utf8mb4_unicode_ci`). Values
> that differ only by letter case — notably `users.email` — collide on unique indexes
> there but not on Postgres. Relevant whenever the data is copied to a MySQL box.
> **Naming:** `snake_case`, plural table names, singular column names.
> **Money:** all monetary columns use `DECIMAL(15,4)` (Postgres `NUMERIC(15,4)`).
> **Timestamps:** every table has `created_at`, `updated_at` (and `deleted_at` where soft-deletable). Times stored as **UTC**.
> **Tenancy:** every business table includes `company_id` (FK → `companies(id)`) unless explicitly global.
> **PII encryption:** columns marked **🔒** are encrypted at rest via Laravel `Crypt`.

### Portability (MySQL ⇄ Postgres)
The codebase runs on **both** engines; the app is kept driver-agnostic:

| Concern | MySQL | PostgreSQL (current) |
|---|---|---|
| Money | `DECIMAL(15,4)` | `NUMERIC(15,4)` |
| JSON | `JSON` | `JSONB` |
| IP address | `VARCHAR(45)` | `inet` (we use varchar for portability) |
| Auto-id | `BIGINT UNSIGNED AUTO_INCREMENT` | `bigserial` |
| Case-insensitive search | `LIKE` | `ILIKE` — via `Controller::likeOperator()` |
| Relax NOT NULL | `MODIFY col … NULL` | `ALTER COLUMN col DROP NOT NULL` — driver-aware migration |
| TLS | n/a | `DB_SSLMODE` (`prefer`/`require`) |

This document is the canonical schema for v1; migration files are the executable source of truth.

---

## Table of contents

1. Identity & Access
2. Organizational structure
3. Employee records (HRIS / 201)
4. Attendance
5. Leave
6. Payroll
7. Government reference tables
8. Audit
9. System

---

## 1. Identity & Access

### `users`
Application user accounts. May or may not be linked to an `employee` record (e.g., super_admin without an employee record).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `name` | varchar(255) | |
| `email` | varchar(255) | unique |
| `email_verified_at` | datetime nullable | |
| `password` | varchar(255) | bcrypt |
| `two_factor_secret` | text nullable | encrypted |
| `two_factor_recovery_codes` | text nullable | encrypted JSON |
| `active_company_id` | bigint FK companies nullable | currently selected tenant |
| `is_active` | boolean default true | |
| `last_login_at` | datetime nullable | |
| `remember_token`, `created_at`, `updated_at`, `deleted_at` | | |

**Indexes:** `email` unique, `active_company_id`.

### `personal_access_tokens` *(Sanctum default)*
### `password_reset_tokens` *(Laravel default)*
### `sessions` *(Laravel default)*

### `roles` *(Spatie)*
### `permissions` *(Spatie)*
### `model_has_roles`, `model_has_permissions`, `role_has_permissions` *(Spatie)*

> Spatie tables get a `team_id` column repurposed as `company_id` to scope roles per tenant.

### `company_user`
Pivot: which users belong to which companies.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK companies | |
| `user_id` | bigint FK users | |
| `is_default` | boolean default false | default tenant on login |
| `created_at`, `updated_at` | | |

**Unique:** (`company_id`, `user_id`).

---

## 2. Organizational structure

### `companies`
Tenant root. Each row = a legal entity (company) in the system.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `code` | varchar(20) | unique short code, e.g., `MPP-MAIN` |
| `legal_name` | varchar(255) | |
| `trade_name` | varchar(255) nullable | |
| `tin` | varchar(20) | 🔒 BIR TIN |
| `sss_employer_no` | varchar(20) nullable | 🔒 |
| `philhealth_employer_no` | varchar(20) nullable | 🔒 |
| `pagibig_employer_no` | varchar(20) nullable | 🔒 |
| `rdo_code` | varchar(10) nullable | BIR Revenue District Office |
| `address_line1`, `address_line2`, `city`, `province`, `postal_code`, `country` | | |
| `contact_email`, `contact_phone` | | |
| `logo_path` | varchar(255) nullable | |
| `is_active` | boolean default true | |
| `created_at`, `updated_at`, `deleted_at` | | |

### `branches`
Physical locations under a company.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `code`, `name` | | unique (`company_id`, `code`) |
| `address_*` | | same shape as company |
| `is_head_office` | boolean default false | |
| timestamps | | |

### `departments`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `parent_department_id` | bigint FK departments nullable | hierarchical |
| `code`, `name` | | unique (`company_id`, `code`) |
| `head_employee_id` | bigint FK employees nullable | |
| timestamps + soft delete | | |

### `positions`
Job titles / roles within the org (distinct from RBAC roles).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `department_id` | bigint FK departments nullable | |
| `title` | varchar(150) | |
| `level` | smallint nullable | salary grade or rank tier |
| `description` | text nullable | |
| timestamps + soft delete | | |

### `employment_types`
Reference: Regular, Probationary, Project-Based, Casual, Contractual, Intern.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK nullable | nullable = global default set |
| `code`, `name` | | |
| `is_regular` | boolean | drives benefits eligibility |
| timestamps | | |

---

## 3. Employee records (HRIS / 201)

### `employees`
The 201 file core.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `user_id` | bigint FK users nullable | links to login account if exists |
| `employee_no` | varchar(20) | unique per company (`company_id`, `employee_no`) |
| `first_name`, `middle_name`, `last_name`, `suffix` | | |
| `birth_date` | date | |
| `gender` | varchar(20) | |
| `civil_status` | varchar(20) | single, married, widowed, separated, divorced |
| `nationality` | varchar(50) default 'Filipino' | |
| `religion` | varchar(50) nullable | |
| `email_personal`, `email_company` | varchar(255) nullable | |
| `mobile`, `phone_home` | varchar(50) nullable | |
| `address_*` (line1, line2, city, province, postal, country) | | current address |
| `permanent_address_*` | | |
| `branch_id` | bigint FK branches | primary assigned branch |
| `department_id` | bigint FK departments | |
| `position_id` | bigint FK positions | |
| `employment_type_id` | bigint FK employment_types | |
| `manager_employee_id` | bigint FK employees nullable | |
| `date_hired` | date | |
| `date_regularized` | date nullable | |
| `date_separated` | date nullable | |
| `separation_reason` | varchar(100) nullable | |
| `is_active` | boolean default true | |
| `photo_path` | varchar(255) nullable | |
| timestamps + soft delete | | |

**Indexes:** (`company_id`, `employee_no`) unique, `branch_id`, `department_id`, `position_id`, `manager_employee_id`, `is_active`.

### `employee_government_ids`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `employee_id` | bigint FK | one-to-one |
| `tin` | varchar(20) nullable | 🔒 |
| `sss_no` | varchar(20) nullable | 🔒 |
| `philhealth_no` | varchar(20) nullable | 🔒 |
| `pagibig_no` | varchar(20) nullable | 🔒 |
| `prc_no`, `prc_expiry` | nullable | for licensed professionals |
| timestamps | | |

### `employee_contracts`
Employment contract history.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `employee_id` | bigint FK | |
| `contract_type` | varchar(50) | regular, probationary, project, fixed-term |
| `effective_from`, `effective_to` | date | `to` nullable for open-ended |
| `position_id` | bigint FK | snapshot — position at signing |
| `monthly_rate` | decimal(15,4) | snapshot |
| `document_path` | varchar(255) nullable | signed PDF |
| `signed_at` | datetime nullable | |
| timestamps | | |

### `employee_dependents`
| `id`, `employee_id` FK, `full_name`, `relationship`, `birth_date`, `is_minor`, `is_pwd`, `is_qualified_for_tax_exemption`, timestamps |

### `employee_emergency_contacts`
| `id`, `employee_id` FK, `name`, `relationship`, `phone`, `mobile`, `address`, timestamps |

### `employee_bank_accounts`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `employee_id` | bigint FK | |
| `bank_name` | varchar(100) | |
| `account_number` | varchar(50) | 🔒 |
| `account_name` | varchar(150) | |
| `is_primary` | boolean | only one primary per employee |
| `purpose` | varchar(30) default 'payroll' | payroll, allowance, etc. |
| timestamps | | |

### `employee_education`
| `id`, `employee_id` FK, `level` (elementary/secondary/tertiary/graduate), `school`, `degree`, `year_from`, `year_to`, `honors`, timestamps |

### `employee_employment_history`
| `id`, `employee_id` FK, `company_name`, `position`, `from_date`, `to_date`, `reason_for_leaving`, timestamps |

### `employee_documents`
Spatie MediaLibrary; abstracted but typed via `collection_name` (`201_file`, `government_id`, `contract_signed`, `clearance`, etc.).

---

## 4. Attendance

### `work_schedules`
Reusable schedule templates.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `code`, `name` | | unique (`company_id`, `code`) |
| `description` | text nullable | |
| `is_flexible` | boolean default false | flexi-time? |
| `breaks_paid` | boolean default false | are break minutes paid? |
| `weekly_workdays` | smallint | usually 5 or 6 |
| timestamps + soft delete | | |

### `work_schedule_days`
Per-day shift definition under a schedule.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `work_schedule_id` | bigint FK | |
| `day_of_week` | smallint | 0 = Sunday … 6 = Saturday |
| `is_rest_day` | boolean | |
| `time_in` | time nullable | |
| `time_out` | time nullable | |
| `break_minutes` | smallint default 60 | |
| `required_hours` | decimal(5,2) | computed but stored for performance |

**Unique:** (`work_schedule_id`, `day_of_week`).

### `employee_schedules`
Effectivity-dated assignment of a schedule to an employee.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `employee_id`, `work_schedule_id` | FK | |
| `effective_from`, `effective_to` | date | `to` nullable = open-ended |
| timestamps | | |

**Index:** (`employee_id`, `effective_from`).

### `holidays`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK nullable | nullable = applies nationally |
| `holiday_date` | date | |
| `name` | varchar(150) | |
| `type` | varchar(30) | `regular`, `special_non_working`, `special_working`, `local` |
| `applicable_branch_id` | bigint FK branches nullable | local holidays |
| timestamps | | |

**Index:** (`company_id`, `holiday_date`).

### `time_logs`
Raw biometric / web punch events. Append-only.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `employee_id` | bigint FK | |
| `logged_at` | datetime | the punch timestamp |
| `direction` | varchar(10) | `in`, `out`, `break_out`, `break_in` |
| `source` | varchar(20) | `biometric`, `web`, `mobile`, `manual` |
| `device_id` | varchar(50) nullable | biometric device identifier |
| `ip_address` | varchar(45) nullable | IPv4 or IPv6 |
| `lat`, `lng` | decimal(10,7) nullable | mobile geotag |
| `metadata` | json nullable | raw source payload |
| `created_at` | datetime | (no `updated_at` — append-only) |

**Indexes:** (`employee_id`, `logged_at`), (`company_id`, `logged_at`).
**Partitioning (future):** by year on `logged_at`.

### `daily_time_records`
Computed daily summary, one row per employee per work date.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id`, `employee_id` | FK | |
| `work_date` | date | |
| `scheduled_in`, `scheduled_out` | time nullable | from active schedule |
| `actual_in`, `actual_out` | datetime nullable | derived |
| `hours_worked` | decimal(5,2) default 0 | |
| `late_minutes`, `undertime_minutes`, `overtime_minutes` | int default 0 | |
| `night_diff_minutes` | int default 0 | 10pm–6am |
| `holiday_type` | varchar(30) nullable | denormalized from `holidays` |
| `is_rest_day` | boolean default false | |
| `is_absent` | boolean default false | |
| `is_on_leave` | boolean default false | linked to `leave_applications` |
| `leave_application_id` | bigint FK nullable | |
| `status` | varchar(20) | `draft`, `posted`, `locked` (locked after payroll run) |
| `remarks` | text nullable | |
| timestamps | | |

**Unique:** (`employee_id`, `work_date`).

### `overtime_requests`
| `id`, `company_id`, `employee_id`, `date`, `start_time`, `end_time`, `requested_hours`, `reason`, `status` (pending/approved/rejected), `approved_by_employee_id`, `approved_at`, timestamps |

### `official_business_requests`
Same shape as OT but for off-site work.

### `attendance_corrections`
| `id`, `employee_id`, `work_date`, `field_to_correct`, `old_value`, `new_value`, `reason`, `attached_proof`, `status`, `approved_by`, `approved_at`, timestamps |

---

## 5. Leave

### `leave_types`
PH-relevant set seeded: Vacation (VL), Sick (SL), Emergency (EL), Maternity (105 days), Paternity (7 days), Solo Parent (7 days), Bereavement, Magna Carta for Women (60 days surgical), VAWC (10 days), Service Incentive Leave (5 days statutory).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `code`, `name` | | unique (`company_id`, `code`) |
| `default_credits_per_year` | decimal(5,2) | |
| `is_paid` | boolean | |
| `is_convertible_to_cash` | boolean default false | |
| `requires_attachment` | boolean default false | sick > N days, maternity, etc. |
| `min_days_filing_lead` | smallint default 0 | how far ahead to file |
| `max_consecutive_days` | smallint nullable | |
| `gender_restriction` | varchar(10) nullable | `male`, `female`, null |
| `accrual_method` | varchar(20) | `annual`, `monthly`, `none` (statutory grant) |
| `is_active` | boolean default true | |
| timestamps + soft delete | | |

### `leave_balances`
Running balance per employee per leave type per calendar year.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `employee_id`, `leave_type_id` | FK | |
| `year` | smallint | |
| `opening_balance` | decimal(6,2) | |
| `accrued` | decimal(6,2) default 0 | |
| `granted_adhoc` | decimal(6,2) default 0 | |
| `used` | decimal(6,2) default 0 | |
| `current_balance` | decimal(6,2) generated | computed: `opening + accrued + granted_adhoc - used` |
| `carried_over_to_next` | decimal(6,2) default 0 | filled at year-end |
| timestamps | | |

**Unique:** (`employee_id`, `leave_type_id`, `year`).

### `leave_applications`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id`, `employee_id`, `leave_type_id` | FK | |
| `date_from`, `date_to` | date | |
| `days_count` | decimal(5,2) | computed inclusive |
| `half_day` | varchar(10) nullable | `am`, `pm`, null |
| `reason` | text | |
| `attachment_path` | varchar(255) nullable | |
| `status` | varchar(20) | `draft`, `submitted`, `approved`, `rejected`, `cancelled` |
| `submitted_at`, `decided_at` | datetime nullable | |
| `current_approver_employee_id` | bigint FK nullable | next person in queue |
| timestamps + soft delete | | |

### `leave_application_approvals`
Multi-step approval chain (e.g., dept_head → HR).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `leave_application_id` | bigint FK | |
| `step_order` | smallint | 1, 2, 3 |
| `approver_employee_id` | bigint FK | |
| `decision` | varchar(20) | `pending`, `approved`, `rejected` |
| `remarks` | text nullable | |
| `decided_at` | datetime nullable | |
| timestamps | | |

---

## 6. Payroll

### `pay_periods`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint FK | |
| `code` | varchar(30) | e.g., `2026-05-1H` |
| `frequency` | varchar(20) | `semi-monthly`, `monthly`, `weekly`, `bi-weekly` |
| `period_start`, `period_end` | date | |
| `pay_date` | date | when net pay credits |
| `status` | varchar(20) | `open`, `processing`, `closed` |
| timestamps | | |

**Unique:** (`company_id`, `code`).

### `payroll_runs`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id`, `pay_period_id` | FK | |
| `run_type` | varchar(30) | `regular`, `13th_month`, `final_pay`, `special` |
| `status` | varchar(20) | `draft`, `running`, `computed`, `approved`, `posted`, `cancelled` |
| `triggered_by_user_id` | bigint FK users | |
| `approved_by_user_id` | bigint FK users nullable | |
| `started_at`, `completed_at`, `approved_at`, `posted_at` | datetime nullable | |
| `total_gross`, `total_net`, `total_deductions` | decimal(15,4) default 0 | |
| `notes` | text nullable | |
| timestamps + soft delete | | |

**Index:** (`company_id`, `pay_period_id`, `run_type`).

### `payslips`
One row per employee per run.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id`, `payroll_run_id`, `employee_id` | FK | |
| `gross_earnings`, `total_deductions`, `total_contributions_ee`, `total_contributions_er`, `net_pay`, `taxable_income`, `withholding_tax`, `non_taxable_income` | decimal(15,4) | |
| `days_worked`, `days_absent`, `days_on_leave_paid` | decimal(5,2) | |
| `hours_regular`, `hours_overtime`, `hours_night_diff`, `hours_holiday` | decimal(7,2) | |
| `pdf_path` | varchar(255) nullable | generated PDF |
| `emailed_at` | datetime nullable | |
| `snapshot` | json | full computation snapshot for audit |
| timestamps + soft delete | | |

**Unique:** (`payroll_run_id`, `employee_id`).

### `payslip_items`
Per-line breakdown.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `payslip_id` | bigint FK | |
| `type` | varchar(20) | `earning`, `deduction`, `contribution_ee`, `contribution_er`, `tax` |
| `category_code` | varchar(50) | links to `earning_types.code` / `deduction_types.code` / etc. |
| `description` | varchar(200) | |
| `quantity` | decimal(10,4) nullable | hours / days where applicable |
| `rate` | decimal(15,4) nullable | |
| `amount` | decimal(15,4) | |
| `is_taxable` | boolean default true | |
| `metadata` | json nullable | |
| timestamps | | |

**Index:** (`payslip_id`, `type`).

### `earning_types`
Seeded: `BASIC`, `OT_REG`, `OT_REST`, `OT_HOL_REG`, `OT_HOL_SPE`, `NIGHT_DIFF`, `HOL_REG`, `HOL_SPE`, `ALLOWANCE_TRANSPORT`, `ALLOWANCE_MEAL`, `13TH_MONTH`, `BONUS`, `COMMISSION`, `RETRO_PAY`, etc.

| `id`, `company_id` FK nullable, `code`, `name`, `is_taxable` (bool), `is_subject_to_sss` / `is_subject_to_philhealth` / `is_subject_to_pagibig` (bool), `affects_13th_month` (bool), `is_active`, timestamps |

### `deduction_types`
Seeded: `CASH_ADVANCE`, `UNIFORM`, `SSS_LOAN`, `PAGIBIG_LOAN`, `COMPANY_LOAN`, `INSURANCE`, `UNION_DUE`, `LATE`, `UNDERTIME`, `ABSENCE`, etc.

| `id`, `company_id` FK nullable, `code`, `name`, `reduces_taxable_income` (bool), `is_active`, timestamps |

### `contribution_types`
Reference for mandatory contributions: `SSS_EE`, `SSS_ER`, `SSS_EC_ER`, `PHIC_EE`, `PHIC_ER`, `HDMF_EE`, `HDMF_ER`, `WHT`.

| `id`, `code`, `name`, `payable_by` (`employee` / `employer`), `is_active` |

### `employee_compensations`
Salary history — never overwritten; new effective-dated row per change.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `employee_id` | bigint FK | |
| `pay_basis` | varchar(20) | `monthly`, `daily`, `hourly` |
| `base_rate` | decimal(15,4) | |
| `monthly_rate` | decimal(15,4) | normalized for SSS/PHIC/HDMF brackets |
| `daily_rate`, `hourly_rate` | decimal(15,4) | derived; stored for performance |
| `currency` | varchar(3) default 'PHP' | |
| `effective_from`, `effective_to` | date | |
| `reason` | varchar(100) nullable | promotion, merit, adjustment |
| `approved_by_user_id` | bigint FK users nullable | |
| timestamps | | |

**Index:** (`employee_id`, `effective_from`).

### `employee_allowances`
Recurring per-period allowances.

| `id`, `employee_id` FK, `earning_type_id` FK, `amount` decimal(15,4), `frequency` (`per_period`, `monthly`), `effective_from`, `effective_to`, timestamps |

### `employee_deductions`
Recurring per-period deductions.

| `id`, `employee_id` FK, `deduction_type_id` FK, `amount` decimal(15,4), `frequency`, `effective_from`, `effective_to`, timestamps |

### `loans`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id`, `employee_id` | FK | |
| `loan_type` | varchar(50) | `sss`, `pagibig`, `company`, `salary_advance` |
| `reference_no` | varchar(50) nullable | govt loan ref number |
| `principal` | decimal(15,4) | |
| `interest_rate` | decimal(7,4) default 0 | |
| `term_months` | smallint | |
| `monthly_amortization` | decimal(15,4) | |
| `total_payable` | decimal(15,4) | |
| `total_paid` | decimal(15,4) default 0 | |
| `balance` | decimal(15,4) | denormalized |
| `start_date`, `end_date` | date | |
| `status` | varchar(20) | `active`, `paid`, `defaulted`, `cancelled` |
| `notes` | text nullable | |
| timestamps + soft delete | | |

### `loan_payments`
| `id`, `loan_id` FK, `payslip_id` FK nullable, `paid_at` datetime, `amount` decimal(15,4), `principal_portion`, `interest_portion`, `balance_after` decimal(15,4), `source` (`payroll`, `manual`), timestamps |

### `thirteenth_month_runs`
| `id`, `company_id`, `year`, `cutoff_from`, `cutoff_to`, `status`, `triggered_by`, `posted_at`, timestamps |

### `final_pay_computations`
| `id`, `employee_id`, `separation_date`, `last_pay_period_id`, `gross_unpaid_salary`, `prorated_13th_month`, `leave_conversion`, `outstanding_loans_deducted`, `tax_refund`, `net_final_pay`, `status`, `released_at`, timestamps |

### `payroll_audit_log`
**Append-only. The DB role used by the app has INSERT but not UPDATE/DELETE on this table.**

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigserial PK | |
| `company_id` | bigint | |
| `event` | varchar(50) | `payroll_run.computed`, `payslip.adjusted`, `compensation.changed`, … |
| `subject_type` | varchar(100) | e.g., `App\Domain\Payroll\Models\Payslip` |
| `subject_id` | bigint | |
| `causer_user_id` | bigint nullable | |
| `before` | json nullable | |
| `after` | json nullable | |
| `diff` | json nullable | computed diff |
| `metadata` | json nullable | request info, IP, etc. |
| `occurred_at` | datetime | |

**Indexes:** (`subject_type`, `subject_id`), (`company_id`, `occurred_at`), (`event`, `occurred_at`).

---

## 7. Government reference tables

All are **effectivity-dated** so we can recompute historical payrolls accurately when brackets change. Seeded from official issuances; updated by HR admin when new issuances drop.

### `gov_sss_brackets`
| `id`, `effective_from`, `effective_to` nullable, `salary_floor`, `salary_ceiling`, `monthly_salary_credit`, `ee_contribution`, `er_contribution`, `ec_contribution`, `wisp_ee`, `wisp_er`, timestamps |

### `gov_philhealth_brackets`
| `id`, `effective_from`, `effective_to`, `salary_floor`, `salary_ceiling`, `premium_rate` (e.g., 0.0500), `ee_share`, `er_share`, `floor_premium`, `ceiling_premium`, timestamps |

### `gov_pagibig_brackets`
| `id`, `effective_from`, `effective_to`, `salary_floor`, `salary_ceiling`, `ee_rate`, `er_rate`, `max_contribution`, timestamps |

### `gov_tax_brackets`
BIR Revised Withholding Tax Table on Compensation. Note: separate sets per `payroll_frequency` (`daily`, `weekly`, `semi-monthly`, `monthly`).

| `id`, `effective_from`, `effective_to`, `frequency`, `bracket_floor`, `bracket_ceiling`, `fixed_tax`, `rate_over_floor` (e.g., 0.2000), timestamps |

### `gov_report_runs`
History of generated reports — alphalist, BIR 1601-C, SSS R-3, PHIC RF-1, HDMF MCRF.

| `id`, `company_id`, `report_code` (`alphalist`, `bir_1601c`, `sss_r3`, `phic_rf1`, `hdmf_mcrf`), `period_from`, `period_to`, `file_path`, `generated_by_user_id`, `generated_at`, `metadata` json, timestamps |

---

## 8. Audit

### `activity_log` *(Spatie)*
General activity. Default Spatie schema.

### `payroll_audit_log`
Defined above in Section 6 — colocated with payroll for narrative coherence, but logically an audit table.

---

## 9. System

### `jobs`, `failed_jobs` *(Laravel queue)*
### `cache` *(fallback when Redis unavailable)*
### `migrations` *(Laravel default)*

---

## Schema invariants (enforced by app + DB)

1. **No money column is nullable AND a default 0 if business logic permits zero.** Otherwise `NOT NULL` with explicit value at insert.
2. **`pay_period.period_start <= pay_period.period_end < pay_period.pay_date`.** Enforced by `CHECK` constraint.
3. **`employee.date_separated`, if set, > `employee.date_hired`.** `CHECK`.
4. **A `payroll_run` cannot be deleted (only soft-deleted) after `status = 'approved'`.**
5. **A `payslip` cannot be edited after its `payroll_run.status = 'posted'`.** Adjustments go through a new run (`run_type = 'special'`).
6. **`employee_compensations` rows are immutable once another row supersedes them** (effective_to set).
7. **A `daily_time_record` becomes `locked` when its pay_period is included in a posted payroll run.**

These are documented; corresponding migration constraints and model events will enforce them.

---

## Indexing summary (beyond PKs / FKs)

Hot read paths get explicit indexes (above). Specific notes:

- `time_logs` → composite (`employee_id`, `logged_at`); plan for yearly partition.
- `daily_time_records` → unique (`employee_id`, `work_date`).
- `payslips` → (`employee_id`, `created_at` DESC) for "my recent payslips".
- `payslip_items` → (`payslip_id`, `type`).
- All `effective_from` columns on bracket / compensation tables get a btree index.

---

## Future schema considerations (NOT v1)

- Partitioning `time_logs`, `payslips`, `payslip_items` by year once volume warrants.
- Materialized view for "current employee headcount per dept" used in dashboards.
- Separate read-replica with delayed payroll reporting.
- Encrypted columns may migrate to `pgcrypto` if Laravel `Crypt` becomes a bottleneck.
