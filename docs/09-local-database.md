# Databases & backups

> **Live database:** **Supabase Postgres** (`ap-southeast-1`). Both the Render web app
> and the backend on the office PC read and write it. It is the single source of truth.

---

## Why the office PC still runs a backend

The ZKTeco MB460 pushes punches to `/iclock/cdata` over plain HTTP on the LAN. It cannot
reach Render, and it cannot talk to Supabase. So the office PC keeps running the Laravel
backend (`start-servers.ps1`, autostarted at logon) pointed at **Supabase**.

```
ZKTeco device ──LAN──► office PC : Laravel ──┐
                                             ├──► Supabase (source of truth)
staff browser ──────► Render : Next.js ──────┘        │
                              Render : Laravel ───────┘
```

The device writes through the PC; everyone reads from Supabase. If the PC is off, the
website stays up — only new punches wait.

**A cloud service cannot reach a database on the office PC.** That is why the database
must live in the cloud for the site to be online. Exposing MySQL through the router would
publish employee payroll to the internet, and would make every Render query cross the
Pacific twice.

---

## What is on the office PC

| Port | Server | Contains | Live? |
|---|---|---|---|
| — | Supabase (cloud) | the real database | **yes** |
| 3306 | Laragon **MySQL 8.4.3** | `meatplus_hris` — offline copy, 2026-07-10 | no |
| 5433 | PostgreSQL 17.6 (portable) | `meatplus_hris` — offline copy, 2026-07-10 | no |
| 5432 | `postgresql-x64-18` service | pre-existing, unrelated | no |

Both local copies are **frozen snapshots**, not replicas. Nothing syncs them. They exist
because the app was briefly run on each while moving the data around, and they are useful
as a same-day restore point.

`backend/.env` holds all three connection blocks; the active one is uncommented. Ignore
the empty `hris` and `my_supabase_import` databases in HeidiSQL — abandoned imports.

Laragon's Start/Stop button controls MySQL only; it has no PostgreSQL support, so the
5433 server must be started by hand:

```
C:\laragon\bin\postgresql\pgsql\bin\postgres.exe -D C:\laragon\data\postgresql-17 -p 5433
```

---

## Backups

```
.\backup-db.ps1               # dumps whatever backend/.env currently points at
.\backup-db.ps1 -KeepDays 30  # prune dumps older than 30 days (default 14)
```

Dumps land in `.\backups\`, which is **gitignored** — they contain employee names, salaries
and government IDs, and must never be committed.

The script reads the active `DB_*` lines from `backend/.env`, so it backs up Supabase when
Supabase is active and MySQL when MySQL is. It uses `mysqldump` or `pg_dump` accordingly,
and fails loudly if the dump comes out suspiciously small.

### Restoring

MySQL:
```
mysql.exe -u root meatplus_hris < backups\meatplus_hris-<stamp>.sql
```

Postgres / Supabase:
```
pg_restore.exe -h <host> -p <port> -U <user> -d <db> --no-owner --no-privileges backups\<file>.dump
```

**Verify a backup by restoring it**, not by checking the file exists. A dump was restored
into a scratch database on 2026-07-10 and produced 113 employees, 8 users, 127 time logs.

### What is not covered

Nothing is scheduled. Someone must run `backup-db.ps1`, or it must be registered as a
task. Supabase's free tier provides no point-in-time recovery.

---

## Two portability traps

Recorded because they cost real time, and will recur if the database ever moves again.

**MySQL string comparison is case-insensitive** (`utf8mb4_unicode_ci`). So
`KenthCondez@meatplus.com` and `kenthcondez@meatplus.com` are the *same* value and collide
on `users.users_email_unique`. PostgreSQL treats them as distinct — which is how two such
accounts came to exist. Moving to MySQL required storing one as
`KenthCondez@meatplus.com.dup4`.

**`ILIKE` does not exist in MySQL.** `App\Http\Controllers\Controller::likeOperator()`
returns `ilike` on `pgsql` and `like` elsewhere. Any query that hardcodes `ilike` breaks on
MySQL; always go through that helper.

---

## Related

- Schema reference: [02-database-schema.md](02-database-schema.md)
- The original cloud migration: [05-supabase-migration.md](05-supabase-migration.md)
- Biometric device setup: [06-biometric-zkteco.md](06-biometric-zkteco.md)
