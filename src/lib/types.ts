// Shared domain types — THE CONTRACT between SQL RPCs (supabase/migrations) and the UI.
// Money = integer cents, time = integer minutes, points = integer XP.

export type Role = 'owner' | 'parent' | 'step_parent' | 'guardian' | 'grandparent' | 'kid';
export const MANAGER_ROLES: Role[] = ['owner', 'parent', 'step_parent', 'guardian'];
export const isManager = (r: Role | undefined | null) => !!r && MANAGER_ROLES.includes(r);

export type Currency = 'money' | 'time' | 'points';
export type Pot = 'spending' | 'savings' | 'time' | 'points';
export type TimeLabel = 'wifi' | 'game' | 'fun';
export type MoneyLabel = 'pocket' | 'extra' | 'reward' | 'prize' | 'gift';

export interface Theme {
  accent?: string;          // key of ACCENTS in src/lib/theme.ts, e.g. 'violet'
  mode?: 'light' | 'dark' | 'system';
  character?: string;       // key of CHARACTERS, e.g. 'fox'
  classic?: boolean;        // plain look for parents
  verses?: boolean;         // false = this person hides Bible verses (feature 'faith'); default shown
}

export interface EmergencyContact { name: string; phone: string; relation?: string }

export interface Profile {
  birthday?: string;        // YYYY-MM-DD
  phone?: string;
  height_cm?: number;
  blood_type?: string;      // 'A+','O-',...
  allergies?: string;
  medication?: string;
  medical_notes?: string;
  doctor?: string;
  school?: string;
  emergency_contacts?: EmergencyContact[];
  life360?: string;         // link or name, no API
  revolut_note?: string;    // manual note; real integration is phase 5
}

export interface Member {
  id: string;
  role: Role;
  relation: string | null;  // custom label shown instead of the role, e.g. "Bonus dad", "Godmother"
  display_name: string;
  avatar: string;           // emoji
  photo_path: string | null;
  theme: Theme;
  profile: Profile | null;  // null when hidden by privacy setting
  linked: boolean;          // has at least one signed-in device
  username: string | null;  // only for self / managers
  has_password: boolean;
  allowance_cents: number | null;  // pocket money per period (null when the caller may not see this member's money)
  allowance_period: 'week' | 'month' | null;  // how often it's paid
  allowance_day: number | null;    // week: ISO weekday 1=Mon..7=Sun · month: day of month 1..28
  allowance_since: string | null;  // YYYY-MM-DD the current schedule started (no pay days before it)
  created_at: string;
}

export interface FamilySettings {
  interest_pct_month: number;
  saver_bonus_points: number;
  no_savings_penalty_points: number;
  late_grace_minutes: number;
  challenge_points_cap: number;
  grandparents_see_money: boolean;
  managers_add_adults: boolean;   // owner setting: other parents may add adults (default off = owner only)
  emergency_visibility: 'family' | 'adults';
  catchup_days: number;
  default_evidence: Evidence;
  spend_currency: string | null;  // currency the kids spend in (e.g. 'ZAR'); null = same as the family currency
  spot_rules?: SpotRules;          // fixed Spotted amounts (Family rules → Spotted); missing on old data = defaults
  /** Money school reward: family-currency cents a kid gets for each lesson finished the first time (0/missing = off). */
  lesson_reward_cents?: number;
  /**
   * Bible time surprise: family-currency cents a kid gets once a day for opening the Bible App from Sow & Grow
   * (0/missing = off). Only managers receive it: get_state leaves the key out for kids and grandparents.
   */
  bible_reward_cents?: number;
  /**
   * Money school lesson plan: which lesson themes open in which family-local month, { "YYYY-MM": [themeId, …] }
   * (up to 3 a month; read it with planOf in features/help/learn/bank.ts). Missing on old data = {}.
   */
  lesson_plan?: Record<string, string[]>;
  features: Features;                // which parts of the app are switched on (parent admin → Features)
}

/** One Spotted amount: what a reward gives or a consequence costs (all ≥ 0; money in cents). */
export interface SpotAmount { cents: number; minutes: number; points: number }
/** Family rule: Spotted is a quick report, these amounts are filled in automatically. */
export interface SpotRules { reward: SpotAmount; consequence: SpotAmount }
/** Same as app.default_spot_rules() on the server. */
export const DEFAULT_SPOT_RULES: SpotRules = {
  reward: { cents: 500, minutes: 0, points: 10 },
  consequence: { cents: 500, minutes: 0, points: 10 },
};
/** The family's Spotted amounts, with the defaults filled in when the family never set them. */
export function familySpotRules(settings: Partial<FamilySettings> | null | undefined): SpotRules {
  const r = settings?.spot_rules;
  const one = (a: Partial<SpotAmount> | undefined, b: SpotAmount): SpotAmount =>
    ({ cents: a?.cents ?? b.cents, minutes: a?.minutes ?? b.minutes, points: a?.points ?? b.points });
  return { reward: one(r?.reward, DEFAULT_SPOT_RULES.reward), consequence: one(r?.consequence, DEFAULT_SPOT_RULES.consequence) };
}

/** The Money school reward per lesson in family-currency cents (0 = off), read like the server does (app.lesson_reward_cents). */
export function lessonRewardOf(settings: Partial<FamilySettings> | null | undefined): number {
  const v = settings?.lesson_reward_cents;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 0), 100_000) : 0;
}

/** The Bible time surprise in family-currency cents (0 = off or not visible to you), like app.bible_reward_cents. */
export function bibleRewardOf(settings: Partial<FamilySettings> | null | undefined): number {
  const v = settings?.bible_reward_cents;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.trunc(v), 0), 100_000) : 0;
}

/** Parts of the app a parent can switch on/off. Chores + the spending pot are always on (the core). */
export type FeatureKey =
  | 'challenges'   // challenges (incl. kids challenging parents) + partnership
  | 'spotted'      // Spotted: on-the-spot reward / consequence (+ grandparent gifts)
  | 'allowance'    // automatic pocket money (weekly or monthly, per kid)
  | 'requests'     // kids ask to spend money / use time
  | 'savings'      // savings pot + moving money to savings + withdraw requests
  | 'interest'     // weekly interest on savings (needs savings)
  | 'saver_rules'  // saver bonus + no-savings rule (needs savings)
  | 'goals'        // savings goals (needs savings)
  | 'targets'      // weekly/monthly targets with prizes
  | 'time'         // time currency (Wi-Fi / game / fun minutes)
  | 'points'       // points (XP) + characters & levels
  | 'calendar'     // family calendar, reminders, birthdays
  | 'emergency'    // emergency card (health info, contacts, Life360)
  | 'devices'      // device list
  | 'ask'          // "Ask Pocket" AI helper for questions (Claude), off until a parent turns it on
  | 'bank'         // real bank balance (e.g. Revolut) typed in by a parent or the kid — information only
  | 'learn'        // Money school: short lessons about saving, interest, earning and spending (+ XP once per lesson)
  | 'faith'        // Faith, hope and love: verse of the day, faith reflections, Bible App links (each person can hide verses)
  | 'needs'        // What we need: grown-ups note what each kid needs and tick it off when bought (kids never see it)
  | 'loans';       // a kid borrows from a parent and picks a repayment plan; it comes off their pocket money
export type Features = Record<FeatureKey, boolean>;
/** Features that only work when another feature is on. */
export const FEATURE_NEEDS: Partial<Record<FeatureKey, FeatureKey>> = { interest: 'savings', saver_rules: 'savings', goals: 'savings' };
/** "Start small" preset: learn the basics first, switch more on later. */
export const START_SMALL: Features = {
  challenges: false, spotted: true, allowance: true, requests: true, savings: false, interest: false, saver_rules: false,
  goals: false, targets: false, time: false, points: true, calendar: true, emergency: true, devices: false, ask: false,
  bank: true, learn: true, faith: false, needs: true, loans: false,
};
export const EVERYTHING: Features = {
  challenges: true, spotted: true, allowance: true, requests: true, savings: true, interest: true, saver_rules: true,
  goals: true, targets: true, time: true, points: true, calendar: true, emergency: true, devices: true, ask: false,
  bank: true, learn: true, faith: true, needs: true, loans: true,
};
/** Is a feature effectively on (respecting FEATURE_NEEDS)? Missing keys count as on (older data). */
export function featureOn(f: Partial<Features> | undefined | null, key: FeatureKey): boolean {
  if (!f || f[key] === false) return false;
  const need = FEATURE_NEEDS[key];
  return need ? featureOn(f, need) : true;
}

/** One question a member asked the "Ask Pocket" helper (parents can see all, kids their own). */
export interface AskEntry {
  id: string; member_id: string; question: string; answer: string | null; status: 'pending' | 'answered' | 'failed';
  created_at: string;
}

/**
 * A finished Money school lesson (`points` = XP it gave, 0 when none; `money_cents` = money it gave in the family
 * currency, at the finish or later as a reward for an earlier lesson; 0 when none or undone).
 */
export interface LessonDone { member_id: string; lesson: string; done_at: string; points: number; money_cents: number }
/**
 * finish_lesson answer: `first` = finished just now (not before); `points` = XP given now (0 when not a kid / points off /
 * again); `money_cents` = money put in the Wallet now (0 when not a kid / no reward set / again).
 */
export interface FinishLessonResult { lesson: string; done_at: string; first: boolean; points: number; money_cents: number }

/** One kid's lessons that never got the Money school reward (e.g. finished before there was a value). */
export interface LessonRewardsDueKid {
  member_id: string;
  count: number;
  lessons: { lesson: string; title: string; done_at: string }[];
  /** Today's value per lesson. */
  cents_each: number;
  total_cents: number;
}
/** lesson_rewards_due (managers): per kid, plus the totals at today's value. */
export interface LessonRewardsDue { cents_each: number; count: number; total_cents: number; kids: LessonRewardsDueKid[] }

/**
 * bible_opened answer: `counted` = this tap was counted (a kid with faith and verses on); `first_today` = the first open
 * of the family-local day; `rewarded_cents` = the Bible time surprise put in the Wallet just now (0 when none).
 */
export interface BibleOpened { counted: boolean; first_today?: boolean; rewarded_cents: number }
/** One active kid in bible_opens_summary: days they opened the Bible App from Sow & Grow. */
export interface BibleOpensKid {
  member_id: string;
  /** Days in this family-local month. */
  days_month: number;
  /** Days in the last 7 days (today included). */
  days_7: number;
  /** Family-local YYYY-MM-DD of the last open (null = never). */
  last_day: string | null;
  /** Bible time money this month, not undone. */
  rewarded_month_cents: number;
}
/** bible_opens_summary (managers): the current value and one row per active kid. */
export interface BibleOpensSummary { cents_each: number; today: string; month_start: string; kids: BibleOpensKid[] }

/** A real bank-account balance typed in by a parent or the kid (information only, not part of the app ledger). */
export interface BankBalance {
  id: string; member_id: string; label: string; amount_cents: number; currency: string; as_of: string; note: string | null;
  created_by: string | null; created_at: string; can_delete: boolean;
}

export interface Family {
  id: string; name: string; currency: string; timezone: string; settings: FamilySettings; created_at: string;
}

export interface Balances { spending: number; savings: number; time: number; points: number }

export interface AppState {
  me: Member;
  family: Family;
  members: Member[];
  balances: Record<string, Balances>;   // only members the caller may see
  /** loans: loan requests waiting for a yes or no (managers only, 0 for everyone else or when loans are off). */
  counts: { approvals: number; requests: number; my_requests: number; loans?: number; initiatives?: number };
  today: string;                        // YYYY-MM-DD in family timezone
  now: string;
}

export interface Invite {
  token: string; short_code: string; expires_at: string; member_id: string; display_name: string; role: Role;
}

export interface InvitePreview {
  ok: boolean; error?: string; family_name?: string; display_name?: string; role?: Role; avatar?: string;
  expires_at?: string; linked_elsewhere?: boolean;
}

export interface LoginDevice { id: string; label: string | null; created_at: string; last_seen_at: string; current: boolean }

// ---------- tasks ----------
export type TaskKind = 'chore' | 'challenge';
export type Repeat = 'once' | 'daily' | 'weekdays' | 'weekly' | 'days';
export type Evidence = 'photo' | 'photo_or_note' | 'none';
export type InstanceStatus = 'open' | 'submitted' | 'approved' | 'missed' | 'excused' | 'cancelled';

export interface TaskInput {
  kind: TaskKind;
  title: string;
  details?: string | null;
  emoji?: string;
  assignees: string[];          // >1 = partnership (one task per assignee, same group_id)
  reward_cents?: number; reward_minutes?: number; reward_points?: number; reward_text?: string | null;
  time_label?: TimeLabel;
  penalty_cents?: number; penalty_minutes?: number; penalty_points?: number;
  repeat: Repeat;
  repeat_days?: number[];       // ISO weekday 1=Mon..7=Sun, used when repeat = 'days' (weekly uses start_on's weekday)
  start_on: string;             // YYYY-MM-DD
  end_on?: string | null;
  due_time: string;             // 'HH:MM' family local time
  evidence?: Evidence;
}

export interface Task extends Required<Omit<TaskInput, 'assignees' | 'details' | 'reward_text' | 'end_on'>> {
  id: string; group_id: string; assignee_id: string; created_by: string; active: boolean; created_at: string;
  details: string | null; reward_text: string | null; end_on: string | null;
}

export interface TaskInstance {
  id: string; task_id: string; group_id: string; assignee_id: string;
  occurs_on: string; due_at: string; status: InstanceStatus;
  before_path: string | null; after_path: string | null; note: string | null;
  submitted_at: string | null; decided_by: string | null; decided_at: string | null; decision_note: string | null;
  // denormalised task fields
  kind: TaskKind; title: string; details: string | null; emoji: string; created_by: string; evidence: Evidence;
  reward_cents: number; reward_minutes: number; reward_points: number; reward_text: string | null; time_label: TimeLabel;
  penalty_cents: number; penalty_minutes: number; penalty_points: number;
  partners: string[];           // other assignees in the same group (partnership)
  can_submit: boolean; can_decide: boolean; can_excuse: boolean;
}

// ---------- ledger ----------
export type TxKind = 'task_reward' | 'task_penalty' | 'bonus' | 'fine' | 'gift' | 'transfer' | 'interest' | 'spend'
  | 'time_use' | 'prize' | 'saver_bonus' | 'no_savings_penalty' | 'excuse' | 'reversal' | 'allowance' | 'payout'
  | 'loan_repayment'
  | 'adjustment'; // display-only: a loan repayment (or its undo) as seen by grandparents/aunts/uncles (server-masked)

export interface Transaction {
  id: string; member_id: string; currency: Currency; pot: Pot; amount: number; kind: TxKind;
  label: string | null; reason: string; photo_path: string | null;
  source_type: string | null; source_id: string | null;
  reversed_by: string | null; effective_at: string; created_at: string; created_by: string | null;
  /** For a loan repayment: true = undo with reverseLoanRepayment. */
  can_reverse: boolean;
  /** A loan repayment (or its undo) seen by someone outside the kid and the parents: shown as "Pocket money adjustment". */
  masked?: boolean;
}

// ---------- loans ----------
/** per_pay: a fixed installment from each pocket money; next_pay: everything from the next pocket money. */
export type LoanPlan = 'per_pay' | 'next_pay';
export type LoanStatus = 'requested' | 'offered' | 'active' | 'declined' | 'cancelled' | 'forgiven' | 'repaid';
/** A loan from a parent to a kid (list_loans: the kid's own, or every kid's for managers). Amounts in family cents. */
export interface Loan {
  id: string; member_id: string; purpose: string;
  amount_cents: number;
  /** One-time fee ("interest") a parent added to the offer. */
  fee_cents: number;
  /** amount + fee. */
  total_cents: number;
  repaid_cents: number;
  outstanding_cents: number;
  forgiven_cents: number;
  plan: LoanPlan;
  installment_cents: number;
  status: LoanStatus;
  requested_by: string | null; decided_by: string | null; decided_at: string | null; decision_note: string | null;
  started_at: string | null; ended_at: string | null; created_at: string;
  /** Open loans only: what the next pocket money repays, and when (an estimate; null without pocket money). */
  next_amount_cents: number | null;
  next_pay_on: string | null;
  /** ceil(outstanding / installment): pocket-money days still to go. */
  pay_days_left: number | null;
  payoff_on: string | null;
  can_decide: boolean; can_accept: boolean; can_cancel: boolean; can_repay: boolean; can_forgive: boolean;
}
export interface LoanRequestInput {
  member: string; amount: number; purpose: string; plan: LoanPlan; installment?: number | null;
}

// ---------- proud moments ("Look what I did ⭐") ----------
export type InitiativeStatus = 'waiting' | 'rewarded' | 'thanked' | 'talk' | 'cancelled';
export type InitiativeDecision = 'reward' | 'thanks' | 'talk';
/** Something good a kid did on their own initiative, waiting for (or decided by) a parent. */
export interface Initiative {
  id: string; member_id: string;
  what: string;
  photo_path: string | null;
  status: InitiativeStatus;
  decided_by: string | null; decided_at: string | null; decision_note: string | null;
  reward_cents: number; reward_minutes: number; reward_points: number;
  created_at: string;
  can_decide: boolean; can_cancel: boolean;
}

/**
 * One kid on the pay-out overview (payout_summary, managers only). All amounts in family-currency cents.
 * The cycle runs since the latest pay-out that was not undone;
 * start + allowance + rewards + consequences + loan + lessons + bible + other = wallet.
 */
export interface PayoutRow {
  member_id: string;
  wallet_cents: number;
  /** max(wallet, 0): what "Paid ✅" settles. */
  to_pay_cents: number;
  /** > 0 when the wallet is below zero (it comes off next time). */
  owes_cents: number;
  last_payout_at: string | null;
  last_payout_cents: number | null;
  /** last_payout_at, or when the kid joined. */
  since: string;
  /** Carried over from before the cycle. */
  start_cents: number;
  allowance_cents: number;
  /** Tasks done, rewards, prizes, gifts, excused fines (not Money school or Bible time: lessons_cents, bible_cents). */
  rewards_cents: number;
  /** Fines, missed tasks (≤ 0). */
  consequences_cents: number;
  /** Loan repayments, net of undos: ≤ 0, or > 0 when only undos of earlier repayments fall in this cycle. */
  loan_cents: number;
  /** Money school rewards (one per lesson finished), net of undos. */
  lessons_cents: number;
  /** Spent with OK, moved to or from savings. */
  other_cents: number;
  /** Money school rewards in this cycle that were not undone. */
  lessons_count: number;
  /** Their one amount per lesson (null when there are none, amounts differ, or one was undone in this cycle). */
  lessons_each_cents: number | null;
  /** Lessons finished (as a kid) in this cycle. */
  lessons_finished: number;
  /** Lessons finished as a kid that never got the Money school reward (any time). */
  lessons_unrewarded: number;
  /** Bible time surprises (one per day the kid opened the Bible App from Sow & Grow), net of undos. */
  bible_cents: number;
  /** Bible time surprises in this cycle that were not undone. */
  bible_days: number;
  /** Their one amount per day (null when there are none, amounts differ, or one was undone in this cycle). */
  bible_each_cents: number | null;
  /** The active loan: what is still to pay, and what it was for (null without one). */
  loan_outstanding_cents: number | null;
  loan_purpose: string | null;
  allowance_cents_per_period: number | null;
  allowance_period: 'week' | 'month' | null;
  allowance_day: number | null;
  /** Local date (YYYY-MM-DD) of the latest pocket money. */
  last_allowance_on: string | null;
}

export interface PayoutResult { id: string; member_id: string; amount_cents: number; paid_at: string }

export interface SpotInput {
  member_id: string;
  direction: 'plus' | 'minus';        // plus = reward / bonus / gift, minus = consequence / fine
  cents?: number; minutes?: number; points?: number;   // all positive numbers
  money_label?: MoneyLabel; time_label?: TimeLabel;
  reason: string;
  photo_path?: string | null;
}

export interface Tally {
  period: 'week' | 'month' | 'ytd'; start: string; end: string;   // dates, end exclusive
  money_earned: number; money_lost: number; money_spent: number; money_saved: number; interest: number;
  /** Loans (20261116002300), for the kid and the parents only — null for everyone else; older servers leave them
   *  out (treat undefined as null). loan_repaid is signed: + paid back, − a repayment from an earlier period undone. */
  loan_repaid?: number | null; loan_borrowed?: number | null;
  time_earned: number; time_lost: number; time_used: number;
  points_earned: number; points_lost: number;
  tasks_done: number; tasks_missed: number; tasks_open: number;
  possible_cents: number; possible_minutes: number; possible_points: number;  // sum of rewards of tasks due in period
}

export type RequestKind = 'spend' | 'withdraw' | 'time';
export type RequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';
export interface MoneyRequest {
  id: string; member_id: string; kind: RequestKind; amount: number; label: string | null; note: string | null;
  status: RequestStatus; decided_by: string | null; decided_at: string | null; decision_note: string | null;
  created_at: string; can_decide: boolean; can_cancel: boolean;
}

export interface Goal {
  id: string; member_id: string; title: string; target_cents: number; emoji: string; archived: boolean; created_at: string;
}

export type TargetMetric = 'completion_pct' | 'money_earned' | 'points_earned';
export interface TargetInput {
  id?: string | null; member_id: string; title: string; period: 'week' | 'month'; metric: TargetMetric; threshold: number;
  prize_cents?: number; prize_minutes?: number; prize_points?: number; prize_text?: string | null; time_label?: TimeLabel;
}
export interface Target extends Required<Omit<TargetInput, 'id' | 'prize_text'>> {
  id: string; prize_text: string | null; active: boolean;
  current_value: number;                // progress in the current period
  last_result: { period_start: string; value: number; met: boolean } | null;
}

export interface Wallet {
  member: Member;
  balances: Balances;
  tallies: { week: Tally; month: Tally; ytd: Tally };
  history: Transaction[];               // newest first, p_history_limit rows
  goals: Goal[];
  requests: MoneyRequest[];             // pending + last 10 decided
  targets: Target[];
  avg_weekly_savings_cents: number;     // last 4 weeks net savings growth, for goal ETA
}

// ---------- calendar & devices ----------
export type EventKind = 'event' | 'reminder' | 'birthday';
export interface EventInput {
  id?: string | null; title: string; notes?: string | null; emoji?: string; kind: EventKind;
  starts_at: string;                    // ISO timestamp
  all_day?: boolean; repeat?: 'none' | 'weekly' | 'monthly' | 'yearly'; for_members?: string[];  // [] = everyone
}
export interface EventOccurrence {
  id: string; source: 'event' | 'profile_birthday'; title: string; notes: string | null; emoji: string; kind: EventKind;
  occurs_at: string; all_day: boolean; repeat: string; for_members: string[]; created_by: string | null; can_edit: boolean;
}

export type DeviceType = 'phone' | 'tablet' | 'console' | 'pc' | 'tv' | 'watch' | 'other';
export interface DeviceInput {
  id?: string | null; owner_id?: string | null; name: string; type: DeviceType; model?: string | null;
  phone_number?: string | null; mac?: string | null; ip?: string | null; notes?: string | null;
}
export interface Device extends Required<Omit<DeviceInput, 'id'>> { id: string; created_at: string }

/** "What we need": something a kid needs, noted by a grown-up. Kids never see these (surprises stay surprises). */
export type NeedStatus = 'open' | 'claimed' | 'done' | 'cancelled';
export const NEED_DEFAULT_OCCASIONS = ['Anytime', 'New term', 'Birthday', 'Christmas'] as const;
export interface Need {
  id: string;
  member_id: string;
  item: string;
  details: string | null;
  occasion: string;
  status: NeedStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  done_by: string | null;
  done_at: string | null;
  done_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** What the caller may do now (worked out by the server). */
  can_edit: boolean;
  can_claim: boolean;
  can_release: boolean;
  can_complete: boolean;
  can_reopen: boolean;
  can_cancel: boolean;
}

export interface TickResult {
  instances_created: number; missed: number; weeks_closed: number; months_closed: number;
}
