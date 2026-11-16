# Pocket Money — Screen-level UX Spec (builder wave)

Author: Marlo (UX) · Date: 2026-11-16 · Aligns with: `docs\SPEC.md` v2, `src\lib\types.ts`, `src\lib\api.ts`, Pixel's shell (bottom nav Home·Tasks·Money·Calendar·Family, top bar family name + avatar → Me, floating **Spotted** camera button for managers + grandparents → `/money/spot`).

**Legend.** **K** = kid · **M** = manager (`isManager`: owner/parent/step_parent/guardian) · **G** = grandparent. `me` = `AppState.me`. "Sam" = example child; always use the real `display_name`. `€` = `family.currency`. Components are the UI-kit names. `api.x` = `src\lib\api.ts`. Query params (`?tab=`, `?person=`, `?member=`) are proposals for deep links — keep them stable across screens.

---

## 0. Global rules (all builders read this)

### 0.1 Tone of voice
- Warm, specific, never shaming. Praise the **effort or behaviour**, never the person. No "failed", "lazy", "bad", "naughty", "punishment".
- Consequences are always **cause → effect** in one line: "The bins weren't out by 19:00, so −€0.50." Rewards likewise: "Dishes done, so +€2.00 and +10 points."
- Kid copy: reading age ~7. Sentences ≤ 10 words, one idea per line, words like *pocket money, savings, time, points, grown-up*. Never *ledger, transaction, pot, penalty, approve, escalate*. Use "points" in prose and "XP" only inside the level bar and compact chips.
- Manager copy: short, neutral, factual ("Approve", "Send back", "Excuse"). Partnership language: "Together", "Challenge", "Can you beat me?". A kid challenging a parent reads as playful, not as an order.
- Status words (kid-safe): `open` **To do** · `submitted` **Waiting for OK** · `approved` **Done ✅** · `missed` **Not done this time** · `excused` **Excused** · `cancelled` **Cancelled**. Send-back (open + `decision_note`) = **Try again**.
- Errors: use `friendlyError(e)` from `src\lib\errors.ts` verbatim; add the next step if missing. Never show raw codes.

### 0.2 Icons per `TxKind` (emoji + label + colour class)
Colour classes: **plus** = green · **minus** = orange (consequence) · **neutral** = slate (a choice the kid made, or net-zero). Every row also shows the signed amount and the label text.

| TxKind | Emoji | Kid label | Class |
| --- | --- | --- | --- |
| `task_reward` | ✅ | Task done | plus |
| `task_penalty` | ⏰ | Not done in time | minus |
| `bonus` | 🌟 | Bonus | plus |
| `fine` | ⚠️ | Fine | minus |
| `gift` | 🎁 | Gift | plus |
| `transfer` | 🔄 | Moved | neutral (two rows: Spending −, Savings +) |
| `interest` | 🌱 | Savings grew | plus |
| `spend` | 🛍️ | Bought | neutral |
| `time_use` | ⏳ | Time used | neutral |
| `prize` | 🏆 | Prize | plus |
| `saver_bonus` | 🐷 | Saver bonus | plus |
| `no_savings_penalty` | 💤 | Nothing saved this week | minus |
| `excuse` | 🤝 | Excused (given back) | plus |
| `reversal` | ↩️ | Undone | neutral |
| `allowance` | 💰 | Pocket money | plus |

Currency glyphs: money 💰 · time ⏱️ (labels: `wifi` 📶 Wi-Fi, `game` 🎮 Game, `fun` 🎈 Fun) · points ✨. `MoneyLabel`: `pocket` 👛, `extra` 🙌, `reward` 🏅, `prize` 🏆, `gift` 🎁. Pots: Spending 👛, Savings 🐷.

### 0.3 Colour semantics
- **Green** = went up (+). **Orange** = a consequence (−). **Slate** = chosen spend/time use/transfer/undo (− or ±, not "bad"). **Red** is reserved for destructive buttons and errors. **Amber** = waiting for someone. **Accent** (CSS var) = primary actions and progress only.
- Never colour alone: every amount has an explicit sign (**+** / **−**, use U+2212 "−" not hyphen), an icon, and a text label. Deltas in lists are `<span>` with both colour class and `aria-label="plus €2.50"` / `"minus €0.50"`.
- Text contrast ≥ 4.5:1 for every accent × light/dark combination; the accent set must expose an `--on-accent` var.

### 0.4 Number & date formatting (one `format.ts`, all screens)
- Money: `Intl.NumberFormat(locale, {style:'currency', currency})` on `cents/100`, **always 2 decimals** in lists/tiles ("€12.50"); drop `.00` only in prose ("€2"). Deltas always signed ("+€2.00", "−€0.50"). Balances: no sign; a negative spending balance renders **"Owes €1.50"** (never "−€1.50") with ⚠️ and orange.
- Time: minutes `<60` → "45 min"; else "1 h 15 min". Deltas "+30 min" / "−15 min".
- Points: "+10 XP" in chips; "10 points" in kid prose. Level text "Level 3".
- Dates: "Today", "Tomorrow", "Wed 18 Nov"; time 24 h "19:00". Relative ("12 min ago", "2 h ago") for timestamps < 24 h, else date. All dates in `family.timezone`; `AppState.today` is the truth for "today".
- Progress: "€12.50 of €30.00", never bare percentages for kids (percent only for `completion_pct`).

### 0.5 Empty-state style
`EmptyState` = 48 px emoji (`aria-hidden`) · headline ≤ 6 words · one line explaining what will appear · at most one primary Button if this user can act. Empty-because-good gets celebration copy ("All done! 🎉"). No blame, no jargon, never a blank area.

### 0.6 Loading, errors, offline
- **Shell never skeletons.** Content areas show skeletons that match the final layout (rows/cards) **after a 150 ms delay** (avoid flash). Cached data shows immediately and revalidates silently (small `Spinner` in the PageHeader action slot). On open: `api.tick()` then `api.getState()`; refetch on tab focus and after every mutation.
- **Money/time/points mutations are never optimistic**: Button shows `Spinner`, keeps its label, is disabled and `aria-busy`; success → `Toast` (status), then refetch. Pure toggles (filter chips, tabs) are instant.
- Load failure: inline `Card` "We couldn't load this." + Button **Try again** (+ `friendlyError`). Mutation failure: `Toast` (alert) with `friendlyError`; the sheet stays open and keeps input. `wrong_status` → Toast "Someone else already did this." and refetch. `not_allowed` on a screen → `EmptyState` "That's not for you" + **Go home**. `network` → persistent top banner "No connection — you can look, but not change things" and disable write Buttons.
- Photos: signed URLs expire in 1 h → on image `onError` refetch the URL once, then show 🖼️ placeholder "Photo unavailable". Compress on phone before upload; keep the local blob until upload succeeds so **Try again** never loses a photo.

### 0.7 Shared patterns
- **Sheet** for every form/confirm; title = the action ("Move to savings 🐷"); primary Button bottom, full width, label = a verb; secondary = **Cancel**. Sticky bottom bars respect safe-area insets and sit above the keyboard.
- **Confirm sheets** state the exact effect with numbers ("Sam will get +€1.00 and +10 points") and name who sees it. Destructive confirms use a red Button + the thing's name.
- **One-tap approve** has no confirm (it is reversible via ledger reversal and the kid is waiting); Send back / Excuse / Reverse / Remove / Delete always need a sheet.
- **Role gating**: hide what a role can never do; show disabled-with-reason only when the user could fix it (e.g. "Add a photo to finish").
- **Kid view** = bigger type (≥ 18 px titles), 56 px primary buttons, more emoji. **Manager view** = denser rows, 44 px targets.
- Level/XP helper (not in contract — add `levelInfo(points)` in `src\lib\theme.ts`): `level = floor(sqrt(points/40)) + 1`, next level at `40·level²` XP (L2 = 40, L3 = 160, L4 = 360). Returns `{level, into, needed}` for the bar.

### 0.8 Accessibility checklist (apply to every screen)
- [ ] Targets ≥ 44×44 px, ≥ 8 px apart; kid primary actions ≥ 56 px.
- [ ] Colour + icon + text for every status/amount; signs always present; `aria-label` reads amounts in words.
- [ ] Contrast ≥ 4.5:1 text / 3:1 UI in every accent × light/dark combo; visible 2 px focus ring.
- [ ] Every input has a visible `<label>` (no placeholder-only); errors via `aria-describedby` + `aria-live="polite"`; input font ≥ 16 px (no iOS zoom).
- [ ] Sheets: `role="dialog" aria-modal`, focus trapped, Esc/back closes, focus returns to the trigger; page behind `inert`.
- [ ] `Segmented` = radiogroup (or tablist with `aria-selected` when it switches views); tab labels include counts ("Approvals, 3 waiting").
- [ ] Emoji are decorative (`aria-hidden`) except where they are the only label — then provide text.
- [ ] Photos have alt ("Before photo", "After photo of the kitchen by Sam"); camera denied → file picker fallback.
- [ ] `prefers-reduced-motion`: no confetti, no level-up animation, no bar easing, no countdown pulse.
- [ ] Text scales to 200 % without horizontal scroll or clipped text; no fixed heights on text.
- [ ] Toasts: `role="status"` (success) / `role="alert"` (error), ≥ 5 s, dismissible, never the only record of an outcome.
- [ ] Countdown (QR) is not live-announced every second: announce at 5 min, 1 min, expired.
- [ ] Don't rely on swipe/long-press; every gesture has a visible Button equivalent.
- [ ] Back works everywhere (browser back closes an open Sheet first); no dead ends.

---

## 1. Home `/`

**Purpose:** one-glance "what's happening for me/us today". On mount: `api.tick()` → `api.getState()`.

### 1.1 Kid view
**Layout**
1. **Character card** (`Card`, accent gradient): big character emoji from `me.theme.character` in `Avatar`, "Hi Sam! 👋", "Level 3 · Fox", `ProgressBar` of `levelInfo(balances[me.id].points)` with "15 points to Level 4". Tap → Me.
2. **Balance tiles** (3 × `Stat`): 👛 Spending `spending` · 🐷 Savings `savings` · ⏱️ Time `time`. Tap → `/money/${me.id}`. Spending < 0 → tile turns orange "Owes €1.50 ⚠️".
3. **Today** (heading + "2 of 4 done"): `api.listInstances(today, today, me.id)`. Rows (`ListRow`): `emoji`, `title`, "by {due_at HH:MM}", reward chips (`reward_cents/minutes/points/text`), partner avatars if `partners.length`. `open` → big **Do it!** Button (56 px) → `/tasks/:id`. `submitted` → Badge ⏳ "Waiting for OK". `approved` → muted ✅ "Done". `missed` → "Not done this time". Overdue open (past `due_at`) → amber "Hurry — was due 19:00". Max 4 rows + link "See all tasks" → `/tasks`.
4. **Goal** (first non-archived `wallet.goals[0]`, via `api.wallet(me.id, 1)`): emoji + title, `ProgressBar` `savings / target_cents`, "€12.00 of €30.00 · about 4 weeks to go" (ETA = `ceil((target − savings) / avg_weekly_savings_cents)`; if avg ≤ 0: "Save a little each week to get there"; if reached: "You did it! 🎉 Ask a grown-up to take it out"). Tap → wallet.
5. **"This week you could still earn"**: sum of `reward_*` over this week's `open` instances (`api.listInstances(weekStart, weekEnd, me.id)`) → "€3.50 · 20 min · 40 points". Sub-line: "Waiting for OK: €1.00". Tap → `/tasks` Upcoming. Hidden when nothing is open (shows "Nice! Everything for this week is done 🎉").
6. **Next reminders** (≤ 3): `api.listEvents(now, now+7d)` where `for_members` is `[]` or includes me; emoji, title, "Tomorrow 18:30". Link "Calendar".
7. **My requests** line (if `counts.my_requests > 0`): "2 requests waiting for a grown-up" → `/money/requests`.
8. **Challenge to check** (if `counts.approvals > 0`, kid made a challenge): "Dad did your challenge! Take a look" → `/tasks?tab=approvals`.

**Actions:** Do it! → `/tasks/:id`; tiles → wallet. **Empty:** no tasks today → "No tasks today 🎈 / Enjoy it — or make a challenge." + **Make a challenge** → `/tasks/new`. **Errors:** balances missing → tiles show "—" with Try again; level never blocks the page.

### 1.2 Manager view
**Layout**
1. **"Waiting for you" banner** (`Card`, amber, only if `counts.approvals + counts.requests > 0`): "3 tasks to check · 1 request". Buttons **Check tasks** → `/tasks?tab=approvals`, **See requests** → `/money/requests`. If 0: slim row "All caught up ✅".
2. **Kids at a glance**: one `Card` per `members.filter(role==='kid')`: `Avatar`, name, "Level N" Badge, 3 mini `Stat`s (Spending/Savings/Time from `balances[id]`; "Owes €1.50" in orange), `ProgressBar` "Today 3 of 5 done" from `api.listInstances(today, today, null)` grouped by `assignee_id` (done = approved; show "1 waiting" amber when submitted). Tap card → `/money/:id`; secondary text button "Tasks" → `/tasks?person=:id`.
3. **Today across the family**: open/submitted instances grouped by person; each row emoji, title, due time, status Badge; submitted rows with `can_decide` show a **Check** Chip → detail. Max 6 + "See all" → `/tasks`.
4. **Coming up**: next 5 from `api.listEvents(now, now+7d)` (emoji, title, when, who). Link "Calendar".
5. **Quick actions** (2 Buttons): **＋ New task** → `/tasks/new`, **Add reminder** → opens the Calendar add Sheet.

**Empty:** no kids → "No kids yet 👋 / Add a child so they can start earning." + **Add a child** → `/family/add`. No instances today → "Nothing due today" with **＋ New task**.

### 1.3 Grandparent view
1. Greeting "Hello Grandma 👋".
2. **Kids' progress** (read-only cards): `Avatar`, name, Level, today "3 of 5 tasks done"; balances **only if** `family.settings.grandparents_see_money` and `balances[id]` exists — otherwise just level + tasks. Per card a **🎁 Send a gift** Button → `/money/spot?member=:id`.
3. **Coming up** (events 7 days) as manager.
4. **Make a fun challenge** `ListRow` → `/tasks/new`.
**Empty/edge:** `listInstances` returns `not_allowed` → hide the "tasks" line, keep gifts. No kids → "No kids to cheer on yet" (no action).

---

## 2. Tasks

### 2.1 `/tasks`
**Purpose:** see, do and check tasks and challenges.

**K:** `Segmented` **Today · Upcoming · Done**. Today = `listInstances(today, today, me.id)`; Upcoming = tomorrow→+14 days grouped by day; Done = last 14 days with `approved/missed/excused`, newest first (shows what was earned/lost: "+€0.50 +10 points" / "−€0.50").
- Row = same `ListRow` as Home; a challenge made by me for someone else shows "Your challenge for Dad" and **Check** if `can_decide`.
- If `counts.approvals > 0` (I made a challenge someone finished): amber `Card` on top "Dad did your challenge!" → opens the approvals list (`api.listApprovals`).
- Empty: Today "No tasks today 🎈", Upcoming "Nothing coming up", Done "Nothing here yet — do a task and it shows up here 🌟". Header action **＋ Challenge** → `/tasks/new`.

**M:** `Segmented` **By person · Approvals (n)** (n = `counts.approvals`, hidden at 0 → "Approvals").
- **By person** tab: `MemberPicker` (single, with "Everyone" first) filter, `Chip` row for time (Today · This week · Later) and status (To do · Waiting · Done · Not done). Data `api.listInstances(from, to, personId|null)`. Groups per person (Avatar + name + "3 of 5 done"), rows with emoji, title, due, status Badge, rewards. Tap → detail. Header action **＋ New** → `/tasks/new`.
- **Approvals** tab: `api.listApprovals()` → §2.4.
- Empty: "No tasks yet 📝 / Make a chore or a challenge." + **＋ New**.

**G:** like K but only Upcoming/Done for challenges they set + **＋ Challenge**; no chore list.

**Edge:** deep link `?tab=approvals&person=:id` pre-selects. Load fail → Try again.

### 2.2 `/tasks/new` (chore or challenge)
**Purpose:** create a task for one or more people. Submit = `api.createTask(TaskInput)`; success `Toast` "Task sent to Sam 🎉" → `/tasks`. Edit mode `/tasks/new?edit=:taskId` prefills from `api.listTasks()` and saves with `api.updateTask(group_id, patch)`.

**M form (top → bottom), one scroll, sticky footer:**
1. `Segmented` **Chore · Challenge** (`kind`). Help: Chore = "A regular job." Challenge = "A fun goal — can be for anyone."
2. **Who?** `MemberPicker` multi → `assignees`. Chore: kids only; Challenge: everyone incl. me. 2+ selected → Badge "🤝 Together" + help "Everyone gets this task. Each person earns the reward when they finish theirs."
3. **What?** emoji `Field` (opens emoji grid Sheet; default 🧹) → `emoji`; `Input` Title (required, ≤ 60) → `title`; `Textarea` "Details (optional)" → `details`.
4. **Reward** (`Card`): `AmountInput` money → `reward_cents`; time → `reward_minutes` + `Segmented` Wi-Fi/Game/Fun → `time_label`; points → `reward_points` (default 10); `Input` "Or a reward in words" → `reward_text` (e.g. "Pizza night").
5. **If it's not done** (`Card`, collapsed by default, caption "No consequence"): money → `penalty_cents`, time → `penalty_minutes`, points → `penalty_points`. Help: "Only counts if it's still open at {due_time} + {late_grace_minutes} min."
6. **Repeat**: `Chip` single-select **Once · Every day · Weekdays · Every week · Choose days** → `repeat`. "Choose days" shows 7 day Chips M T W T F S S → `repeat_days` (ISO 1–7). Weekly shows "Every {weekday of start_on}". `Input[type=date]` **Starts** → `start_on` (default `today`); **Stop repeating on** (optional, under "More") → `end_on`.
7. **Due time** `Input[type=time]` → `due_time` (default 19:00).
8. **Proof** `Segmented` **Photo · Photo or note · Nothing** → `evidence` (default `family.settings.default_evidence`).
9. **Preview** `Card` "What Sam will see": emoji, title, "Do it by 19:00", reward chips in green, consequence line "If not done: −€0.50" in orange.
10. Footer Button **Give task** (Challenge: **Send challenge**). Disabled until title + ≥ 1 assignee; helper text explains what's missing.

**K / G simplified form** (kind forced `challenge`, no Segmented, no consequence, no money/time):
1. Who? `MemberPicker` multi (everyone except me) + Switch "I'll do it too 🤝" (adds `me.id` → partnership).
2. What? emoji, title, details.
3. Reward: `AmountInput` points (max `challenge_points_cap`, shown "up to 50") + `Input` "A reward in words" ("I'll make you breakfast").
4. When? Date + time; repeat `Chip`s **Once · Every day · Every week** only.
5. Button **Send challenge**. Help: "You'll check it when they're done." (creator approves).
**Edge:** points > cap → inline "You can promise up to {cap} points." Title empty → "Give it a name." Nothing to reward on a kid challenge is fine. `invalid` from API → `friendlyError`. Leaving with unsaved input → confirm "Leave without saving?".

### 2.3 `/tasks/:instanceId` (detail)
**Source:** no `getInstance` in api → find in query cache else `listInstances(today−30d, today+60d)` (see §9 gap 1). Not found → EmptyState "We couldn't find that task".

**Layout**
1. `PageHeader` back + overflow (M: **Edit task** → `/tasks/new?edit=`, **Stop repeating** → confirm → `api.archiveTask(group_id)`).
2. **Hero**: big `emoji`, `title`, status Badge, "Due today 19:00" / "Was due Tue 17:30", "Set by Mum" (`created_by`), assignee Avatar + name (when not me).
3. **Sent-back banner** (status `open` and `decision_note`): amber "Dad sent it back: '{decision_note}'. Try again!"
4. **Together** (if `partners.length`): "🤝 Doing this with Dad" + `Avatar` row.
5. **Details** text (`details`).
6. **Rewards & consequence** (two chip rows): "You get" green chips (`reward_cents`, `reward_minutes`+`time_label`, `reward_points`, `reward_text`); "If not done by 19:00" orange chips (`penalty_*`) in cause→effect: "If this isn't done by 19:00: −€0.50". Evidence rule line: "Show it with a photo" / "A photo or a note" / "No proof needed".
7. **Do-it flow** (only if `can_submit`):
   - Step 1 "Before" `PhotoCapture` (optional) · Step 2 "After" `PhotoCapture` (optional) · Step 3 `Textarea` "Tell us how it went (optional)".
   - Valid when: `photo` → ≥ 1 photo; `photo_or_note` → photo or note; `none` → always.
   - Primary **I did it!** (56 px) → `api.submitTask(id, beforePath, afterPath, note)`. While invalid, helper under the button: "Add a photo to finish".
   - Success screen: "Nice one! 🎉 Waiting for Mum or Dad to check." + "Worth +€0.50 · +10 points". Reduced-motion: no confetti.
   - Upload failure: "Photo didn't send. Try again" (blob kept).
8. **Evidence** (after submit): Before/After thumbnails (signed URL; tap → full-size Sheet), note.
9. **Status timeline** (ordered, icon + text + time): ○ "Created" → ⏳ "Sent {submitted_at}" → ✅ "Approved by Dad {decided_at}" with the paid amounts "+€0.50 · +10 points" / ⏰ "Not done in time — −€0.50" / 🤝 "Excused by Mum — given back". Include `decision_note` quoted.
10. **Approver bar** (sticky, `can_decide` and `submitted`): **Send back** (secondary) · **Approve ✅** (primary). Optional collapsed "Say something nice" `Input` → passed as `note`. 
    - Approve → `api.decideTask(id, true, note)` → Toast "Approved. Sam earned +€0.50 ✨" → back to queue.
    - Send back → Sheet "Send it back": required `Textarea` + quick chips ("Take a clearer photo", "Not finished yet", "Please try again") → `api.decideTask(id, false, note)` → Toast "Sent back to Sam".
11. **Excuse** (M, `can_excuse`): ghost Button **Excuse** → Sheet "Excuse this for Sam? The −€0.50 will be given back." `Textarea` + chips (Was ill, At the other home, Our mistake) → `api.excuseTask(id, note)`.

**Edge:** `wrong_status` → "Someone already checked this" + refetch. Past due but `can_submit` true (grace/catch-up) → amber "Late — it might still count." Missed + `can_submit` false → read-only with timeline. G: view only. K cannot approve own task (`can_decide` false → no bar).

### 2.4 Approvals queue (Tasks → Approvals tab; also the kid's "challenge to check")
`api.listApprovals()` → card per `TaskInstance`: `Avatar`+name, emoji+title, "Sent 12 min ago", before/after thumbnails side by side (fixed 4:3, tap → full-size Sheet; "No photo needed" if `evidence==='none'`), note excerpt (2 lines), reward chips. Buttons: **Approve ✅** (one tap, no confirm) → `api.decideTask(id, true)` · **Send back** → same Sheet as §2.3 · tap card → detail.
- After Approve the card collapses with Toast "Approved. Sam earned +€0.50 ✨". Double-tap guard: Button disabled on press; `wrong_status` → refetch.
- Empty: "All checked! 🎉 / Nothing is waiting for you." Count badge in tab and nav updates from `counts.approvals`.

---

## 3. Money

### 3.1 `/money`
**Purpose:** entry point to wallets.
- **K:** `<Navigate replace to={`/money/${me.id}`} />`.
- **M:** `PageHeader` "Money". If `counts.requests > 0`: amber banner "{n} requests waiting" → `/money/requests`. Then one `ListRow` per kid: `Avatar`, name, three inline values (Spending · Savings · Time; "Owes €1.50" orange) from `balances[id]`, chevron → `/money/:id`. Always show the picker (even with one kid).
- **G:** if `grandparents_see_money` → same picker (read-only wallets); else `EmptyState` "Money is private in this family 🔒 / You can still send a gift." + **🎁 Send a gift** → `/money/spot`.
- **Empty:** no kids → "No kids yet" + **Add a child** → `/family/add`.

### 3.2 `/money/:memberId` (wallet)
**Purpose:** everything about one child's money, time and points. Data `api.wallet(memberId, 50)`.
**Who:** K only their own (others → `not_allowed` → "That's not for you"); M any kid; G read-only if `grandparents_see_money`.

**Layout**
1. `PageHeader`: back (M/G), `Avatar` + name; M overflow: **Spotted** (→ `/money/spot?member=`), **Edit allowance**, **Targets** (→ `/money/:id/targets`).
2. **Balance tiles** (3 × `Stat`): Spending `balances.spending` · Savings `savings` · Time `time`; plus a thin character line "Level 3 · 85 points" from `balances.points`.
3. **Owed banner** (if `spending < 0`): orange `Card` "⚠️ Sam owes €1.50. New money goes here first and pays it back."
4. **Actions** (2×2 big Buttons, **owner of the wallet = K**): **🐷 Move to savings** · **🛍️ Ask to spend** · **🏦 Ask to take out savings** · **⏳ Use time**. M (viewing a kid): **Move money** (to savings/spending), **Spotted**, **Edit allowance**. G: only **🎁 Send a gift**.
5. **Waiting** (wallet `requests` with `status==='pending'`): row "Asked to buy Lego · €12.00 · waiting". K: **Cancel** if `can_cancel` → `api.cancelRequest(id)`. M: **Approve / Say no** inline if `can_decide` (see §3.3). Decided requests (last 10) are under "Earlier" in `/money/requests`.
6. **Tallies** `Card`: `Segmented` **This week · This month · This year** → `tallies.week|month|ytd`. Grid: **Earned** `money_earned` (green) · **Lost** `money_lost` (orange) · **Saved** `money_saved` · **Spent** `money_spent` (slate) · **Interest** `interest` (green); time row: earned/lost/used (`time_*`); points row: earned/lost (`points_*`); tasks row "{tasks_done} done · {tasks_missed} not done · {tasks_open} to do". **Week only**: "Your tasks this week are worth €8.50 · 40 min · 90 points. Do extra to earn more!" from `possible_cents/minutes/points`. (M phrasing: "Possible this week".) Zeros show "—".
7. **Goals** (`wallet.goals`, `!archived`): emoji, title, `ProgressBar` `savings / target_cents`, ETA text as Home §1.1. Row tap → edit Sheet (title, emoji, `AmountInput` target; **Archive** → `api.archiveGoal`). **＋ New goal** Button → Sheet → `api.upsertGoal({id?, member_id?, title, target_cents, emoji})` (K omits `member_id`; M passes `memberId`). Empty: "No goals yet 🎯 / Pick something to save for." + **＋ New goal**.
8. **Targets** (`wallet.targets`, `active`): title, `ProgressBar` `current_value / threshold` (`completion_pct` as "%", `money_earned` as €, `points_earned` as XP), period Badge (Week/Month), prize chips (`prize_*`, `prize_text`), `last_result` line "Last week: ✅ Reached" / "Last week: not this time — new chance now". M: **Edit targets** → `/money/:id/targets`. Hidden entirely when none (K), empty hint for M.
9. **What happened** (history): `Chip`s **All · Money · Time · Points** (→ `api.history(memberId, {currency})`). `ListRow`: emoji by `kind` (§0.2), title = `label` or kind label, subtitle = `reason` (full sentence), meta "Mum · Tue 17 Nov 18:02" (`created_by` name; null → "Automatic"), pot Badge (Spending/Savings/Time/Points), right-aligned signed `amount` in class colour, thumbnail if `photo_path`. Reversed rows (`reversed_by`) amount struck through + Badge "Undone". Row tap → detail Sheet (reason, who, when, photo large). M with `can_reverse`: **Undo this** → Sheet "Undo this?" required `Textarea` reason → `api.reverseTransaction(id, reason)` → Toast "Undone. It stays in the list so everyone can see." **Show older** Button → `api.history(memberId, {before: last.created_at})` (no auto-infinite scroll).
   - Empty: "Nothing yet 🌱 / Do a task and it shows up here."

**Sheets (K)**
- **Move to savings 🐷**: "You have €12.50 to spend." `AmountInput` money + quick `Chip`s (€1 · €5 · Half · All). Button **Move it** → `api.transfer(me.id, cents, 'savings')` → Toast "Moved €5.00 to Savings 🐷". Over balance → inline "You only have €2.50 to move." (button disabled). `insufficient` → same copy. M version adds `Segmented` **To savings · To spending** (`'savings'|'spending'`).
- **Ask to spend 🛍️**: `Input` "What do you want to buy?" (`label`, required), `AmountInput` (cents), `Textarea` "Why? (optional)" (`note`). Button **Ask** → `api.createRequest('spend', cents, label, note)` → Toast "Asked! A grown-up will say yes or no." Over spending balance → "You have €4.00. Save up or earn more first." (disabled).
- **Ask to take out savings 🏦**: `AmountInput` ≤ savings, `Input` "What for?", `Textarea` note. Help: "Your savings stay safe until a grown-up says yes." → `api.createRequest('withdraw', cents, label, note)`.
- **Use time ⏳**: `AmountInput` minutes + `Chip`s (15 · 30 · 60), `Segmented` Wi-Fi · Game · Fun (sent as `label`), optional note → `api.createRequest('time', minutes, label, note)`. Over balance → "You have 20 min." Toast "Asked for 30 min of game time."
- **Edit allowance** (M): `AmountInput` "Every week" → `api.updateMember(memberId, {allowance_cents})`; help "Paid automatically at the start of each week."

**Edge:** zero balances show "€0.00", never hidden; time never negative; archived goals hidden; load error → Try again; G sees no action buttons except gift.

### 3.3 `/money/requests`
**Purpose:** decide (M) or follow (K) requests. `api.listRequests('pending')`; **Earlier** toggle → `'all'`.
- **M card per request:** `Avatar` + name, kind icon + sentence ("Wants to buy **Lego** · €12.00" / "Wants **€10.00** from Savings" / "Wants **30 min** game time"), `note`, "Asked 2 h ago", effect line: spend → "Approve = comes off Spending. You pay Sam in real life." · withdraw → "Moves Savings → Spending." · time → "Takes minutes off Sam's time." Buttons **Approve ✅** → `api.decideRequest(id, true)` (confirm sheet only for spend/withdraw > 0 shows the effect line + **Approve**) · **Say no** → Sheet with optional note chips ("Not this week", "Let's talk about it", "Save a bit more first") → `api.decideRequest(id, false, note)`.
- **K list:** own requests with status Badge (⏳ Waiting, ✅ Yes, ❌ Not this time + `decision_note`, ⚪ Cancelled); **Cancel** while pending (`can_cancel`) → `api.cancelRequest(id)`.
- **Empty:** M "No requests 🎉 / Nothing is waiting." K "No requests yet / Ask for something from your wallet."
- **Errors:** `insufficient` → "There isn't enough left for this. Say no or wait." `wrong_status` → refetch.

### 3.4 `/money/:memberId/targets` (M only)
**Purpose:** set weekly/monthly goals with prizes. Data `wallet.targets`.
1. `PageHeader` "Sam's targets" + **＋ Add**.
2. List of targets: title, sentence ("Do at least 80% of tasks this week → wins €2.00 + 10 points"), progress `current_value`, `last_result`; tap → edit Sheet; **Archive** → `api.archiveTarget(id)` (confirm).
3. **Add/Edit Sheet:** `Input` title; `Segmented` **Week · Month** (`period`); `Select` metric (`completion_pct` "Do this much of the tasks" / `money_earned` "Earn this much" / `points_earned` "Collect this many points"); threshold: `Input` 1–100 % for completion, `AmountInput` money for earned, `AmountInput` points; **Prize**: money, time (+`time_label`), points, `Input` words (`prize_text`). Live preview sentence. Save → `api.upsertTarget({id?, member_id, ...})`.
- Empty: "No targets yet 🎯 / Add one — the prize is paid automatically when it's reached." **Edge:** threshold 0 invalid; prize empty allowed but warn "No prize set."

### 3.5 `/money/spot` — Spotted
**Purpose:** record something good or bad on the spot, camera first. Reachable via the floating button (any screen) or `?member=:id`.
**Who:** M full; G **gift only** (reward, money only); K cannot open (→ `not_allowed`).

**Layout (single scroll, camera on top)**
1. **Photo** `PhotoCapture` (single, camera opens first; ≥ 56 px **📷 Take photo**, secondary **Skip photo**). Result thumbnail with **Retake**. Help: "Only {child}, parents and you can see this photo." → `photo_path`.
2. **Who?** `MemberPicker` single, kids only; preselect from `?member` or when only one kid.
3. **Reward / Consequence** big two-button toggle (full width, 64 px): **➕ Reward** (green) · **➖ Consequence** (orange). **No default** for M (avoid accidental fines). G: fixed header "🎁 Gift", toggle hidden.
4. **Amounts** (at least one > 0): `AmountInput` money (+ `Chip`s €0.50 · €1 · €2; plus-only `money_label` chips Reward · Extra · Prize; minus = "Fine", no label); time (+ `Chip`s 15 · 30 min, `Segmented` Wi-Fi · Game · Fun → `time_label`); points (`Chip`s 5 · 10 · 20). G: money only, label forced `gift`.
5. **Why?** `Textarea` required (≤ 80) + quick-reason `Chip`s that fill the field. Plus: "Helped without being asked", "Kind to a sibling", "Great effort", "Homework done early", "Tidy room". Minus: "Left the bike in the rain", "Didn't tidy up", "Screen after bedtime", "Unkind words", "Home late". Help: "Sam will read this. Say what happened, not what Sam is."
6. Footer Button **Check** (disabled until child + direction + ≥ 1 amount + reason; helper says what's missing).
7. **Confirm Sheet** "This is exactly what Sam will see": a preview of the kid's history row — emoji (🌟 / ⚠️ / 🎁), reason as subtitle, signed chips ("+€1.00 · +10 points" or "−€0.50"), "from Mum", photo thumbnail. Cause→effect line: "Left the bike in the rain, so −€0.50." Warning when a minus exceeds `balances[id].spending`: "Sam has €0.20, so Sam will owe €0.30." Buttons **Send to Sam** → `api.spot({member_id, direction, cents, minutes, points, money_label, time_label, reason, photo_path})` · **Go back**.
8. **Done state:** Toast "Sam got +€1.00 ✨" and a result card with **Spot another** (resets, reopens camera) / **Close** (back to previous screen).

**Edge:** camera denied → file picker; upload failure → "Photo didn't send — Try again or Skip photo" (spot still possible); `invalid` → `friendlyError`; double-send guard via disabled Button + one `Check` per attempt; G opening with `?member` of an adult → ignore.

---

## 4. Calendar `/calendar`
**Purpose:** shared agenda: events, reminders, birthdays (next 60 days).
**Who:** everyone sees; anyone adds; edit only `can_edit` (creator/managers); birthdays (`source==='profile_birthday'`) are read-only and edited via profile.

**Layout**
1. `PageHeader` "Calendar" + **＋** (Add).
2. `Segmented` **Mine · Everyone** (default **Everyone**). Mine = `for_members` is `[]` or includes `me.id`; Everyone = all occurrences.
3. **Agenda** from `api.listEvents(todayStartIso, todayStart+60d)` grouped by day with sticky headers ("Today · Mon 16 Nov", "Tomorrow", "Wed 18 Nov"). Row: emoji, title, "18:30" / "All day", `Badge` (Reminder · Birthday; none for plain events), who: "Everyone" or `Avatar` stack of `for_members`, repeat icon 🔁. Birthdays 🎂 default emoji.
4. Row tap → **View Sheet** (title, notes, when, who, repeat) with **Edit** (if `can_edit`).

**Add/Edit Sheet:** `Segmented` kind **Event · Reminder · Birthday** (`kind`); emoji `Field` (default 📅 / ⏰ / 🎂); `Input` title (required) ; `Input[type=date]` + `Input[type=time]` + Switch **All day** (`all_day`) → `starts_at` ISO built in `family.timezone`; `Select` repeat **Doesn't repeat · Every week · Every month · Every year** (`repeat`; Birthday defaults yearly); **Who?** `MemberPicker` multi with an **Everyone** Chip first (empty `for_members`); `Textarea` notes. Save → `api.upsertEvent(ev)` (Toast "Added to the calendar 📅"). Edit shows red **Delete** → confirm "Delete '{title}'? It disappears for everyone." (repeating: "…every time it repeats") → `api.deleteEvent(id)`.
**Empty:** "Nothing planned yet 📅 / Add a birthday, a match or a reminder." + **＋ Add**. Mine empty: "Nothing for you in the next 60 days." **Edge:** `not_allowed` on edit → Toast; past dates allowed; end of range note "Showing the next 60 days."
**Copy K:** Sheet title "New reminder"; button **Save**. Birthdays from profiles show "Sam's birthday 🎂".

---

## 5. Family

### 5.1 `/family`
**Purpose:** who's in the family and how to reach them.
1. `PageHeader` "Family" + (M) **＋ Add**.
2. Sections **Adults** (owner/parent/step_parent/guardian) · **Kids** · **Grandparents** (omit empty sections). `ListRow`: `Avatar` (emoji or `photo_path`), `display_name`, role label (Owner · Parent · Step-parent · Guardian · Grandparent · Kid), age from `profile.birthday` ("11 years"), status Badge: ✅ **Connected** (`linked`) / ⏳ **Not joined yet** (amber; M sees **Show QR** button → `api.createInvite(id)` → QR screen §5.2b). Tap → `/family/:id`.
3. (M) Footer rows: **📱 Devices** → `/family/devices`, **⚙️ Family rules** → `/family/settings`.
- K/G see no QR, devices or rules rows. Kids do **not** see sibling money anywhere here.
- `profile === null` (privacy) → detail shows "Emergency info is only shared with adults 🔒".
- **Empty** (just you): "Just you so far 👋 / Add your family." + **Add a person** (M).

### 5.2 `/family/add`
**Purpose:** add someone and show them a one-time join QR (no email).
**Step A (form):** `Input` Name (required) · `Select` Role: Parent, Step-parent, Guardian, Grandparent, Kid (owner sees all; non-owner managers only Kid + Grandparent; never Owner) · avatar emoji grid (defaults: kid 🧒, parent 🧑, grandparent 👵). Button **Make QR code** → `api.addMember(name, role, avatar)` → `{member_id, invite}`. Error `invalid` → "Please check the name."
**Step B (QR screen, `InviteQR`, full-bleed, shared with "Connect a device" and "Show QR"):**
1. Close ✕ (top-left, labelled "Done").
2. `QRCode` ≥ 260 px of `invite.token` on a forced **white** card with quiet zone (even in dark mode).
3. Short code, huge (≥ 40 px, monospace, grouped e.g. "ABC-123") with **Copy** Button.
4. Line: "**Show this to Sam — they scan it with their phone camera.**" Sub: "Works once. Expires in 29:41." Countdown from `invite.expires_at`, thin `ProgressBar`; announce at 5 min / 1 min / expired.
5. Fallback text: "Can't scan? On their phone open the app, tap “I have a code” and type ABC-123."
6. Buttons: **New code** → `api.createInvite(member_id)`; **Done**.
- Poll `api.listLogins(member_id)` every 5 s while visible; when ≥ 1 → success state "Sam joined! 🎉" with **Done**.
- **Expired:** QR dimmed + overlay "This code ran out ⏳" + **Make a new code**.
- Keep screen awake and max brightness if the browser allows.

### 5.3 `/family/:memberId` (profile + emergency card)
**Who:** everyone sees profile/emergency (subject to `emergency_visibility`); edit own + M edit anyone; manage section M only.
**Layout**
1. **Hero:** large `Avatar`, `display_name`, role Badge, ✅/⏳ status, "Level" chip for kids.
2. **Contact** (`Card`): **📞 Call Sam** Button → `tel:{profile.phone}` (full-width, 56 px); **📍 Open Life360** Button → if `life360` starts with `http` open it, otherwise show the text and open `https://www.life360.com`. Missing → muted "No phone number yet" / "No Life360 link yet" + **Add** (can edit).
3. **Emergency card** (`Card`, 🆘 header, red-tinted border): **Blood type** big Badge (≥ 28 px) and **⚠️ Allergies** in an orange highlighted box — both always first; then Medication · Medical notes · Doctor · School · Height (cm) · Birthday. **Emergency contacts**: each row name, relation, **📞** tap-to-call `tel:`. Empty field → "Not filled in yet" (muted). Managers + self also see `revolut_note` as "Bank note".
4. **Edit** Button (self/M): Sheet with all `Profile` fields + name/avatar/theme-independent → `api.updateMember(memberId, {display_name?, avatar?, profile})`. Contacts add/remove rows (name, phone, relation).
5. **Manage** (`ListRow`s, M only):
   - **Connect a device** → `api.createInvite(id)` → QR screen §5.2B (copy: "Use this if they lost their phone or got a new one.").
   - **Devices signed in** → Sheet from `api.listLogins(id)`: label ("Sam's phone"), "Last seen 2 h ago", Badge "This phone" if `current`; **Remove** → confirm "Sign Sam out on this phone?" → `api.removeLogin(login.id)`.
   - **Reset password** → Sheet: `Input` username (prefill `username`) + `Input[type=password]` → `api.setCredentials(username, password, id)`; secondary danger **Remove password** → confirm → `api.clearCredentials(id)`. `username_taken` → `friendlyError`. Shows "Password set ✅" / "No password yet" from `has_password`.
   - **Change role** (owner only; not for the owner row) → Sheet `Select` roles → `api.setRole(id, role)`.
   - **Allowance** (kids) → `AmountInput` → `api.updateMember(id, {allowance_cents})`.
   - **Remove Sam** (red; hidden for owner and for yourself) → Sheet "Remove Sam from the family? Sam will be signed out everywhere. This can't be undone." Button **Remove Sam** → `api.removeMember(id)` → Toast → `/family`.
**Edge:** hidden profile (null) → locked card; `not_allowed` on manage actions → Toast; K viewing a sibling: no manage, no balances.

### 5.4 `/family/devices` (M)
**Purpose:** a hand-kept list of the family's gadgets.
1. `PageHeader` "Devices" + **＋ Add**.
2. **Info `Card`** (ℹ️, always visible, dismiss not allowed): "**Wi-Fi scanning is coming later.** A web page can't look at your home network. For now, add devices by hand. Later, a small helper at home can find them for you."
3. `api.listDevices()` grouped by owner (`owner_id` → Avatar + name header; null → "Shared / everyone"). Row: type emoji (phone 📱 · tablet 📲 · console 🎮 · pc 🖥️ · tv 📺 · watch ⌚ · other 🔌), `name`, `model`, `phone_number` as tap-to-call, `mac`/`ip` small monospace muted. Tap → edit Sheet.
4. **Add/Edit Sheet:** `Input` name (required) · `Select` type · `MemberPicker` single owner (+ "Nobody / shared") · `Input` model · `Input[type=tel]` phone number · "Network (optional)" group: `Input` MAC (`AA:BB:CC:DD:EE:FF`, loose check) and IP · `Textarea` notes. Save → `api.upsertDevice(d)`; **Delete** (edit only) → confirm → `api.deleteDevice(id)`.
**Empty:** "No devices yet 📱 / Add phones, tablets and consoles so you can find them fast." + **＋ Add**. Non-M → `EmptyState` "Only parents can see this."

### 5.5 `/family/settings` (M; owner for danger zone)
**Purpose:** the family rules. Load from `AppState.family`; edit locally; one **Save changes** sticky Button appears when dirty → `api.updateFamily({name, currency, timezone, settings: changedKeysOnly})` → Toast "Saved ✅". Unsaved-leave confirm.
Sections (`Card`s with plain headings):
1. **Family**: `Input` name · `Select` currency (EUR €, GBP £, USD $, …) · `Select` timezone (searchable, defaults to detected).
2. **Money**: `interest_pct_month` number (0–20, step 0.1) "Savings grow by __% each month. Paid every week. €10 saved at 2% grows €0.20 a month." · `saver_bonus_points` "Bonus points when savings grew this week" · `no_savings_penalty_points` "Points lost if money was earned but none saved and none left (0 = off)".
3. **Tasks**: `late_grace_minutes` `Select` (0 · 5 · 10 · 15 · 30 · 60) "Extra time before a missed task costs anything" · `challenge_points_cap` number "Most points a kid or grandparent can promise" · `default_evidence` `Segmented` Photo · Photo or note · Nothing · (Advanced, collapsed) `catchup_days` "If nobody opens the app for a while, tasks are still made for this many past days."
4. **Privacy**: Switch `grandparents_see_money` "Grandparents can see the kids' money" · `Segmented` `emergency_visibility` Family · Adults only (help: "Who can see blood type, allergies and medication").
5. **Activity log** `ListRow` → Sheet: `api.listAudit(50)`; row = actor name (`members` lookup; null → "Automatic"), human sentence from `action` (known keys mapped; unknown shown as raw text in muted, `details` in a collapsible), time. **Show more** → `listAudit(100)`.
6. **Danger zone** (owner only; red-bordered `Card`): **Delete this family** → Sheet: "This deletes everyone's money, tasks, photos and calendar for good." `Input` "Type **Marks** to confirm" (enabled only on exact `family.name` match) → red **Delete everything** → `api.deleteFamily(name)` → sign out → welcome.
**Edge:** `invalid` from `updateFamily` → show field-level `friendlyError` (detail underscores → spaces); non-owner manager hitting `not_allowed` → Toast; numbers reject negatives; empty name blocked.

---

## 6. Component-to-screen quick map
`AmountInput` (money/time/points): tasks/new, targets, spot, wallet sheets, allowance, goals. `MemberPicker`: tasks/new, spot, calendar, devices, tasks filter. `PhotoCapture`: task detail (before + after), spot (single). `QRCode`: InviteQR only (add, connect device, show QR). `ProgressBar`: XP, goals, targets, today done/total, QR countdown. `Segmented`: tabs, tallies, kinds, evidence, mine/everyone. `Chip`: quick amounts, quick reasons, repeat, filters.

## 7. Cross-screen deep links
`/tasks?tab=approvals` · `/tasks?person=:id` · `/tasks/new?edit=:taskId` · `/money/spot?member=:id` · `/money/requests` · Home banners/links only use these.

## 8. Build order hint
Shared first: `format.ts` (money/time/dates), `levelInfo`, `TxKind` icon map, `EmptyState` copy slots, `InviteQR`, approve/send-back sheets, status Badge. Then Home → Tasks → Money → Spot → Calendar → Family.

## 9. Contract gaps & assumptions (please confirm / add; none block starting)
1. **RESOLVED (Superman):** `api.getInstance(id)` added (RPC `get_instance`).
   **RESOLVED:** Level/XP — use Pixel's `levelFromPoints` in `src\lib\theme.ts` (single source of truth; ignore the formula in §0.7). Photo helpers live in `src\lib\photos.ts` (`uploadPhoto`, `usePhotoUrl`).
2. **Photo upload/URL helpers are not in `api.ts`** — `PhotoCapture` needs `uploadPhoto(blob) → path` and `photoUrl(path) → signedUrl` (1 h) from the storage module.
3. **Send back** is assumed to leave the instance `open` with `decision_note` set (no `rejected` status).
4. **"Use time"** is a `createRequest('time', minutes, …)` needing approval; there is no direct kid `time_use`. `createRequest` has no `member` param, so only kids request for themselves.
5. **Level/XP** formula is not in the contract; see §0.7 (`levelInfo`).
6. **Goal progress** = total savings / `target_cents` (no per-goal allocation exists); several goals share the same savings balance.
7. **Partner status** on task detail: only names/ids are in `partners`; showing each partner's status would need `listInstances(occurs_on, occurs_on)` filtered by `group_id`.
8. **Audit `action` strings** are not enumerated — humanise known ones, fall back to raw text.
9. **Join flow** (scan → `/join?code=`, "I have a code" entry, `invitePreview`/`redeemInvite`) and **Me** screen are outside this spec.
10. Grandparent gift allows **money only** (label `gift`); points/time hidden. Kids see no sibling balances (state only returns balances they may see).
