# 🟢 Easy Guide: Move the App to Supabase + Laragon

> ⚠️ **PARTLY OUT OF DATE (2026-07-10).** Supabase is still the live database, but the
> paths and ports here are stale. See
> [09-local-database.md](09-local-database.md) for the current database picture.
>
> The Supabase setup steps below remain correct.
> Parts 1 (PHP extensions) and 6 (starting the app) are still accurate.

This guide is written **super simply**. Just follow the steps in order, top to bottom.
Don't skip steps. ✅ = you finished that step.

---

## 🤔 What are we doing? (in plain words)

Right now your app keeps its information (employees, attendance, payroll) inside
**XAMPP** on your computer. We want to move that information to **the internet** so
it's safe and you can use it from anywhere.

Think of it like this:
- **XAMPP / Laragon** = the *engine* that makes your app run on your computer. 🚗
- **The database** = the *notebook* where all the info is written. 📓
- **Supabase** = a notebook that lives **on the internet** instead of on your PC. ☁️

So: we keep the engine on your PC (we'll use **Laragon** instead of XAMPP because
it's nicer), and we move the notebook to the internet (**Supabase**).

---

## 🧰 What you need before starting

- [ ] A computer with internet
- [ ] **Laragon** installed → download from **laragon.org** (get the "Full" version)
- [ ] An email address (to make a free Supabase account)

That's it. Take your time. ☕

---

## Part 1 — Turn on a hidden switch in PHP 🔌

Your app needs a little "plug" to talk to Supabase. Right now it's turned **off**.
We turn it **on**.

1. Open **Laragon**.
2. Click the **Menu** button (or right‑click t  he Laragon window).
3. Go to **PHP → Extensions**.
4. Find **`pdo_pgsql`** and **click it** so it has a check ✔. (Also check `pgsql` and
   **`zip`** — `zip` is needed by the employee-import library, and `composer install`
   fails without it.)
5. Click **Menu → Apache/Nginx → Reload** (or just restart Laragon).

**How to know it worked:** open Laragon's **Terminal** (Menu → Terminal) and type:
```
php -m
```
Press Enter. In the long list, you should see **`pdo_pgsql`**. If you do — ✅ done!

> 😟 Don't see it? Don't worry — go to Part 1 again and make sure you clicked
> Reload after checking the box.

---

## Part 2 — Make your online notebook (Supabase) ☁️

1. Go to **supabase.com** and click **Start your project** / **Sign in** (free).
2. Sign in with your email (or Google/GitHub).
3. Click **New project**.
4. Fill in:
   - **Name:** `meatplus-hris`
   - **Database Password:** make a strong one and **WRITE IT DOWN** somewhere safe. 🔑
     (You will need it later. Don't lose it!)
   - **Region:** pick **Singapore** (it's closest to the Philippines = faster).
5. Click **Create new project** and **wait ~2 minutes** while it gets ready. ⏳

When it's done:
6. On the left, click the **gear ⚙️ (Project Settings)** → **Database**.
7. Look for **Connection info**. You'll see things like **Host**, **Port**,
   **User**, **Database name**. **Keep this page open** — we copy from it next.

✅ You now have an online notebook!

---

## Part 3 — Tell the app where the online notebook is 📝

We write the Supabase details into one settings file.

1. In your project folder, open the **`backend`** folder.
2. Find the file named **`.env`** (just `.env`, nothing after it). Open it with
   Notepad or VS Code.
3. Find the lines that start with `DB_` and **change them to look like this**
   (copy the values from the Supabase page you kept open):

```
DB_CONNECTION=pgsql
DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com
DB_PORT=5432
DB_DATABASE=postgres
DB_USERNAME=postgres.YOUR-PROJECT-REF
DB_PASSWORD=THE-PASSWORD-YOU-WROTE-DOWN
DB_SSLMODE=require
```

> 🟡 **EASIEST WAY:** In Supabase, click the **Connect** button at the top → choose
> **Session pooler** → it shows the exact **Host** and **Username** to copy. Use those.

- The **Username must include your project ID**, e.g. `postgres.emkcwukiqxnvcbhkjiqz`.
  Just `postgres` alone fails with "no tenant identifier" (see the help table).
- Replace `THE-PASSWORD-YOU-WROTE-DOWN` with **your** database password.

4. **Save** the file.

> 🔑 `DB_CONNECTION=pgsql` is the magic line — it tells the app "use the internet
> notebook (Postgres), not the old one (MySQL)."

✅ Saved!

---

## Part 4 — Build the pages of the notebook 📔

> ⚠️ **Only do this for a brand-new, empty Supabase project.**
> If you are setting up a second computer that points at the **existing** Supabase
> database, the tables and data are already there. Check first with:
>
> ```
> php artisan migrate:status
> ```
>
> If it says nothing is pending, **skip this whole Part**. Running `db:seed` against the
> live database re-runs the seeders on real data — it can duplicate or overwrite
> employees. Only `migrate --force` (never `db:seed`) is safe on a database in use, and
> only when migrations are actually pending.

The online notebook is **empty** right now. We tell the app to draw all the tables
and add the starting info (companies, roles, sample logins).

1. Open Laragon's **Terminal** (Menu → Terminal).
2. Type these **one at a time**, pressing Enter after each, and wait for each to finish:

```
cd "C:\Users\ALL COMPANY HRIS\Documents\meatplus-hris\backend"
```
```
composer install
```
```
php artisan config:clear
```
```
php artisan migrate --force
```
```
php artisan db:seed --force
```

- `migrate` = draws all the empty tables. 📐
- `db:seed` = fills in the starting info. 🌱

**If you see green text / "DONE"** — ✅ it worked!

> 😟 See red text that says **"could not find driver"**? That means Part 1 didn't
> stick. Go back to Part 1 and turn on `pdo_pgsql`.
>
> 😟 See red text about **"connection"** or **"SSL"**? Double‑check Part 3 — the
> Host or Password is probably mistyped. (Make sure `DB_SSLMODE=require` is there.)

---

## Part 5 — Put your employees back in 👥

Your employee list lives in your CSV/Excel file. Let's load it into the new notebook.

1. Start the app (see Part 6).
2. Log in as the boss account:
   - Email: `itdevice@meatplus.ph`
   - Password: `Pass@456`
3. Go to **Employees → Import**, choose your CSV/Excel file, click **Import**.

✅ Employees are back!

---

## Part 6 — Turn the app on 🟢

**The easy way.** Open a PowerShell window in the project folder and run:

```
.\start-servers.ps1
```

It starts both the backend and the frontend, waits for the backend to answer before
starting the frontend, and writes output to the `logs\` folder. Running it twice is
safe — it skips whatever is already running.

Want it to start by itself every time you sign in to Windows? Run this once:

```
.\register-autostart.ps1
```

**The manual way** (if you'd rather see two windows). Open **two** terminals in Laragon:

**Terminal 1 — the brain (backend):**
```
cd "C:\Users\ALL COMPANY HRIS\Documents\meatplus-hris\backend"
php artisan serve --host=0.0.0.0 --port=8000
```

**Terminal 2 — the screen (frontend):**
```
cd "C:\Users\ALL COMPANY HRIS\Documents\meatplus-hris\frontend"
npm run dev -- -p 3001
```

Now open your web browser and go to:
```
http://localhost:3001
```

> 🔴 It must be **port 3001**, not 3000. Only `:3001` is listed in
> `SANCTUM_STATEFUL_DOMAINS`, so on port 3000 the login page loads but signing in fails.

Log in with `itdevice@meatplus.ph` / `Pass@456`. 🎉

---

## 🎯 How to know EVERYTHING worked

- [ ] You can log in.
- [ ] You can see the **Employees** list.
- [ ] You can open **Payroll** and **Attendance** without errors.
- [ ] In Supabase (the website) → **Table Editor**, you can see tables like
  `employees`, `time_logs`, `payslips` with rows in them.

If all 4 are checked — **you did it!** 🥳 Your data now lives on the internet.

---

## 🆘 Quick help (red text = problem)

| You see… | What it means | Fix |
|---|---|---|
| `could not find driver` | The Postgres plug is off | Redo **Part 1** |
| `no tenant identifier provided` | Username is missing your project ID | Set `DB_USERNAME=postgres.YOUR-PROJECT-REF` (**Part 3**) |
| `connection refused` / `SSL` | Wrong host/password in `.env` | Recheck **Part 3** |
| `password authentication failed` | Wrong DB password | Use the password from **Part 2** |
| `too many connections` | Free plan is busy | In Supabase use the **Session Pooler** host/port (Settings → Database) in **Part 3** |

---

## 🧠 Remember

- **Laragon** = runs the app on your PC (instead of XAMPP).
- **Supabase** = keeps your data on the internet (instead of MySQL on your PC).
- The magic switch is the line **`DB_CONNECTION=pgsql`** in the `.env` file.
- Keep your **Supabase password** safe — you need it if you ever set this up again.

That's everything. One step at a time, you've got this. 💪
