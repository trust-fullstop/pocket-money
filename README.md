# Pocket Money

A private family app for pocket money and family life. Kids earn **money, time and points** for doing what they said they would, face a clear **consequence** when they don't, and get rewarded for **saving**. The family shares a calendar, reminders, emergency cards and challenges that go both ways.

- 📱 It is a mobile-first web app (PWA): open it in the phone browser and choose **Add to Home Screen**.
- 👨‍👩‍👧‍👦 Blended families are the normal case: owner, parents, **bonus parents**, guardians, grandparents and kids aged 0 to 21. Everyone can have a custom relationship label ("Bonus dad", "Oma").
- 🔳 People join with a **QR code**, and the app never sends email.
- 🧪 A **demo mode** runs the real database inside your browser, so you can try everything with zero setup.
- 💶 It runs on **€0 hosting**: Cloudflare Pages plus the Supabase free tier.

See [`docs/SPEC.md`](docs/SPEC.md) for the full product spec and [`.squad/decisions/`](.squad/decisions/) for the architecture decisions.

## Try it now (demo, no accounts needed)

```powershell
npm install
npm run dev
```

1. Open http://localhost:5173 and choose **Try the demo**.
2. You start as **Dad**. Use the **DEMO** bar at the top to:
   - **switch person:** Mum, Anna (bonus mum), Oma, or the kids Leo (14), Sam (12) and Mia (12)
   - **⏩ +1 day:** move time forward to see missed-task consequences, weekly interest and prizes
   - **reset:** go back to the starting data

The demo keeps its data in your browser (IndexedDB) only.

## What's in v0.1

| Area | Features |
| --- | --- |
| Joining & sign-in | QR code or 8-character code (single use, expires after 30 min), Google, username and password, PIN or pattern app lock, list of signed-in devices |
| Tasks | Chores and challenges, repeats, partnerships (several people on one task), before and after photo evidence, approve or send back, automatic consequence when missed, excuse |
| Money | Spending and savings pots, time bank (Wi-Fi, game, fun), points and character levels, weekly pocket money, interest on savings, saver bonus, no-savings rule, requests (spend, take out savings, use time), goals, targets and prizes, week / month / year-to-date tallies, history with reasons, reversals |
| Spotted | A parent photographs something good or bad, picks the child and gives a ➕ reward or ➖ consequence (money, time or points) with a reason. Grandparents can give gifts |
| Family life | Calendar, reminders and birthdays, emergency card (blood type, allergies, medication, contacts, Life360 link), device list, themes, characters and avatars |

**Not yet** (honest list): push notifications, automatic Wi-Fi device scanning (a browser cannot do it; a small home-PC helper is planned), the Revolut connection (Revolut has no personal API), and one person belonging to two families.

## Go live for €0

You need a free **Supabase** project (database, login and photos) and **Cloudflare Pages** (website hosting). Allow about 20 minutes.

### 1. Supabase (database, login, photos)

1. Go to https://supabase.com, choose **New project**, pick the **Free** plan and the **EU (Frankfurt)** region, and save the database password somewhere safe.
2. Load the database:
   - **Option A (no tools):** open **SQL Editor** and run **every** file in `supabase/migrations/` **in filename order**, from `…000000_schema.sql` to the last one (currently `…001100_relation.sql`). Skip none: later files replace earlier functions.
   - **Option B (CLI):** run `npx supabase init` (once; this creates `supabase/config.toml`), then `npx supabase login`, then `npx supabase link --project-ref <your-ref>`, then `npx supabase db push`.
3. Go to **Authentication → Sign In / Providers** and turn on:
   - **Allow anonymous sign-ins**, which the QR join needs
   - **Allow manual linking**, so people can attach Google later
   - **Google** (optional; see step 5)
4. Go to **Authentication → URL Configuration**:
   - **Site URL:** your Pages URL, for example `https://pocket-money.pages.dev`
   - **Redirect URLs:** add `https://pocket-money.pages.dev/**` and `http://localhost:5173/**`
5. **Google sign-in (optional):** in Google Cloud Console, go to **APIs & Services → Credentials → Create OAuth client ID** and pick **Web application**. Set the authorised redirect URI to the callback URL that Supabase shows on its Google provider page. Paste the client ID and secret into Supabase.
6. **Recommended — bot protection:** in Cloudflare, create a free **Turnstile** widget and paste its secret into **Authentication → Attack Protection → CAPTCHA**. This stops bots creating anonymous accounts. *(Note: the app doesn't send a CAPTCHA token yet, so enabling this needs a small code change first. It's on the phase-5 list.)*
7. Copy the **Project URL** and the **anon / publishable key** from **Project Settings → API**.

> The `…000950_supabase_only.sql` file creates the private `photos` bucket and its access rules, and schedules the timed rules (missed tasks, interest, prizes) every 15 minutes with `pg_cron`. If cron isn't available, the app still runs the timed rules every time someone opens it.

### 2. Cloudflare Pages (the website)

1. Push this folder to a **private** GitHub repo.
2. Go to **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git** and pick the repo.
3. Set the build command to `npm run build` and the output directory to `dist`.
4. Add these environment variables:
   - `VITE_SUPABASE_URL`: your Project URL
   - `VITE_SUPABASE_ANON_KEY`: your anon / publishable key
   - `NODE_VERSION`: `22`
5. Deploy. `public/_redirects` handles page routing. Every push to `main` redeploys.
6. Optional: under **Custom domains**, add something like `pocket.yourdomain.com` (free if the domain is on Cloudflare). Then add it to the Supabase URL configuration too.

### 3. First run

1. On your phone, open the site and choose **Create our family**.
2. Go to **Me → Sign-in & devices** and link Google or set a username and password, so you can't lose access.
3. Go to **Family → Add member** for each person. Show them the QR code; they scan it with their phone camera.
4. Go to **Family → Rules** to set the interest rate, the saver bonus and so on. Go to **Money → (kid) → Weekly pocket money** to set allowances.

### Free-tier notes

- A free Supabase project **pauses after 7 days without any use**. Daily family use keeps it awake, and you can unpause it from the dashboard.
- 1 GB of photo storage holds roughly 5,000 compressed photos.
- Other €0 hosts also work, because the app is a static site:
  - **Vercel** or **Netlify:** same environment variables.
  - **GitHub Pages:** needs a **public** repo on the free plan. Use `npm run build:ghpages` and set `VITE_BASE=/<repo>/`.

## Development

```powershell
npm run dev       # app (demo mode unless .env has Supabase keys)
npm test          # database tests (PGlite: the real SQL in-process)
npm run lint
npm run build
```

- **Front end:** Vite, React 19, TypeScript, Tailwind CSS v4 and React Router. Code is in `src/`, organised by feature in `src/features/*`.
- **Back end:** Postgres functions in `supabase/migrations/`. All data access goes through `SECURITY DEFINER` functions, and the tables themselves have no direct access.
- **Contract:** `src/lib/types.ts` and `src/lib/api.ts`.
- **Demo and tests:** `supabase/pglite/` holds the shim, the time travel and the demo seed.
- **Money** is stored as whole cents and **time** as whole minutes. Balances are always the sum of the ledger, never typed in.
