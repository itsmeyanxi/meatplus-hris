# Permissions & Access Reference

Permissions are **per-company** (Spatie Permission in **teams mode**, keyed by `company_id`).
A user can hold **multiple roles** and receives the **union** of their permissions.

- **Source of truth:** `backend/database/seeders/PermissionsSeeder.php`
- **Frontend gates:** `frontend/src/app/(admin)/layout.tsx` (nav) and `components/RoleGate.tsx` (page guards)
- **"View as role":** IT Admin can preview any role's navigation/access from the sidebar.

> **Role history:** `super_admin` was retired → folded into **`it_admin`** (now the top-level
> administrator). `hr_manager` was retired → folded into **`hr_admin`**. The seeder migrates any
> existing holders automatically (`retireRole`).

---

## Permission glossary

| Permission | Unlocks |
|---|---|
| `employee.view / create / update / delete` | Read / add / edit / remove employee records |
| `attendance.view` | See attendance/DTR/time-logs (own only unless `.view.any`) |
| `attendance.view.any` | See everyone's attendance |
| `attendance.manage` | Schedules, holidays, shift adjustments, create time-logs, recompute DTR, file/cancel for others |
| `attendance.correct` | Apply attendance corrections |
| `attendance.approve.any` / `.approve.self_dept` | Approve OT/UT/OB/COA/correction requests (all / own dept) |
| `leave.view / file` | See leaves / apply for leave |
| `leave.approve.any` / `.approve.self_dept` | Approve leave applications (all / own dept) |
| `leave.manage_types` | Create/edit leave types |
| `payroll.view / run / approve / post` | Payroll lifecycle |
| `compensation.view / manage` | View / edit employee compensation |
| `gov_report.view / generate` | Government reports (SSS/PhilHealth/Pag-IBIG/BIR) |
| `device.manage` | Biometric device registry (Devices page) — register, edit, sync |
| `company.manage` | Org settings |
| `user.manage` | User accounts |
| `role.manage` | Role assignment |
| `audit.view` | Audit log |
| `access_request.view` | See access requests |
| `access_request.approve.supervisor / .hr / .it` | The 3-stage access-request workflow |

---

## The 13 roles at a glance

| Role | One-liner |
|---|---|
| **it_admin** | Top-level administrator — **every** permission; bypasses company scope |
| **hr_admin** | HR administrator — employees, full attendance admin, users/roles, devices, HR access stage |
| **payroll_officer** | Payroll & government reporting |
| **dept_head** | The approver — approves attendance requests **and** leaves |
| **supervisor** | Like dept_head's approvals, plus sees all attendance |
| **team_lead** | Lightweight approver for own dept |
| **dept_admin** | Department admin — edit employees + manage attendance for the dept |
| **timekeeper** | Attendance operations — manage + correct time records |
| **hr_coordinator** | HR support — view employees/attendance/leave, approve HR access stage |
| **transport_access** | Read-only employees + all attendance (logistics) |
| **sales_employee** | Field staff — view own attendance, file leave |
| **garahe_teamlead** | Garage team lead — manage + correct + approve own-dept attendance |
| **employee** | Self-service — file own leave, see own attendance |

---

## Role × capability (exact, from the seeder)

### it_admin — top-level administrator
- **Has every permission** (employees incl. delete, all attendance, payroll, compensation, gov
  reports, devices, company/users/roles, audit, and **all three** access-request stages).
- **Bypasses `CompanyScope`** — can see across companies.
- **Access:** everything.

### hr_admin — HR administrator
- **Can:** `employee.view/create/update`; `attendance.view/view.any/manage/correct`;
  `leave.view/manage_types`; `compensation.view`; `user.manage`; `role.manage`; `audit.view`;
  `device.manage`; `access_request.view` + **HR** approval stage.
- **Cannot:** delete employees; payroll; approve attendance/leave (that's dept_head/supervisor);
  supervisor/IT access stages; `company.manage`.
- **Access:** Employees, Attendance (incl. schedule/holiday editors), Leaves, Users, Devices,
  Access Requests, Account.

### payroll_officer — payroll & government reporting
- **Can:** `employee.view`; `attendance.view`; `payroll.view/run/approve/post`;
  `compensation.view/manage`; `gov_report.view/generate`; `audit.view`.
- **Cannot:** edit employees; attendance admin; approve attendance/leave; manage users/roles; devices.
- **Access:** Employees (view), Attendance (view), Payroll, Account, Dashboard.

### dept_head — the approver
- **Can:** `employee.view`; `attendance.view`; **approve attendance** (`approve.any` + `self_dept`);
  `leave.view` + **approve leaves** (`leave.approve.any`); `access_request.view` + **supervisor** stage.
- **Cannot:** edit employees; attendance admin; payroll; manage users/roles; HR/IT stages.
- **Access:** Employees (view), Attendance (view), Leaves, Request Access, Access Requests, Account.

### supervisor
- **Can:** `employee.view`; `attendance.view/view.any`; approve attendance (`approve.any`+`self_dept`);
  `leave.view` + `leave.approve.any`; `access_request.view` + **supervisor** stage.
- **Cannot:** edit employees; attendance admin; payroll; users/roles.

### team_lead
- **Can:** `employee.view`; `attendance.view` + `attendance.approve.self_dept`; `leave.view`;
  `access_request.view` + **supervisor** stage.
- **Cannot:** see all attendance; approve outside own dept; edit employees.

### dept_admin
- **Can:** `employee.view/update`; `attendance.view/view.any/manage`; `leave.view`.
- **Cannot:** create/delete employees; approve anything; correct attendance; payroll.

### timekeeper
- **Can:** `attendance.view/view.any/manage/correct`.
- **Cannot:** see employees module; leaves; approvals; payroll.

### hr_coordinator
- **Can:** `employee.view`; `attendance.view/view.any`; `leave.view`;
  `access_request.view` + **HR** stage.
- **Cannot:** edit employees; attendance admin; approvals (beyond HR access stage).

### transport_access
- **Can:** `employee.view`; `attendance.view/view.any`.
- **Cannot:** anything else (read-only logistics view).

### sales_employee
- **Can:** `attendance.view`; `leave.file`.
- **Cannot:** see others' data; admin modules.

### garahe_teamlead
- **Can:** `employee.view`; `attendance.view/view.any/manage/correct`; `attendance.approve.self_dept`.
- **Cannot:** approve outside own dept; leaves; payroll; users/roles.

### employee — self-service
- **Can:** `leave.file`; view/file **own** attendance requests; see own attendance & dashboard.
- **Cannot:** see others' data; approve anything; access admin modules.
- **Access:** Dashboard, Leaves, My Attendance (needs an employee link), Request Access, Account.

---

## Cross-cutting rules

- **Employee link required** for personal features (My Attendance, dashboard "My stuff", leave
  filing). Accounts with no linked employee (e.g. `itdevice`) see empty / `—` states.
- **`CompanyScope`** auto-filters most models by the actor's `active_company_id`; **it_admin
  bypasses it**.
- **Access requests** can grant extra permissions **directly to a user** on approval
  (`AccessProvisioner`), independent of role — a 3-stage flow: supervisor → HR → IT.
- **Approvals are role-based:** attendance-request and leave approvals come from
  `dept_head` / `supervisor` / `team_lead` / `garahe_teamlead`, not from HR or IT.
