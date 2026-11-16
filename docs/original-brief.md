# Family Pocket Money App — Spec & Build Prompt

Nov 16, 2026 · @Racecar Foundation

## What the app is

A family pocket-money app that teaches kids cause and effect: doing a chore earns money, leaving it undone costs money, and saving makes money grow. It runs in the phone's web browser and can be added to the home screen on Android and iPhone, so there is no app-store release.

- **Who uses it:** 1 to 4 parents or guardians per family, plus their kids.
- **What the money is:** a virtual balance (a ledger). Parents pay out real cash or transfers when a kid "withdraws". The app never touches real bank accounts.
- **The lesson:** every change in a kid's balance has a visible reason, so kids can see *why* their money went up or down.

Working name: *Pocket Money* (change it freely).

## Users, roles and login

Each family is one shared "household". Up to 4 parents manage it; any number of kids belong to it.

| Role | How they log in | What they can do |
| --- | --- | --- |
| Parent (owner) | Email + password, or Google/Apple sign-in | Everything, plus invite or remove other parents and delete the household |
| Parent (co-parent, up to 3 more) | Email invite link, then own login | Create chores, approve or reject, add bonuses and fines, change rules, pay out |
| Kid | Pick their avatar on a shared family device, then a 4-digit PIN (no email needed) | See balance, tick off chores, move money to savings, ask to spend, set goals |

- Any one parent can approve; the app records **which** parent did each action, so parents in different homes stay in sync.
- Optional setting: big changes (fines over a set amount, rule changes) need a second parent to agree.
- Kids never see other families and cannot change their own balance directly.

## Core features

The app has six parts. Each kid has two pots: **Spending** (money ready to use) and **Savings** (the "bank").

1. **Chores and tasks**
   - Parents create a task: name, reward amount, fine if not done, due date/time, and repeat (once, daily, weekly, chosen days).
   - Kid marks it done, optionally with a photo. A parent approves (money paid in) or sends it back with a note.
   - If the due time passes and it is not done, the fine is taken off automatically (parents can undo within 24 hours).
2. **Bonuses and fines**
   - One-off extra money for going beyond (e.g. helped a neighbour) or a fine for a broken house rule, always with a written reason the kid can read.
3. **Saving (the bank)**
   - Kid moves money from Spending to Savings any time.
   - Savings earn interest set by parents (for example 5% per month, paid weekly), so kids watch money grow.
   - Taking money out of Savings needs a parent's OK, or waits a set number of days.
4. **Spending**
   - Kid sends a "spend request" (what and how much). A parent approves and pays out cash or a transfer in real life; the app takes it off the balance.
5. **Goals**
   - Kid sets a goal (e.g. bike, €120) with a picture. A progress bar shows how close they are and how many weeks to go at their current pace.
6. **History and weekly summary**
   - A simple timeline of every money change with its reason, who approved it and the date.
   - A weekly card per kid: earned, lost, saved, spent, plus the one chore that cost the most. This is the main cause-and-effect teaching screen.

Also: currency setting (EUR, ZAR, etc.), notifications for due chores and approvals, and a parent dashboard showing all kids at a glance.

## How money moves

Money only changes for a reason the kid can read, and only parents or the app's timed rules can add or take it away.

&#91;embedded content: how money moves · 3 causes, 2 pots, 2 effects\]

Kids can move their own money between pots, but they can never give themselves rewards or remove fines. Parents choose whether Spending may go below zero; if not, fines stop at zero and the rest shows as "owed".

## Tech approach

Build it as a Progressive Web App (PWA): one website that works on any phone and can be "installed" to the home screen. Suggested stack below; swap parts if your build tool prefers others.

| Part | Suggested choice | Why |
| --- | --- | --- |
| Front end | Next.js (React) + TypeScript + Tailwind CSS | Mobile-first screens, widely supported by AI builders |
| Back end + database | Supabase (Postgres, login, file storage) | Login, data and photo uploads in one place; row-level security keeps each family's data separate |
| Scheduled jobs | Supabase scheduled functions (cron) | Auto-fines for missed chores, weekly interest, weekly summaries |
| Hosting | Vercel or Netlify | Free tier is enough to start |
| Notifications | Web push | Works on Android; on iPhone only when the app is added to the home screen (iOS 16.4 or newer) |

Things to be honest about:

- A PWA cannot be found in the App Store or Play Store. Parents add it from the browser.
- Kids' data needs care. Store first names and avatars only, no kid emails, and let parents delete everything. If you offer it publicly in the EU, GDPR rules on children's data apply; get proper advice before launch.

## Data model

The key rule: balances are never typed in directly. Every change is a row in **transactions**, and a balance is the sum of its rows. That makes the history trustworthy.

| Table | Main fields |
| --- | --- |
| households | id, name, currency, settings (interest rate, allow negative balance, second-parent approval, savings lock days) |
| parents | id, household\_id, user\_id (login), display\_name, role (owner / co-parent) |
| kids | id, household\_id, first\_name, avatar, pin\_hash, birth\_year (optional) |
| tasks | id, household\_id, kid\_id, title, reward, penalty, due\_at, repeat\_rule, needs\_photo, active |
| task\_instances | id, task\_id, kid\_id, due\_at, status (open / submitted / approved / rejected / missed), photo\_url, decided\_by, decided\_at |
| transactions | id, kid\_id, pot (spending / savings), amount (+/−), type (chore\_reward, missed\_fine, bonus, fine, transfer, interest, spend, withdrawal), reason, task\_instance\_id, created\_by, created\_at |
| requests | id, kid\_id, type (spend / savings\_withdrawal), amount, note, status, decided\_by |
| goals | id, kid\_id, title, target\_amount, image\_url, done\_at |
| audit\_log | id, household\_id, actor, action, details, created\_at |

Store money as whole cents (integers), never as decimals, to avoid rounding errors.

## Build plan

Build in four rounds, and test each with your own family before the next. Give your build tool the full prompt below, then ask for one phase at a time.

1. **Phase 1 — Foundations:** household sign-up, parent login, invite co-parents, add kids with PIN login, the transactions ledger, balances on screen.
2. **Phase 2 — Chores:** create tasks with reward and fine, repeat rules, kid marks done, parent approves or rejects, automatic fine for missed tasks.
3. **Phase 3 — Bank and spending:** move money to savings, weekly interest, withdrawal and spend requests, goals with progress bar.
4. **Phase 4 — Teaching and polish:** weekly summary cards, history timeline, notifications, home-screen install, dark mode, currency setting.

After each phase, check: can a kid change their own balance? (must be no) • Does every money change show a reason? • Can family A see family B's data? (must be no).

## The build prompt

Copy everything in the box into Claude Code, Lovable, Bolt, Base44 or a similar AI app builder. Then say "Start with Phase 1".

```text
You are a senior full-stack engineer. Build a mobile-first Progressive Web App called "Pocket Money" that teaches children cause and effect through virtual pocket money.

GOAL
Kids earn money for completed chores, lose money for chores left undone or broken house rules, can save money in a "bank" that earns interest, and can request to spend it. Every balance change must show a clear reason so kids understand why their money went up or down.

PLATFORM
- Responsive web app, installable to the home screen on Android and iPhone (PWA: manifest, service worker, app icons, offline fallback page).
- Stack: Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres, Auth, Storage, scheduled functions), deploy to Vercel.
- Design for 360–430px phone screens first; must also work on tablet and desktop. Large tap targets, friendly colours, kid-readable fonts.

USERS AND ROLES
- Household = one family. Holds currency and rule settings.
- Parents: 1 to 4 per household. Owner creates the household and can invite up to 3 co-parents by email link. All parents can manage chores, approve/reject, give bonuses and fines, and pay out. Owner can remove parents and delete the household.
- Kids: any number per household. Log in by choosing their avatar then entering a 4-digit PIN (hashed). No email for kids. Kids can only see their own data.
- Optional household setting: actions above a set amount need a second parent to approve.
- Record which parent did every action.

MONEY RULES
- Each kid has two pots: Spending and Savings.
- Money is virtual. Never connect to real bank accounts.
- Store amounts as integer cents. Never store a balance directly: balance = sum of transactions per kid per pot.
- Transaction types: chore_reward, missed_fine, bonus, fine, transfer_to_savings, transfer_to_spending, interest, spend, withdrawal. Each has amount (+/-), reason text, created_by, created_at, and optional task_instance_id.
- Setting: allow negative Spending balance (yes/no). If no, fines stop at zero and the rest is shown as "owed".

FEATURES
1. Chores: parent creates task (title, kid, reward, fine, due date/time, repeat: once/daily/weekly/selected days, photo proof yes/no). Kid marks done (+ photo). Parent approves (reward added) or rejects with a note. If not done by due time, a scheduled job marks it missed and adds the fine. Parent can undo an automatic fine within 24 hours.
2. Bonuses and fines: parent adds a one-off amount with a required reason.
3. Savings bank: kid moves money between pots. Parent sets interest rate (% per month); a weekly job pays interest on Savings. Withdrawals from Savings need parent approval or wait a set number of lock days.
4. Spending: kid creates a spend request (item, amount). Parent approves and the amount is deducted; parent pays out in real life.
5. Goals: kid sets a goal with title, target amount and picture. Show progress bar and estimated weeks to reach it at the current earning pace.
6. History: timeline of all transactions with reason, who approved, and date. Filter by kid, pot and type.
7. Weekly summary card per kid: earned, lost, saved, spent, interest received, and the chore that cost the most. Explain it in simple sentences a 7-year-old can read.
8. Parent dashboard: all kids' balances, pending approvals, today's chores.
9. Notifications (web push): chore due soon, chore submitted, request waiting, weekly summary ready.
10. Settings: currency (EUR default, also ZAR, USD, GBP), interest rate, lock days, negative balance on/off, second-parent approval threshold.

DATA TABLES
households, parents, kids, tasks, task_instances, transactions, requests, goals, audit_log. Use Supabase row-level security so a user can only read and write rows of their own household, and kids can only read their own rows and create submissions, transfers and requests.

SECURITY AND PRIVACY
- Kids can never create reward, bonus, fine or interest transactions; only server-side logic or parents can.
- Store minimal kid data: first name, avatar, optional birth year.
- Parents can export and delete all household data.

HOW TO WORK
- Build in phases and stop after each one so I can test:
  Phase 1: auth, household, parents, invites, kids with PIN, transactions ledger, balances.
  Phase 2: chores, approvals, automatic missed-chore fines.
  Phase 3: savings, interest, requests, goals.
  Phase 4: weekly summary, history, notifications, PWA install, polish.
- Seed demo data: one household, 2 parents, 2 kids, 6 chores, 2 weeks of history.
- Write tests for the money rules (balances, fines, interest, permissions).
- Explain any setup steps I must do myself (Supabase keys, environment variables) in plain English.
```
