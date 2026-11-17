# 2026-11-17 — Money school and Faith, hope and love

**Ask (Steve):** a findable "how to use this app and why it exists" Help; teach the kids how to earn more, why and how to save and how interest works; and make faith, hope and love a strong part of the app (faith and money, abundance, blessing, provision, parents and children as faith concepts, links to the Bible App).

## Decisions
1. **Help is a labelled pill** in the header ("Help"), with 3 tiles on the Help page: How the app works · Money school · Ask.
2. **Money school** (feature `learn`, on by default, also in "Start small"). 6 core lessons in the first release: purpose, earn, why-save, how-save, interest, goals. Quizzes check answers on the phone. The server records each finished lesson once (`lessons_done`) and gives kids +5 XP the first time when points are on.
   - *Accepted risk:* a kid could call `finish_lesson` directly to skip the quiz. Most it gains: 30 XP. It's a private family app, so no server-side answer checking.
3. **Interest is taught honestly.** The family's 2%/month is a *savings bonus paid by the parents* (about 27% a year, compounded weekly). The calculator mirrors the exact server rule (`floor(savings × pct × 12 / 5200)` per week). Real banks pay a few % a year and are shown separately. Borrowing costs interest too.
4. **Faith** (feature `faith`, off by default and switched on for this family by a data update after deploy, not in the migration).
   - Faith is invited, never tested: reflections have no quiz, XP, tracking or progress.
   - Each person can hide the verses for themselves (`theme.verses = false`), because the other parent, bonus parents and grandparents use the app too.
5. **Verse text** is the World English Bible (British Edition), which is public domain. It was fetched once from bible-api.com, reviewed and committed (`src/features/faith/verses.ts`), so there's no runtime dependency. Links open the same verse in the YouVersion Bible App (NIV, link only). Copyrighted text (NIV/ESV/NLT) is never embedded.
6. **Theology guardrails** (red-team):
   - Stewardship and gratitude, not prosperity.
   - Phil 4:19 is about needs. Prov 3:9-10 is framed as gratitude, not a guarantee.
   - Left out: Heb 12:11 and Prov 3:11-12 (God's discipline), so verses are never linked to app fines or consequences. Mal 3:10 and 2 Thess 3:10 are also left out, because they're easily misused.
   - Family verses are always shown both ways (Eph 6:1-4, Col 3:20-21).
   - `daily: false` verses appear only inside lessons, with context.
7. **Ask Pocket** may explain money basics for kids, but gives no investment advice. On faith it only answers when asked, quotes at most one *approved* verse (the generated `supabase/functions/ask/verses.ts`), and never uses a verse about fines or disputes or to pressure anyone. The local fallback answers skip FAQ entries whose feature is off.

## Deferred
- Lessons on owing, staying safe, currencies, and needs-vs-wants as its own lesson.
- A real "Give" pot in the ledger. For now the jars widget is a learning tool only.
- A choice of Bible translation for the links (NIV fixed for now).

## Additions (same day)
8. **Name:** the app is now **Sow & Grow** (Galatians 6:7), because it's about more than money. The short name fits under an Android icon. The domain and repo keep "pocket-money".
9. **Three more faith reflections** (not scored):
   - **Tithing:** a tenth, given with a thankful and free heart. Malachi 3:10 is shown only in this lesson, with its context: trust, not a trick to get rich.
   - **One faith, many churches:** what all Christians share; Catholic, Orthodox, Protestant and African independent churches; what "evangelical" means.
   - **Christians and other faiths:** Judaism, Islam, Hinduism, Buddhism, and spiritualism and ancestors. Each is described accurately and kindly, then what Christians believe differently. Love your neighbour.
10. **Ask Pocket** may answer questions about tithing, churches and other religions in the same respectful way.