import { minutes, money, points, roleLabel } from '../../lib/format';
import type { Member } from '../../lib/types';

export interface AuditEntry { id: number; actor: string | null; action: string; details: Record<string, unknown>; created_at: string }
export interface AuditText { emoji: string; text: string; known: boolean }

export const SETTING_LABEL: Record<string, string> = {
  name: 'name',
  currency: 'currency',
  timezone: 'time zone',
  interest_pct_month: 'interest',
  saver_bonus_points: 'saver bonus',
  no_savings_penalty_points: 'no-savings penalty',
  late_grace_minutes: 'late grace time',
  challenge_points_cap: 'challenge points cap',
  grandparents_see_money: 'grandparents see money',
  emergency_visibility: 'emergency card visibility',
  catchup_days: 'catch-up days',
  default_evidence: 'default proof',
};

const MEMBER_FIELD: Record<string, string> = {
  display_name: 'name',
  avatar: 'avatar',
  photo_path: 'photo',
  theme: 'look',
  profile: 'emergency card',
  allowance_cents: 'weekly pocket money',
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Turns an audit_log row into a short human sentence. Unknown actions fall back to the raw action string. */
export function describeAudit(e: AuditEntry, byId: Record<string, Member>, currency: string): AuditText {
  const d = e.details ?? {};
  const who = (idKey = 'member', nameKey = 'name') => {
    const id = str(d[idKey]);
    return (id && byId[id]?.display_name) || str(d[nameKey]) || 'someone who left';
  };
  const title = str(d.title) ? `“${str(d.title)}”` : 'a task';
  const amounts = () => {
    const parts: string[] = [];
    if (num(d.cents)) parts.push(money(Math.abs(num(d.cents)), currency));
    if (num(d.minutes)) parts.push(minutes(Math.abs(num(d.minutes))));
    if (num(d.points)) parts.push(points(Math.abs(num(d.points))));
    return parts.length ? ` (${list(parts)})` : '';
  };
  const k = (emoji: string, text: string): AuditText => ({ emoji, text, known: true });

  switch (e.action) {
    case 'family.create': return k('🏠', `Started the family${str(d.name) ? ` “${str(d.name)}”` : ''}`);
    case 'family.update': {
      const keys = Object.keys(d).flatMap((key) =>
        key === 'settings' && d.settings && typeof d.settings === 'object' ? Object.keys(d.settings as object) : [key]);
      const names = keys.map((x) => SETTING_LABEL[x] ?? x);
      return k('⚙️', names.length ? `Changed the family ${list(names)}` : 'Changed family settings');
    }
    case 'invite.create': return k('🔗', `Made a join code for ${who()}`);
    case 'invite.redeem': return k('📲', `${who()} joined on a device`);
    case 'member.add': return k('➕', `Added ${who()}${str(d.role) ? ` as ${roleLabel(str(d.role)).toLowerCase()}` : ''}`);
    case 'member.update': {
      const fields = Array.isArray(d.fields) ? (d.fields as unknown[]).map((f) => MEMBER_FIELD[String(f)] ?? String(f)) : [];
      return k('✏️', `Changed ${who()}’s ${fields.length ? list(fields) : 'details'}`);
    }
    case 'member.role': return k('🔁', `Made ${who()} ${roleLabel(str(d.role)).toLowerCase() || 'a new role'}`);
    case 'member.remove': return k('👋', `Removed ${who()} from the family`);
    case 'login.set_password': return k('🔑', `Set a sign-in password for ${who()}`);
    case 'login.clear_password': return k('🔑', `Removed ${who()}’s password`);
    case 'login.password': return k('🔑', 'Changed their own password');
    case 'login.remove': return k('📵', `Signed ${who()} out on a device`);
    case 'task.create': return k('📝', `Made a new task ${title}`);
    case 'task.update': return k('📝', 'Changed a task');
    case 'task.archive': return k('🗄️', `Stopped the task ${title}`);
    case 'task.submit': return k('✋', `Handed in ${title}`);
    case 'task.approve': return k('✅', `Approved ${title}${str(d.assignee) ? ` for ${who('assignee')}` : ''}`);
    case 'task.reject': return k('↩️', `Sent back ${title}${str(d.assignee) ? ` to ${who('assignee')}` : ''}`);
    case 'task.excuse': return k('🙏', `Excused ${title}`);
    case 'spot.bonus': return k('⭐', `Gave ${who()} a bonus${amounts()}`);
    case 'spot.fine': return k('⚠️', `Gave ${who()} a fine${amounts()}`);
    case 'spot.gift': return k('🎁', `Sent ${who()} a gift${amounts()}`);
    case 'tx.reverse': return k('↩️', `Undid a ${str(d.kind) ?? 'transaction'} for ${who()}${str(d.reason) ? ` — ${str(d.reason)}` : ''}`);
    case 'money.transfer':
      return k('🐷', `Moved ${money(num(d.amount), currency)} to ${str(d.to) === 'spending' ? 'spending' : 'savings'} for ${who()}`);
    case 'request.create': return k('🙋', 'Made a request');
    case 'request.approve': return k('✅', `Said yes to ${who()}’s request`);
    case 'request.decline': return k('❌', `Said no to ${who()}’s request`);
    case 'request.cancel': return k('🚫', 'Cancelled a request');
    case 'goal.create': return k('🎯', `Set a goal ${title} for ${who()}`);
    case 'goal.update': return k('🎯', `Changed the goal ${title}`);
    case 'goal.archive': return k('🎯', `Closed the goal ${title}`);
    case 'target.create': return k('🏁', `Set a target ${title} for ${who()}`);
    case 'target.update': return k('🏁', `Changed the target ${title}`);
    case 'target.archive': return k('🏁', `Closed the target ${title}`);
    case 'event.create': return k('📅', `Added ${str(d.title) ? `“${str(d.title)}”` : 'an event'} to the calendar`);
    case 'event.update': return k('📅', `Changed ${str(d.title) ? `“${str(d.title)}”` : 'an event'} in the calendar`);
    case 'event.delete': return k('📅', `Deleted ${str(d.title) ? `“${str(d.title)}”` : 'an event'} from the calendar`);
    case 'device.create': return k('📱', `Added the device “${str(d.name) ?? '?'}”`);
    case 'device.update': return k('📱', `Changed the device “${str(d.name) ?? '?'}”`);
    case 'device.delete': return k('📱', `Deleted the device “${str(d.name) ?? '?'}”`);
    default: return { emoji: '•', text: e.action, known: false };
  }
}
