# Permissions & Access Reference

Permissions are **per-company** (Spatie teams, keyed by `company_id`). A user can hold
**multiple roles** and receives the **union** of their permissions. Source of truth:
`backend/database/seeders/PermissionsSeeder.php`. Frontend gates live in
`frontend/src/app/(admin)/layout.tsx` (nav) and `components/RoleGate.tsx` (page guards).

## Permission glossary
| Permission | Unlocks |
|---|---|
| `employee.view/create/update/delete` | Read / add / edit / remove employee records |
| `attendance.view` | See attendance/DTR/time-logs (own only unless `.view.any`) |
| `attendance.view.any` | See everyone's attendance |
| `attendance.manage` | Schedules, holidays, shift adjustments, create time-logs, recompute DTR, file/cancel for others |
| `attendance.correct` | Apply attendance corrections |
| `attendance.approve.any` / `.self_dept` | Approve OT/UT/OB/COA/correction requests |
| `leave.view / file / approve.any / manage_types` | See leaves / apply / approve / edit leave types |
| `payroll.view/run/approve/post` | Payroll lifecycle (UI not built yet) |
| `compensation.view/manage`, `gov_report.view/generate` | Compensation, government reports |
| `company.manage`, `user.manage`, `role.manage`, `audit.view` | Org settings, user accounts, role assignment, audit log |
| `access_request.view` + `approve.supervisor/hr/it` | 3-stage access-request workflow |

## Role × capability

### super_admin — global administrator
- **Can:** all Employees/Payroll/Compensation/Gov-report/Company/Users/Roles/Audit; view all attendance; corrections; file own leave; manage leave types.
- **Cannot (deliberate):** `attendance.manage` (HR-only); approve attendance/leave (dept_head only); the access-request workflow.
- **Access:** all nav except Request Access; **blocked from Work-schedules & Holidays pages**.

### hr_admin — HR administrator
- **Can:** view/create/update employees; full attendance admin (`manage`, `view.any`, `correct`); view leaves + manage types; view compensation; manage users & roles; audit; approve **HR** access-request stage.
- **Cannot:** delete employees; payroll; approve attendance/leave; supervisor/IT stages; company.manage.
- **Access:** Employees, Attendance (incl. schedule/holiday editors), Leaves, Users, Access Requests, Account.

### hr_manager — HR (day-to-day)
- **Can:** view employees; attendance admin (`manage`, `view.any`); view leaves; view compensation; manage users; audit.
- **Cannot:** create/update/delete employees; manage roles or leave types; approve requests; payroll; access-request approvals.
- **Access:** Employees (view), Attendance (incl. schedule/holiday editors), Leaves, Users, Account.

### it_admin — IT
- **Can:** manage users; approve **IT** access-request stage; audit.
- **Cannot:** Employees/Attendance/Leaves/Payroll; edit schedules/holidays; approve attendance/leave.
- **Access:** Users, Access Requests, Account, Dashboard.

### payroll_officer — payroll & gov reporting
- **Can:** view employees + attendance; payroll run/approve/post; compensation view/manage; gov reports; audit.
- **Cannot:** edit employees; attendance admin; approve attendance/leave; manage users/roles; access requests.
- **Note:** payroll UI is not built yet — permissions exist, screens don't.
- **Access:** Employees (view), Attendance (view), Account, Dashboard.

### dept_head — the approver
- **Can:** view employees + attendance; approve attendance (`approve.any/self_dept`); approve leaves (`approve.any`); view leaves; create access requests + approve **supervisor** stage.
- **Cannot:** edit employees; attendance admin; payroll; manage users/roles; HR/IT stages.
- **Access:** Employees (view), Attendance (view), Leaves, Request Access, Access Requests, Account.

### employee — self-service
- **Can:** file leave; view/file own attendance requests; see own attendance & dashboard.
- **Cannot:** see others' data; approve anything; access admin modules.
- **Access:** Dashboard, Leaves, My Attendance (needs employee link), Account.

## Cross-cutting rules
- **Employee link required** for personal features (My Attendance, dashboard "My stuff", leave filing). Accounts with no employee (e.g. `itdevice`, `hr@`) see empty/`—` states.
- **Work-schedules & Holidays pages** are UI-gated to `hr_admin` + `hr_manager` only — even super_admin is blocked.
- **Access requests** can grant extra permissions directly to a user on approval (`AccessProvisioner`), independent of role.
