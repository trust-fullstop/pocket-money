# Developing Sow & Grow

## Run it locally (demo, no accounts needed)

```powershell
npm install
npm run dev       # demo mode unless .env has Supabase keys
```

Open http://localhost:5173. Without Supabase keys you're in the demo straight away, as **Dad**. The **DEMO** bar at the top lets you:

- **switch person:** Mum, Anna (bonus mum), Oma, or the kids Leo, Sam and Mia
- **⏩ +1 day:** move time forward to see missed tasks, pocket money, weekly interest and prizes
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
- **Faith content:** `src/features/faith/verses.ts` holds the curated World English Bible verses (public domain). `supabase/functions/ask/verses.ts` is generated from the daily verses; regenerate it when you change them. Don't add text from copyrighted translations (NIV, ESV, NLT…); link to them instead.
- **Money** is stored as whole cents and **time** as whole minutes. Balances are always the sum of the ledger, never typed in. Mistakes are reversed, not deleted.

See [`SPEC.md`](SPEC.md) for the product spec, [`SETUP.md`](SETUP.md) to host your own copy, and [`../.squad/decisions/`](../.squad/decisions/) for the decisions behind the design.
