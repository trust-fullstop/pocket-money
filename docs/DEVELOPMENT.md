# Developing Sow & Grow

## Run it locally (demo, no accounts needed)

```powershell
npm install
npm run dev       # demo mode unless .env has Supabase keys
```

Open http://localhost:5173. Without Supabase keys you're in the demo straight away, as **Dad**. The **DEMO** bar at the top lets you:

- **switch person:** Mum, Anna (bonus mum), Oma, or the kids Leo, Sam and Mia
- **⏩ +1 day:** move time forward to see missed tasks, pocket money (and loan repayments), weekly interest and prizes
- **reset:** go back to the starting data

The demo runs the real database (PGlite, Postgres compiled to WebAssembly) inside your browser and keeps its data in IndexedDB only. Any deployed copy offers it too: add `?demo=1` to the address.

## Commands

```powershell
npm run dev       # the app
npm test          # database + logic tests (PGlite: the real SQL in-process)
npm run lint      # oxlint
npm run build     # type-check + production build
```

## How it's built

- **Front end:** Vite, React 19, TypeScript, Tailwind CSS v4 and React Router, installable as a PWA. Code lives in `src/`, organised by feature in `src/features/*` (tasks, money, family, help, faith, …). The UI kit is `src/components/ui`.
- **Back end:** Supabase Postgres. Everything is in `supabase/migrations/`. All data access goes through `SECURITY DEFINER` functions; the tables themselves have no direct access (RLS on, privileges revoked). Never edit a migration that has been applied; add a new one.
- **Contract:** `src/lib/types.ts` (shapes) and `src/lib/api.ts` (one typed wrapper per SQL function).
- **Demo and tests:** `supabase/pglite/` holds the shim, the demo seed and time travel.
- **Ask Pocket:** the Supabase Edge Function in `supabase/functions/ask/` (Claude, server-side key).
- **Faith content:** `src/features/faith/verses.ts` holds the curated World English Bible verses (public domain). `supabase/functions/ask/verses.ts` is generated from the daily verses; regenerate it when you change them. Don't add text from copyrighted translations (NIV, ESV, NLT…); link to them instead. Faith reflections have no quiz, score or XP, and beliefs are never evaluated. The Bible time surprise (`src/features/faith/bibleTrack.ts`) only counts a kid's tap on the app's own Bible App links, once a day, and never delays the link.
- **Money** is stored as whole cents and **time** as whole minutes. Balances are always the sum of the ledger, never typed in. Mistakes are reversed, not deleted.
- **Feature switches:** `FeatureKey`, `START_SMALL` and `EVERYTHING` in `src/lib/types.ts`; labels and groups in `src/features/family/featureList.ts`. The server mirrors them (`app.feature_keys()`, `app.default_features()`) and refuses switched-off features too. Tasks and the Wallet are always on.
- **Updates:** `src/lib/updates.ts` checks for a new version when the app opens, comes back to the front, and every 30 minutes, and reloads only when nothing is unsaved (otherwise it shows an "A new version is ready" bar with **Refresh**). `public/_headers` serves `sw.js` uncached. The build date and commit (`src/lib/version.ts`) show in Family rules → About this app.

## Database migrations

Run in filename order; each one builds on the ones before. Never edit one that has been applied.

| File | What it adds |
|---|---|
| `20261116000000_schema.sql` | Tables and the ledger (balance = sum of transactions) |
| `…000100_api_core.sql` | Family, members, joining with a QR code, sign-in |
| `…000200_api_tasks.sql` | Tasks and challenges, approvals |
| `…000300_api_money.sql` | Wallet, tallies, Spotted, transfers, requests, goals, targets |
| `…000400_api_life.sql` | Calendar (events, reminders, birthdays) and devices |
| `…000500_tick.sql` | Timed rules: missed tasks, pocket money, interest, prizes |
| `…000900_grants.sql` | Which functions the app may call |
| `…000950_supabase_only.sql` | Supabase only: private `photos` bucket, `pg_cron` job (skipped by PGlite) |
| `…001000_gift_photos.sql` | Grandparents can add a photo to a gift |
| `…001100_relation.sql` | Own relationship labels ("Bonus dad", "Godmother") |
| `…001200_ask.sql` | Ask Pocket: questions, limits |
| `…001300_provision.sql` | `app.provision_family`: create the family and owner up front |
| `…001400_allowance_month_bank.sql` | Pocket money weekly or monthly on a chosen day; real bank balance |
| `…001500_allowance_guard.sql` | No double pocket money when the schedule changes; catch-up limit |
| `…001600_spend_currency.sql` | Second currency (Family rules → Also show money in) |
| `…001700_learn_faith.sql` | Money school and Faith, hope and love switches; finished lessons (+5 XP once) |
| `…001800_spot_rules.sql` | Fixed Spotted reward and consequence amounts |
| `…001900_needs.sql` | What we need (grown-ups only) |
| `…002000_payout.sql` | Pay-out overview and the `payout` ledger kind |
| `…002100_loans.sql` | Loans: requests, fees, repayments from pocket money, pay back now, forgive |
| `…002200_initiatives.sql` | Look what I did ⭐ (proud moments) |
| `…002300_loan_tallies.sql` | Borrowed / Paid back in the tallies; loans hidden from relatives |
| `…002400_learn_series.sql` | Money school series (December: Borrowing and insurance) with an opening date |
| `…002500_lesson_rewards.sql` | Money school reward per lesson, Pay-out line |
| `…002600_bible_surprise.sql` | Bible time surprise: days a kid opened the Bible App from the app, optional daily gift, Pay-out line |

See [`SPEC.md`](SPEC.md) for the product spec, [`SETUP.md`](SETUP.md) to host your own copy, and [`../.squad/decisions/`](../.squad/decisions/) for the decisions behind the design.
