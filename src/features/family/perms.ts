// Client-side mirror of the server's permission rules (supabase/migrations/20261116000100_api_core.sql).
// Only used to HIDE buttons people can't use — the server still decides and may answer `not_allowed`.
import { isManager, type Member, type Role } from '../../lib/types';

type Who = Pick<Member, 'id' | 'role'>;
type Target = Pick<Member, 'id' | 'role' | 'linked'>;

const CARED_FOR: Role[] = ['kid', 'grandparent'];

/** app.can_manage_login: QR for a device, set/clear password, list/remove signed-in devices. */
export function canManageLogin(me: Who, m: Target): boolean {
  if (me.id === m.id || me.role === 'owner') return true;
  if (!isManager(me.role) || m.role === 'owner') return false;
  return CARED_FOR.includes(m.role) || !m.linked;
}

/** app.can_edit_member: name, avatar, theme, profile. */
export function canEditMember(me: Who, m: Pick<Member, 'id' | 'role'>): boolean {
  if (me.id === m.id || me.role === 'owner') return true;
  return isManager(me.role) && CARED_FOR.includes(m.role);
}

/** Weekly pocket money: managers only (and only where they may edit the member). */
export function canSetAllowance(me: Who, m: Pick<Member, 'id' | 'role'>): boolean {
  return isManager(me.role) && canEditMember(me, m);
}

/** set_role: the owner, for someone else. */
export function canChangeRole(me: Who, m: Pick<Member, 'id'>): boolean {
  return me.role === 'owner' && me.id !== m.id;
}

/** remove_member: never yourself or the owner; owner anyone else; managers whoever they manage. */
export function canRemoveMember(me: Who, m: Target): boolean {
  if (me.id === m.id || m.role === 'owner') return false;
  if (me.role === 'owner') return true;
  return isManager(me.role) && canManageLogin(me, m);
}

/** Roles a manager may give a new member (owner: all; other managers: kid + grandparent). */
export function addableRoles(me: Who): Exclude<Role, 'owner'>[] {
  if (me.role === 'owner') return ['parent', 'step_parent', 'guardian', 'grandparent', 'kid'];
  if (isManager(me.role)) return ['kid', 'grandparent'];
  return [];
}

export const ROLE_GROUPS: { key: 'adults' | 'kids' | 'grandparents'; title: string; roles: Role[] }[] = [
  { key: 'adults', title: 'Adults', roles: ['owner', 'parent', 'step_parent', 'guardian'] },
  { key: 'kids', title: 'Kids', roles: ['kid'] },
  { key: 'grandparents', title: 'Grandparents', roles: ['grandparent'] },
];

export const DEFAULT_AVATAR: Record<Exclude<Role, 'owner'>, string> = {
  parent: '🧑', step_parent: '🧑', guardian: '🧑', grandparent: '👵', kid: '🧒',
};

/** Whole years from a YYYY-MM-DD birthday to `today` (YYYY-MM-DD); null if unknown/invalid. */
export function ageFrom(birthday: string | undefined | null, today: string): number | null {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const [by, bm, bd] = birthday.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
