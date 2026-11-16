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
  allowance_cents: number;  // weekly pocket money, paid automatically at week start
  created_at: string;
}

export interface FamilySettings {
  interest_pct_month: number;
  saver_bonus_points: number;
  no_savings_penalty_points: number;
  late_grace_minutes: number;
  challenge_points_cap: number;
  grandparents_see_money: boolean;
  emergency_visibility: 'family' | 'adults';
  catchup_days: number;
  default_evidence: Evidence;
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
  counts: { approvals: number; requests: number; my_requests: number };
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
  | 'time_use' | 'prize' | 'saver_bonus' | 'no_savings_penalty' | 'excuse' | 'reversal' | 'allowance';

export interface Transaction {
  id: string; member_id: string; currency: Currency; pot: Pot; amount: number; kind: TxKind;
  label: string | null; reason: string; photo_path: string | null;
  source_type: string | null; source_id: string | null;
  reversed_by: string | null; effective_at: string; created_at: string; created_by: string | null;
  can_reverse: boolean;
}

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

export interface TickResult {
  instances_created: number; missed: number; weeks_closed: number; months_closed: number;
}
