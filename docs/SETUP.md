# Set up Sow & Grow for your family

This guide is for the person in your family who's comfortable with a laptop and a few accounts. You need about **20 minutes**, and it costs **€0**: the app runs on the free plans of **Supabase** (database, sign-in and photos) and **Cloudflare Pages** (the website).

One copy of the app is for **one family**. After you create your family, nobody else can create one on your copy; others can only join yours with a QR code you show them.

> Want to look around first? Open the **demo** in your browser: https://pocketmoney.nl-dot.com/?demo=1. It runs entirely on your device; nothing is saved online.

## 1. Supabase: database, sign-in and photos

1. Go to https://supabase.com, choose **New project** and pick the **Free** plan and a region near you (e.g. **EU (Frankfurt)**). Save the database password somewhere safe.
2. Load the database. Choose one option:
   - **Option A (no tools):** open **SQL Editor** and run **every** file in `supabase/migrations/` **in filename order**, from `…000000_schema.sql` to the last one. Skip none: later files replace earlier functions.
   - **Option B (command line):** `npx supabase login`, then `npx supabase link --project-ref <your-ref>`, then `npx supabase db push`.
3. **Authentication → Sign In / Providers:** turn on
   - **Allow anonymous sign-ins** (joining with a QR code needs it)
   - **Allow manual linking** (so people can attach Google later)
   - **Google** (optional, see step 5)
4. **Authentication → URL Configuration:**
   - **Site URL:** your website address, e.g. `https://sow-and-grow.pages.dev`
   - **Redirect URLs:** add `https://sow-and-grow.pages.dev/**` and `http://localhost:5173/**`
5. **Google sign-in (optional):** in Google Cloud Console go to **APIs & Services → Credentials → Create OAuth client ID → Web application**. Use the callback URL that Supabase shows on its Google provider page as the authorised redirect URI, and paste the client ID and secret into Supabase. Then set `VITE_GOOGLE_AUTH=1` in step 2.4.
6. **Don't turn on CAPTCHA yet.** The app doesn't support it yet, and switching it on (Authentication → Attack Protection) stops everyone from joining or signing in. Bot protection is on the to-do list.
7. Copy the **Project URL** and the **publishable (anon) key** from **Project Settings → API**.

> `…000950_supabase_only.sql` creates the private `photos` bucket and its access rules, and runs the timed rules (missed tasks, pocket money, interest, prizes) every 15 minutes with `pg_cron`. If cron isn't available, the app runs them whenever someone opens it.

### 1b. "Ask Pocket" helper (optional, uses Claude)

Kids can ask questions about the app, money and faith. Parents can read every question. It's off until a parent switches it on in **Family → Features**, and it needs an Anthropic API key, kept on the server as a Supabase secret (never in the app).

```powershell
npx supabase functions deploy ask --project-ref <your-ref>
npx supabase secrets set ANTHROPIC_API_KEY=<your key> --project-ref <your-ref>
# required: your own web address(es), comma-separated, so phones may call the helper
npx supabase secrets set ALLOWED_ORIGINS=https://<your-site> --project-ref <your-ref>
# optional: npx supabase secrets set ASK_MODEL=claude-haiku-4-5 --project-ref <your-ref>
```

Limits: 20 questions per person per day and 150 per family per day. The helper sends Anthropic only the question as typed, plus the asker's role, relationship label and age, the family's currency and which parts of the app are on. It never sends names, the family name or balances.

## 2. Cloudflare Pages: the website

1. Fork or copy this repository to your own GitHub account.
2. In the **Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git**, pick the repository.
3. Build command `npm run build`, output directory `dist`.
4. Environment variables:
   - `VITE_SUPABASE_URL`: your Project URL
   - `VITE_SUPABASE_ANON_KEY`: your publishable (anon) key
   - `NODE_VERSION`: `22`
   - `VITE_GOOGLE_AUTH`: `1` (only if you set up Google in step 1.5)
5. Deploy. `public/_redirects` handles page routing, and every push to `main` redeploys.
6. Optional: under **Custom domains**, add something like `family.yourdomain.com` (free if the domain is on Cloudflare), and add it to the Supabase URL configuration too.

## 3. First run

1. **Create your family** (once), so nobody else can claim it. In Supabase, open **SQL Editor** and run, with your own names:

   ```sql
   select * from app.provision_family('Our Family', 'Mum', '👩', null, 'Europe/Amsterdam', 'EUR');
   ```

   The arguments are: family name, your name, your avatar, a relationship label (or `null`), your time zone and your currency (`'ZAR'` for rand, `'USD'`, `'GBP'`, …). The result shows a **short_code**, valid for 24 hours.
2. On your phone, open the site, choose **I have a QR code / join code** and type the short code. You're now the owner. Choose **Add to Home Screen** so it opens like an app.
3. **Me → Sign-in & devices:** set a username and password (or link Google), so you can never lose access.
4. **Family → Add member** for each person: show them the QR code and they scan it with their phone camera.
5. **Family → Features:** start with **Start small** and switch more on as your family gets used to it. Switch on **Faith, hope and love** if you'd like the Bible verses and reflections.
6. **Family → Family rules:** the currency (and an optional second currency), the Spotted amounts, the savings interest and so on.
7. **Money → (child) → Pocket money:** an amount every week or every month.

> The short code expired before you used it? Your family already exists, so make a fresh code for the owner in **SQL Editor**:
>
> ```sql
> insert into public.invites(family_id, member_id, token, short_code, created_by, expires_at)
> select family_id, id, app.new_token(), app.new_short_code(), id, app.now() + interval '24 hours'
> from public.members where role = 'owner'
> returning short_code;
> ```

## Free-plan notes

- A free Supabase project **pauses after 7 days without any use**. Daily family use keeps it awake, and you can unpause it from the dashboard.
- 1 GB of photo storage holds roughly 5,000 compressed photos.
- Other free hosts work too, because the app is a static website: **Vercel** or **Netlify** (same environment variables), or **GitHub Pages** (`npm run build:ghpages` with `VITE_BASE=/<repo>/`).
