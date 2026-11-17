# Vera approval

- Date: 2026-11-16
- Scope: Pocket Money v0.1 (HEAD 11b20fa) — full app, first production deploy (Supabase + Cloudflare Pages, pocketmoney.nl-dot.com) and first push to github.com/trust-fullstop/pocket-money
- Gates: vera-gate-2 (FAIL, 7 findings → fixed in 324ef08), vera-gate-3 (FAIL, 2 findings → fixed in 905ece7 + 11b20fa), final re-check PASS
- Evidence: 104/104 tests (PGlite, real SQL), tsc clean, build clean, browser checks at 390×844
- Accepted follow-ups: Turnstile/CAPTCHA on anonymous sign-in; Google sign-in setup; push notifications

- 2026-11-16 (evening): spend currency (EUR pocket money, kids spend in rand) — migration 20261116001600, fx lib, FxNote/FxCard, Type in R, bank balance currency. Kryptonite review applied (accounts by name+currency, rand accounts stay updatable, no history conversion, fresh-rate gate). vera-fx: PASS, 2 non-blocking findings fixed (frozen rate in Type-in-R mode; spend currency cleared when family currency matches). 122/122 tests, tsc + build clean, demo browser-tested at 400×860.

- 2026-11-17: Sow & Grow — Money school (6 lessons, quiz, +5 XP once) + Faith, hope and love (78 WEB verses, verse of the day, 6 unscored reflections incl. tithing, churches, other faiths; per-person hide) + Help pill + Ask prompt (money basics, faith guardrails, approved verses) + rename. Kryptonite review applied. vera-learn: FAIL (laziness/poverty verses could be verse of the day above a missed task; Oriental Orthodox history) → fixed (daily:false + guard test; 451 split) → PASS. 139/139 tests, tsc + build clean, browser-tested at 400×860.

- 2026-11-17 (evening): Spotted amounts from family rules (spot_rules, migration 20261116001800; client resolves the rule and sends exactly what the confirm sheet shows; public.spot unchanged). Kryptonite review applied (no server-side implicit amounts; hidden time/points shown with Remove). vera-spot: PASS, 1 non-blocking fixed (switching direction leaves custom mode). 144/144 tests, browser-tested.

status: approved
