# Pocket Money — Family App Specification v2

Working name: **Pocket Money** (rename freely — one constant in `src/lib/brand.ts`).
Date: 16 Nov 2026 · Owner: Steve · Status: v2 (original brief + voice notes of 16 Nov)

## 1. Purpose

A private family app that teaches kids **cause and effect**: doing what you said you would earns money, time or points; leaving it undone costs you. Saving is rewarded; blowing everything at once is not.

It is also a place to **share family life**: reminders, important dates, emergency info and challenges that go both ways — kids can challenge parents too. It is a partnership, not a punishment app.

It runs in the phone browser and can be added to the home screen (PWA). There is no app-store release and the app never sends emails.

## 2. Who uses it

A **family network** is one shared space. Blended and divorced families are the normal case: several households, several sets of parents and step-parents.

| Role | Typical person | Can do |
| --- | --- | --- |
| Owner | The adult who created the family | Everything, including adding or removing adults and deleting the family |
| Parent / Step-parent / Guardian ("managers") | Mum, Dad, step-parents, carers (no fixed limit; 4–8 is normal) | Add kids and grandparents, create chores and challenges with rewards and penalties, approve or send back, bonuses and fines, approve requests, change family rules |
| Grandparent | Grandma, Grandpa | See the kids' progress, give **gifts** (positive only), create events and reminders, set fun challenges (text and points rewards only) |
| Kid | Children of any age | See their own wallet, do tasks with photo evidence, move money to savings, ask to spend or use time, set savings goals, challenge anyone in the family (text and points rewards only), create events |

Rules:

- Every action records **who** did it, so adults in different homes stay in sync.
- Kids can never change their own balance or reward themselves; only managers (and the app's own timed rules) can.
- Kids see their own money and tasks. Everyone sees the family calendar, the member list and the emergency profile cards.

## 3. Joining with a QR code (no email)

1. An adult opens **Family → Add member**, types the name and picks the role.
2. The phone shows a **QR code** and a short code. It works once and expires after 30 minutes.
3. The new member scans it with their phone camera. The app opens, they confirm "Join the Marks family as Sam?" and they are in.
4. The same flow re-connects a lost or new phone: **Family → member → Connect a device** makes a fresh QR for that person.

After joining, each person can choose how they sign in next time (**Me → Sign-in**):

- **Google account** (most of the family has one)
- **Username + password** (no email needed)
- **Just this device**, protected by an optional **PIN or pattern lock**

The app nudges unsecured accounts ("Secure your account so you don't lose your money") because a lost phone without a linked sign-in can only be recovered with a new QR code from a parent.

## 4. The three currencies

| Currency | Unit | Pots / labels | Examples |
| --- | --- | --- | --- |
| **Money** | Whole cents | **Spending** and **Savings** pots; labels: pocket, extra, reward, prize, gift | €2 for the dishes, €5 prize for a full week |
| **Time** | Minutes | One time bank; labels: Wi-Fi, game, fun | 30 min game time for homework done |
| **Points** | XP | Levels up the kid's character | 10 points per chore |

- The point values are **editable by the parents** per task, per bonus and per target.
- Money is virtual: a ledger. Parents pay out real cash or transfers when a spend request is approved.
- Balances are never typed in. Every change is a ledger row with a readable reason, who did it and when.
- A negative spending balance shows as **"owes"** (for example, "Sam owes €1.50").

## 5. Features

### 5.1 Tasks (chores) and challenges

- **Chores** are set by managers: title, who, reward (money, time, points), penalty if not done (money, time), due date and time, repeat (once, daily, weekdays, weekly, chosen days) and evidence rule.
- **Challenges** can be set by **anyone for anyone**: parent → kid, kid → parent, grandparent → kid, or a **partnership** (choose several people, for example Dad and Sam both do it). Only managers can attach money or time; kids and grandparents attach a reward in words ("I'll make you breakfast") plus points.
- **Evidence:** optional *before* photo and optional *after* photo, plus a note. By default at least one photo is required. Managers can relax this per task to "photo or note" or "none".
- **Approval:** any manager who is not the doer, or whoever created the challenge. Approve pays the rewards. **Send back** returns it with a note to try again.
- **Missed:** when the due time passes and the task is still open, the penalty is applied automatically. A manager can **excuse** it (for example, the kid was ill) and the penalty is reversed.

### 5.2 Spotted — rewards, consequences and gifts

The parent sees something, good or bad, and records it on the spot:

1. Tap **Spotted** (the camera button) and take a photo (optional).
2. Pick the child.
3. Choose **➕ Reward** or **➖ Consequence** (a consequence in money is a *fine*).
4. Set money, time and/or points, plus a reason the child can read ("Left the bike in the rain").

The same screen without a photo is a plain bonus or fine. Grandparents can only give **gifts** (reward only). Any ledger row can be reversed by a manager with a reason, so mistakes are fixable but never hidden.

### 5.3 Savings and goals

- Kids move money from Spending to Savings at any time.
- **Interest:** parents set a rate (% per month). It is paid weekly on the savings balance.
- **Saver bonus:** points when savings grew this week.
- **No-savings rule:** if a kid earned money in a week but ended it with nothing saved and nothing left, an optional points penalty applies.
- Taking money out of savings needs a manager's OK (a **withdraw request**).
- **Savings goals:** title, target amount, emoji, progress bar and "about N weeks to go at your current pace".

### 5.4 Requests

- **Spend:** "I want to buy X for €Y". When a manager approves, the money comes off Spending and the parent pays out in real life.
- **Withdraw savings:** moves Savings to Spending once approved.
- **Use time:** "30 minutes of game time now". When approved, the minutes come off the time bank.

### 5.5 Targets and prizes

Per kid, weekly or monthly: "complete at least 80% of tasks", "earn at least €10" or "collect 100 points". When the period ends and the target was met or beaten, the prize (money, time, points and/or words) is paid automatically.

### 5.6 Tallies — weekly, monthly and year to date

Each kid's wallet shows three tallies: **This week**, **This month** and **Year to date**.

- Earned, lost, saved, spent and interest (money)
- Time earned, lost and used
- Points
- Tasks done and missed
- **This week only:** the *possible* earnings (all rewards of this week's tasks), so a kid sees the minimum they can reach and that extra effort gets them more

### 5.7 Family calendar, reminders and important things

Events, reminders and birthdays, either for everyone or for chosen people, with a repeat option (weekly, monthly or yearly). The home screen shows today's and upcoming items so nothing important is forgotten. Push notifications follow in phase 5.

### 5.8 Profiles and emergency card

Name, avatar (emoji or photo), birthday, phone number, height, blood type, allergies, medication, medical notes, doctor, school, emergency contacts, and a **Life360** link (link only — Life360 has no public API). Everyone in the family can see the emergency card; each person and the managers can edit it.

### 5.9 Devices

Managers keep a list of the family's phones, tablets, Xboxes, PCs and TVs: name, owner, type, model, phone number, MAC/IP (optional) and notes.

> **Honest limit:** a web page cannot scan the home Wi-Fi network. Options for later: a small "home agent" script on a home PC that lists the devices on the network and sends them to the app, or the router's own API (UniFi, Google/Nest, Fritz!Box and so on). See section 9.

### 5.10 Themes, characters and avatars

Each person picks an accent colour, light or dark mode, and a **character** (fox, dragon, robot, unicorn, panda, dino, rocket, cat, owl, shark). The character levels up with points. It is a skin only, so the features are identical for everyone. Parents can pick the plain "Classic" look.

## 6. Screens (mobile first, 360–430 px)

Bottom navigation: **Home · Tasks · Money · Calendar · Family**. "Me" sits on the avatar at the top right.

| Screen | Kid sees | Manager sees |
| --- | --- | --- |
| Home | Character and level, balances (spending, savings, time), today's tasks, goal progress, reminders | All kids at a glance, **waiting for approval** count, today's tasks, upcoming events |
| Tasks | My tasks (today, upcoming, done), challenges I set, "do it" with photo capture | All tasks by person, create a chore or challenge, approvals queue |
| Money | Wallet: pots, tallies (week/month/YTD), history with reasons, move to savings, requests, goals | Pick a kid: same wallet plus bonus/fine, approve requests, reverse a ledger row, targets |
| Calendar | Upcoming events and reminders, add one | Same |
| Family | Members, emergency cards | Members, add member (QR), connect device, roles, devices, family rules |
| Me | Avatar, theme, character, sign-in methods, app lock, profile | Same plus sign out |

Design rules: large tap targets (44 px minimum), plain language a 7-year-old can read, colour plus icon plus text for every state (never colour alone), and photos compressed on the phone before upload.

## 7. Architecture

```
Phone browser (PWA) ──► Cloudflare Pages (static files, free)
        │
        └──► Supabase (free): Auth · Postgres (all rules in SQL RPCs) · Storage (photos) · pg_cron (timed rules)
```

- **Front end:** Vite, React 19, TypeScript, Tailwind CSS v4, React Router and vite-plugin-pwa. It is a static site, so it can be hosted anywhere.
- **Back end:** Supabase. Every read and write goes through Postgres functions (RPCs) that check *who* you are and *what your role allows*. Tables have row-level security on, with no direct access. Photos are stored in a private bucket, one folder per family.
- **Timed rules:** `tick()` creates the day's task instances, applies missed-task penalties and closes the week (interest, targets, saver rules). pg_cron runs it every 15 minutes, and the app also runs it on open, so it works even before cron is set up.
- **Demo mode:** the same SQL runs **inside the browser** (PGlite, Postgres in WebAssembly) with sample data and a "switch person" picker. Try the app with zero setup; the tests use the same engine.

### Data model (Postgres)

| Table | Purpose |
| --- | --- |
| families | name, currency, time zone, settings (interest, saver rules, privacy) |
| members | family, login (user_id), role, display name, avatar, theme, profile (emergency card) |
| invites | QR/short-code tokens, single use, expiry |
| tasks | chore/challenge definition, rewards, penalties, repeat, evidence rule, creator, assignee |
| task_instances | one per due date: status, before/after photo, note, who decided |
| transactions | **the ledger**: member, currency, pot, amount (+/−), type, label, reason, links, created_by |
| requests | spend / withdraw savings / use time |
| goals | savings goals |
| targets, target_results | period targets and their evaluated results |
| events | calendar, reminders, birthdays |
| devices | device registry |
| period_runs | idempotence for weekly jobs |
| audit_log | who did what |

Money is whole cents and time is whole minutes, so there are no rounding errors.

## 8. Hosting options (all €0)

| Option | Cost | Verdict |
| --- | --- | --- |
| **Cloudflare Pages + Supabase** | €0. Unlimited static bandwidth; Supabase free tier gives 500 MB database, 1 GB files and 50k monthly users | **Recommended.** You already have Cloudflare. It deploys from a *private* GitHub repo for free and offers a custom domain |
| GitHub Pages + Supabase | €0 only from a **public** repo; Pages from a private repo needs GitHub Pro | Works, but the code would be public |
| Vercel or Netlify + Supabase | €0 hobby tier | Fine alternative; Vercel Hobby is non-commercial only |
| All-Cloudflare (Pages + Workers + D1 + R2) | €0 | Possible, but you would build your own login and API: more work and more risk |
| Firebase | Storage now needs the pay-as-you-go plan | Not €0 for photos |

Free-tier watch-outs:

- A Supabase free project **pauses after 7 days with no activity**. Daily family use prevents it, and a free scheduled ping (for example a GitHub Action) can keep it awake during holidays.
- Photos are compressed to about 150–250 KB, so 1 GB holds roughly 5,000 photos. A later setting can auto-delete evidence older than N days.

## 9. Integrations — honest status

| Integration | Status | Notes |
| --- | --- | --- |
| Google sign-in | v1 | Supabase Google provider. You create a free Google OAuth client once |
| Life360 | v1 link only | No public API. The profile stores the person's Life360 link or name and opens the Life360 app |
| Wi-Fi device scan | Future | Browsers cannot scan networks. Option A: a home agent script on an always-on PC posts the ARP table to the app. Option B: the router API |
| Revolut | Future | Revolut has no personal API. Open-banking aggregators (for example GoCardless Bank Account Data or Enable Banking) can read balances with consent, but junior/teen accounts may not be exposed, so check this first. v1 keeps a manual note |
| Push notifications | Phase 5 | Web Push works on Android, and on iPhone only when the app is added to the home screen (iOS 16.4+) |

## 10. Privacy and safety

- Health data (blood type, allergies, medication) is sensitive. For private family use the GDPR household exemption applies. Even so, only family members can see it, it is never shared outside the family, and the owner can delete everything.
- Kids' accounts have no email. Join links are single use and expire after 30 minutes.
- If the app is ever offered to other families publicly, get proper GDPR advice first (children's data plus health data).

## 11. Build phases

| Phase | Scope |
| --- | --- |
| 1 Foundations | Family, roles, QR join, sign-in options, profiles and emergency card, themes and characters, ledger (money, time, points), balances, bonus/fine/gift |
| 2 Tasks | Chores, challenges both ways, partnership, photo evidence, approvals, auto-missed penalties, excuse |
| 3 Bank | Savings transfers, interest, saver rules, requests, goals, targets and prizes, tallies (week/month/YTD) |
| 4 Life and polish | Calendar and reminders, devices, PWA install, app lock |
| 5 Next | Web push, Wi-Fi home agent, Revolut read-only, multi-family membership, photo retention, data export |

## 12. Acceptance checks (run after every phase)

1. Can a kid change their own balance or reward themselves? **Must be no.**
2. Does every money, time or points change show a reason and who did it? **Must be yes.**
3. Can family A see anything from family B? **Must be no.**
4. Does a missed task fine exactly once, even if `tick()` runs twice? **Must be yes.**
5. Does approving the same task twice pay twice? **Must be no.**

## 13. Open questions for Steve

1. Should kids see their siblings' scores (a family leaderboard)? Default: **off**.
2. Should the time bank have a weekly cap or a reset? Default: no cap.
3. Should grandparents see kids' money? Default: **yes**, read-only.
4. Should the no-savings penalty be in money or points? Default: points.
