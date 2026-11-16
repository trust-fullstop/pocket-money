# 2026-11-16 — Architecture decisions (Pocket Money v0.1)

Kryptonite reviewed the architecture before the build (13 findings). Each finding and how it was handled:

| # | Finding | Decision |
| --- | --- | --- |
| 1 | Re-linking replaces `members.user_id`, which strands Google/password identities and lets one QR code take over an account | **Accepted, redesigned.** A member has many logins (`member_logins`). A QR code *adds* a device and never replaces one. Managers see and remove devices. Only the owner, or the person themselves, can make a device QR for an adult who already has a login. Every action is written to the audit log |
| 2 | Username/password through synthetic emails cannot be reset and is unique across the whole Supabase project | **Accepted, redesigned.** Usernames and bcrypt hashes are stored in our own `members` table. `login_with_password` attaches the caller's fresh anonymous session to the member. A manager can clear a password, then issue a QR code. No Supabase email semantics are involved |
| 3 | Double-crediting / overdraw races | **Accepted.** Instance and request rows are locked (`FOR UPDATE`) before status changes. Balance checks lock the member row. There is a unique source key on `transactions(source_type, source_id, source_key)`. `tick` locks the family row |
| 4 | Ambiguous approver rule | **Accepted.** `approver <> assignee AND (manager OR (creator AND task has no money/time reward))` |
| 5 | SECURITY DEFINER functions are the whole perimeter | **Accepted.** EXECUTE is revoked from PUBLIC/anon/authenticated on every function and granted per RPC to `authenticated` only. `search_path` is pinned. `tick_all` is never granted. Tests cover role and cross-family cases |
| 6 | One `family_id` is too coarse for blended families | **Partly accepted.** Steve wants one shared family network, so managers manage all kids. Siblings cannot see each other's money. The emergency card can be restricted to adults (setting). Evidence photos are readable only by the subject, managers and the challenge creator (`can_read_photo`). Per-household scoping is deferred to phase 5 |
| 7 | Cron unreliable on a paused free project | **Accepted.** `tick()` runs on every app open. Catch-up covers the last N days of instances (default 7, so a holiday pause does not pile up fines) and up to 12 weeks / 3 months of period closes, all idempotent through `period_runs` / `target_results` |
| 8 | DST / time zone | **Accepted.** The family has an IANA time zone. Instances store the local `occurs_on` date plus `due_at = (occurs_on + due_time) AT TIME ZONE tz`, with `unique(task_id, occurs_on)` |
| 9 | Anonymous sign-up abuse / brute force | **Partly accepted.** Tokens are 128-bit and short codes are 8 characters from a 31-symbol alphabet. Redeem attempts are throttled per user, and password lockout applies after 5 failures. Turnstile and orphan clean-up are in the Supabase-only migration / phase 5 |
| 10 | Backdated ledger rows | **Accepted.** Ledger rows carry `effective_at` (which period they count in) and `created_at` (when they were written) |
| 11 | PGlite ≠ Supabase | **Accepted.** PGlite is used for the demo and domain tests only. Storage policies and cron live in a Supabase-only migration and are checked on the real project |
| 12 | Photo storage growth | **Partly accepted.** Photos are compressed on the client (re-encoding strips EXIF), the bucket has a 2 MB / image-only limit, and signed URLs last 1 hour. Retention clean-up is phase 5 |
| 13 | Over-scoped | **Overruled by the owner's brief.** Steve asked for the full feature set. Each feature is kept deliberately simple, and v0.1 ships everything in the spec except push, Wi-Fi scanning and Revolut |

Hosting: Cloudflare Pages + Supabase free (see `docs/SPEC.md` §8).
