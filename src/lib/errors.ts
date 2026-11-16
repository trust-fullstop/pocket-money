// Error codes raised by the SQL functions (`raise exception '<code>' using detail = '...'`).
export const ERROR_CODES = [
  'not_signed_in', 'not_member', 'already_member', 'not_allowed', 'not_found', 'invalid', 'insufficient',
  'wrong_status', 'invite_invalid', 'too_many_attempts', 'username_taken', 'bad_login', 'locked', 'not_in_demo', 'family_limit',
  'feature_off', 'ask_not_configured', 'ask_limit',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number] | 'network' | 'unknown';

export class AppError extends Error {
  code: ErrorCode;
  detail?: string;
  constructor(code: ErrorCode, detail?: string, message?: string) {
    super(message ?? code);
    this.code = code;
    this.detail = detail;
  }
}

export function toAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const err = e as { message?: string; detail?: string; details?: string; code?: string };
  const msg = (err?.message ?? String(e)).trim();
  const code = (ERROR_CODES as readonly string[]).find((c) => msg === c || msg.startsWith(c + ' ') || msg.endsWith(': ' + c));
  if (code) return new AppError(code as ErrorCode, err.detail ?? err.details ?? undefined, msg);
  if (/fetch|network|Failed to fetch|NetworkError/i.test(msg)) return new AppError('network', undefined, msg);
  return new AppError('unknown', undefined, msg);
}

const FRIENDLY: Record<ErrorCode, string> = {
  not_signed_in: 'Please sign in first.',
  not_member: "You're not part of a family yet.",
  already_member: 'This device is already linked to someone in a family.',
  not_allowed: "You're not allowed to do that.",
  not_found: "We couldn't find that. It may have been removed.",
  invalid: 'Please check what you typed.',
  insufficient: 'There is not enough in that pot.',
  wrong_status: 'This was already handled by someone else.',
  invite_invalid: 'This code has expired or was already used. Ask a parent for a new QR code.',
  too_many_attempts: 'Too many tries. Wait a few minutes and try again.',
  username_taken: 'That username is taken. Try another one.',
  bad_login: 'Wrong username or password.',
  locked: 'Too many wrong tries. This account is locked for 15 minutes.',
  not_in_demo: "That isn't available in the demo.",
  family_limit: 'This app is private to one family. Ask a parent for a QR code to join.',
  feature_off: 'This part of the app is switched off. A parent can switch it on in Family → Features.',
  ask_not_configured: "The helper isn't set up yet. A parent needs to add the AI key first.",
  ask_limit: "You've asked a lot of questions today! Try again tomorrow, or ask a parent.",
  network: 'No connection. Check your internet and try again.',
  unknown: 'Something went wrong. Please try again.',
};

export function friendlyError(e: unknown): string {
  const a = toAppError(e);
  if (a.code === 'invalid' && a.detail) return `Please check: ${a.detail.replace(/_/g, ' ').replace(/^setting:/, 'setting ')}.`;
  return FRIENDLY[a.code];
}
