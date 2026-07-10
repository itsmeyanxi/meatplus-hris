# Local database (Laragon MySQL)

> **Live database as of 2026-07-10:** **MySQL 8.4.3**, database **`meatplus_hris`**,
> on the office PC, managed by Laragon. Supabase is **no longer written to**.

---

## What runs where

| Port | Server | Holds | Used by the app? |
|---|---|---|---|
| **3306** | Laragon **MySQL 8.4.3** | `meatplus_hris` — **the live database** | **Yes** |
| 5433 | PostgreSQL 17.6 (portable) | `meatplus_hris` — snapshot taken from Supabase | No — kept as a restore point |
| 5432 | `postgresql-x64-18` Windows service | pre-existing, unrelated | No |

Laragon's **Start/Stop** button and its **Database** button control MySQL only. Laragon
has no PostgreSQL support, so the 5433 server must be started by hand (see below).

Connection settings live in `backend/.env`. The Supabase and PostgreSQL blocks are kept
commented directly beneath the active one — switching back is a one-edit change.

```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=meatplus_hris
DB_USERNAME=root
DB_PASSWORD=
```

Ignore the `hris` and `my_supabase_import` databases in HeidiSQL. They are empty
leftovers from an abandoned import.

---

## How the data got here

1. `pg_dump` of the Supabase `public` schema (58 tables) → restored into a local
   PostgreSQL **17.6** cluster (same version as Supabase, so the restore is exact).
2. `php artisan migrate` built the schema on MySQL.
3. Every row was copied PostgreSQL → MySQL (650 rows across 57 tables).

The PostgreSQL copy on 5433 is left in place deliberately: it is the closest thing to a
backup of what came out of Supabase.

### Starting the PostgreSQL snapshot server

Not needed day to day. Only to read the snapshot or switch back to it.

```
C:\laragon\bin\postgresql\pgsql\bin\postgres.exe -D C:\laragon\data\postgresql-17 -p 5433
```

User `postgres`, password `postgres`, database `meatplus_hris`.

---

## Two portability traps this move exposed

**MySQL string comparison is case-insensitive.** The collation is
`utf8mb4_unicode_ci`, so `KenthCondez@meatplus.com` and `kenthcondez@meatplus.com` are
the *same* value and collide on `users.users_email_unique`. PostgreSQL treats them as
distinct. One soft-deleted duplicate had to be stored as
`KenthCondez@meatplus.com.dup4` to fit the index.

Expect this any time a "duplicate" account differs only by letter case.

**`ILIKE` does not exist in MySQL.** `App\Http\Controllers\Controller::likeOperator()`
returns `ilike` on `pgsql` and `like` elsewhere; MySQL's `LIKE` is already
case-insensitive. Any new query that hardcodes `ilike` will break on MySQL — always go
through that helper.

---

## Backups

**There are none.** The database is a directory on one PC:

```
C:\laragon\data\mysql-8.4
```

If that disk fails, the employees, attendance and payroll are gone. Supabase is now a
stale snapshot, not a live backup — nothing writes to it anymore.

A manual dump:

```
C:\laragon\bin\mysql\mysql-8.4.3-winx64\bin\mysqldump.exe -u root meatplus_hris > backup.sql
```

---

## Related

- Schema reference: [02-database-schema.md](02-database-schema.md)
- The Supabase migration this replaced: [05-supabase-migration.md](05-supabase-migration.md) (historical)
