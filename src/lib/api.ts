// Typed wrappers over the SQL RPCs. UI code calls ONLY these (never backend.rpc directly).
// Each function maps 1:1 to a public SQL function in supabase/migrations (param names prefixed p_).
import { backend } from './backend';
import type {
  AppState, AskEntry, Balances, BankBalance, Device, DeviceInput, EventInput, EventOccurrence, Family, Goal, Invite, InvitePreview,
  LoginDevice, MoneyRequest, Pot, RequestKind, Role, SpotInput, Target, TargetInput, Task, TaskInput, TaskInstance,
  TickResult, Transaction, Wallet,
} from './types';

const rpc = <T>(fn: string, args: Record<string, unknown> = {}) => backend().rpc<T>(fn, args);
type Ok = { ok: boolean };

export const api = {
  // ---- family & state ----
  createFamily: (familyName: string, myName: string, avatar: string, timezone: string, currency: string) =>
    rpc<{ family_id: string; member_id: string }>('create_family',
      { p_family_name: familyName, p_my_name: myName, p_avatar: avatar, p_timezone: timezone, p_currency: currency }),
  getState: () => rpc<AppState>('get_state'),
  updateFamily: (patch: Partial<Pick<Family, 'name' | 'currency' | 'timezone'>> & { settings?: Partial<Family['settings']> }) =>
    rpc<AppState>('update_family', { p_patch: patch }),
  deleteFamily: (confirmName: string) => rpc<{ deleted: boolean }>('delete_family', { p_confirm: confirmName }),
  listAudit: (limit = 50) =>
    rpc<{ id: number; actor: string | null; action: string; details: Record<string, unknown>; created_at: string }[]>('list_audit', { p_limit: limit }),
  tick: () => rpc<TickResult>('tick'),

  // ---- members, joining & sign-in ----
  addMember: (name: string, role: Exclude<Role, 'owner'>, avatar?: string, relation?: string | null) =>
    rpc<{ member_id: string; invite: Invite }>('add_member',
      { p_name: name, p_role: role, p_avatar: avatar ?? null, p_relation: relation?.trim() || null }),
  createInvite: (memberId: string) => rpc<Invite>('create_invite', { p_member: memberId }),
  invitePreview: (code: string) => rpc<InvitePreview>('invite_preview', { p_code: code }),
  redeemInvite: (code: string, deviceLabel?: string) =>
    rpc<Ok & { member_id?: string; error?: string }>('redeem_invite', { p_code: code, p_label: deviceLabel ?? null }),
  setCredentials: (username: string, password: string, memberId?: string) =>
    rpc<Ok & { username: string }>('set_credentials', { p_username: username, p_password: password, p_member: memberId ?? null }),
  clearCredentials: (memberId: string) => rpc<Ok>('clear_credentials', { p_member: memberId }),
  loginWithPassword: (username: string, password: string, deviceLabel?: string) =>
    rpc<Ok & { member_id?: string; error?: string; until?: string }>('login_with_password',
      { p_username: username, p_password: password, p_label: deviceLabel ?? null }),
  listLogins: (memberId?: string) => rpc<LoginDevice[]>('list_logins', { p_member: memberId ?? null }),
  removeLogin: (userId: string) => rpc<Ok>('remove_login', { p_user_id: userId }),
  setLoginLabel: (label: string) => rpc<Ok>('set_login_label', { p_label: label }),
  updateMember: (memberId: string, patch: Record<string, unknown>) => rpc<Ok>('update_member', { p_member: memberId, p_patch: patch }),
  setRole: (memberId: string, role: Role) => rpc<Ok>('set_role', { p_member: memberId, p_role: role }),
  removeMember: (memberId: string) => rpc<Ok>('remove_member', { p_member: memberId }),

  // ---- tasks & challenges ----
  createTask: (task: TaskInput) => rpc<{ group_id: string; task_ids: string[] }>('create_task', { p_task: task }),
  updateTask: (groupId: string, patch: Partial<TaskInput>) => rpc<Ok>('update_task', { p_group: groupId, p_patch: patch }),
  archiveTask: (groupId: string) => rpc<Ok>('archive_task', { p_group: groupId }),
  listTasks: () => rpc<Task[]>('list_tasks'),
  listInstances: (from: string, to: string, memberId?: string | null) =>
    rpc<TaskInstance[]>('list_instances', { p_from: from, p_to: to, p_member: memberId ?? null }),
  listApprovals: () => rpc<TaskInstance[]>('list_approvals'),
  getInstance: (instanceId: string) => rpc<TaskInstance>('get_instance', { p_instance: instanceId }),
  submitTask: (instanceId: string, beforePath: string | null, afterPath: string | null, note: string | null) =>
    rpc<Ok>('submit_task', { p_instance: instanceId, p_before: beforePath, p_after: afterPath, p_note: note }),
  decideTask: (instanceId: string, approve: boolean, note?: string | null) =>
    rpc<Ok>('decide_task', { p_instance: instanceId, p_approve: approve, p_note: note ?? null }),
  excuseTask: (instanceId: string, note?: string | null) => rpc<Ok>('excuse_task', { p_instance: instanceId, p_note: note ?? null }),

  // ---- money, time, points ----
  wallet: (memberId: string, historyLimit = 50) => rpc<Wallet>('wallet', { p_member: memberId, p_history_limit: historyLimit }),
  history: (memberId: string, opts: { currency?: string | null; before?: string | null; limit?: number } = {}) =>
    rpc<Transaction[]>('history', { p_member: memberId, p_currency: opts.currency ?? null, p_before: opts.before ?? null, p_limit: opts.limit ?? 50 }),
  spot: (input: SpotInput) => rpc<{ ids: string[] }>('spot', { p: input }),
  reverseTransaction: (txId: string, reason: string) => rpc<Ok>('reverse_transaction', { p_tx: txId, p_reason: reason }),
  transfer: (memberId: string, amountCents: number, toPot: Extract<Pot, 'spending' | 'savings'>) =>
    rpc<Ok & { balances: Balances }>('transfer', { p_member: memberId, p_amount: amountCents, p_to: toPot }),

  // ---- requests, goals, targets ----
  createRequest: (kind: RequestKind, amount: number, label: string | null, note: string | null) =>
    rpc<{ id: string }>('create_request', { p_kind: kind, p_amount: amount, p_label: label, p_note: note }),
  decideRequest: (requestId: string, approve: boolean, note?: string | null) =>
    rpc<Ok>('decide_request', { p_request: requestId, p_approve: approve, p_note: note ?? null }),
  cancelRequest: (requestId: string) => rpc<Ok>('cancel_request', { p_request: requestId }),
  listRequests: (status: 'pending' | 'all' = 'pending') => rpc<MoneyRequest[]>('list_requests', { p_status: status }),
  upsertGoal: (goal: { id?: string | null; member_id?: string | null; title: string; target_cents: number; emoji?: string }) =>
    rpc<Goal>('upsert_goal', { p: goal }),
  archiveGoal: (goalId: string) => rpc<Ok>('archive_goal', { p_goal: goalId }),
  upsertTarget: (target: TargetInput) => rpc<Target>('upsert_target', { p: target }),
  archiveTarget: (targetId: string) => rpc<Ok>('archive_target', { p_target: targetId }),

  // ---- calendar & devices ----
  listEvents: (fromIso: string, toIso: string) => rpc<EventOccurrence[]>('list_events', { p_from: fromIso, p_to: toIso }),
  upsertEvent: (ev: EventInput) => rpc<{ id: string }>('upsert_event', { p: ev }),
  deleteEvent: (eventId: string) => rpc<Ok>('delete_event', { p_event: eventId }),
  listDevices: () => rpc<Device[]>('list_devices'),
  upsertDevice: (d: DeviceInput) => rpc<{ id: string }>('upsert_device', { p: d }),
  deleteDevice: (deviceId: string) => rpc<Ok>('delete_device', { p_device: deviceId }),

  // ---- real bank balance (information only) ----
  listBankBalances: (memberId: string, limit = 20) => rpc<BankBalance[]>('list_bank_balances', { p_member: memberId, p_limit: limit }),
  /** label e.g. "Revolut"; asOf YYYY-MM-DD (default today); amount may be negative (overdrawn). */
  setBankBalance: (memberId: string, amountCents: number, label?: string | null, asOf?: string | null, note?: string | null) =>
    rpc<BankBalance>('set_bank_balance', { p_member: memberId, p_amount_cents: amountCents, p_label: label ?? null, p_as_of: asOf ?? null, p_note: note ?? null }),
  deleteBankBalance: (id: string) => rpc<Ok>('delete_bank_balance', { p_id: id }),

  // ---- ask (AI helper) ----
  /** Questions asked: managers see everyone's (or one member's), others only their own. Newest first. */
  listAsks: (memberId?: string | null, limit = 50) => rpc<AskEntry[]>('list_asks', { p_member: memberId ?? null, p_limit: limit }),
  /** Ask a question. Cloud: Supabase Edge Function `ask` (Claude). Demo: built-in answers. */
  ask: (question: string) => backend().ask(question),
};

export type Api = typeof api;
