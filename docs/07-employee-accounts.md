# 07 — Giving Employees Login Accounts

How to give employees a login so they can clock in on the web, file leave/overtime, and
see their own records. Everything below already exists in the app — this is the operating
procedure, not a feature request.

> **Who can do this:** a user with the **`user.manage`** permission (IT admin / HR admin).
> Accounts are always created for an **employee record** — the person must exist under
> **Employees** first, with the right **company**.

---

## The three ways (pick per situation)

| Method | Use when | Employee needs email? | Who sets the password |
|---|---|---|---|
| **A. Bulk invite** | Onboarding many people at once | ✅ Yes | The employee (via link) |
| **B. Single invite** | One new hire | ✅ Yes | The employee (via link) |
| **C. Provision directly** | No email / shop-floor / on the spot | ❌ No | You (temp password) |

**Rule of thumb:** use **A** for the mass rollout of everyone who has an email, and **C**
for the handful without one.

---

## Method A — Bulk invite (mass rollout)

Sends each selected employee an email with a link to set their own username + password.

1. Log in as an admin. Top bar → **switch to the company** you're onboarding (e.g. NBC).
2. Go to **Employees**.
3. Set the filter to **Active** (chip at the top) so you don't invite resigned staff.
4. Tick the **checkbox in the table header** to select everyone invitable on the page
   *(employees who already have an account can't be selected).*
5. A bar appears at the bottom: **"N employees selected" → click "Send invitations."**
6. A toast reports **Sent / Skipped**, and anyone without an email is listed as skipped.
7. **Page through and repeat** — the list is paginated and invites go **max 100 at a time**.

Do this **once per company**: NBC · PASEI · PMAI · Meatplus.

> **⚠️ Email sending limit.** Invites are sent from a **Gmail account**, which caps at
> roughly **500 emails/day** and may land in **Spam**. With ~400 employees, **spread the
> rollout over two days** and tell staff to check their spam folder. The invite link is
> valid for **72 hours** — send it when people can act on it (not right before a weekend).

---

## Method B — Single invite (one new hire)

1. **Employees → open the person → "Login access"** card.
2. Under **"Send invitation email"**, optionally type an override email, then **"Send invite."**
3. They get the same set-your-own-password link (expires in 72 h).

---

## Method C — Provision directly (no email needed)

Creates the account immediately and shows you a **temporary password once** — hand it to
the employee on paper. Best for floor workers who don't use email.

1. **Employees → open the person → "Login access"** card.
2. Under **"Provision directly"**, click **"Provision login."**
3. The screen shows the **email/username and a temporary password** — **copy it now, it's
   shown only once.** Give it to the employee.
4. They log in and should change the password (see below).

> For the **11 PASEI employees without an email on file**, either add an email and use
> Method A, or use Method C and hand out credentials.

---

## After the account exists

- **Employee logs in** at `http://allcompanyhris.meatplus.ph` with their username +
  password.
- **They get the `employee` role** automatically and are attached to their own company.
- **Forgot password?** Employees → open the person → **"Login access" → "Send password
  reset."** (Method C users who want to change theirs can use the same reset.)

---

## Checking progress

On the **Employees** list, the **access column** shows each person's status:

- **Active** — account exists, they can log in.
- **Invited** — invitation sent, not yet accepted.
- *(blank)* — no account yet.

Filter/scan for **blank** to see who still needs one, and for **Invited** to see who hasn't
clicked their link (re-invite after 72 h if it expired).

---

## Quick troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "No email for X — skipped" | Employee has no email on file | Add an email, or use **Method C** |
| Invite never arrived | Gmail spam, or daily send cap hit | Check spam; resend next day; or use **Method C** |
| Link says expired/invalid | Past 72 h, or already used | Re-invite (Method B) |
| Can't select someone in bulk | They already have an account | Nothing to do — they're set |
| Employee not in the list | Wrong company selected, or inactive | Switch company; check the **Active** filter |

---

*Reference: bulk invite `POST /employees/bulk-invite` (max 100), single invite
`POST /employees/{id}/invite`, direct provision `POST` via the "Provision login" button;
accept flow at `/invite/{token}`. See [03-permissions.md](03-permissions.md) for roles.*
