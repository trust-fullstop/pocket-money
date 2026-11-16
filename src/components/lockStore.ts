// App lock (PIN / pattern) stored per member on this device only: salted SHA-256 in localStorage `pm.lock.<memberId>`.
// It is a privacy screen for a shared family phone, not strong security (the data itself is protected server-side).
export type LockKind = 'pin' | 'pattern';
interface StoredLock { v: 1; kind: LockKind; salt: string; hash: string }

const key = (memberId: string) => `pm.lock.${memberId}`;
export const LOCK_EVENT = 'pm-lock-changed';

/** crypto.subtle only exists on https/localhost. */
export const lockSupported = typeof crypto !== 'undefined' && !!crypto.subtle && typeof crypto.getRandomValues === 'function';

const hex = (buf: ArrayBuffer | Uint8Array) => Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

async function digest(salt: string, secret: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${secret}`);
  return hex(await crypto.subtle.digest('SHA-256', data));
}

export function patternSecret(pattern: number[]): string {
  return pattern.join('-');
}

export function getLock(memberId: string | null | undefined): { kind: LockKind } | null {
  if (!memberId) return null;
  try {
    const raw = localStorage.getItem(key(memberId));
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredLock;
    return s && (s.kind === 'pin' || s.kind === 'pattern') && s.hash ? { kind: s.kind } : null;
  } catch {
    return null;
  }
}

export async function setLock(memberId: string, kind: LockKind, secret: string): Promise<void> {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const stored: StoredLock = { v: 1, kind, salt, hash: await digest(salt, secret) };
  localStorage.setItem(key(memberId), JSON.stringify(stored));
  window.dispatchEvent(new Event(LOCK_EVENT));
}

export function clearLock(memberId: string): void {
  localStorage.removeItem(key(memberId));
  window.dispatchEvent(new Event(LOCK_EVENT));
}

export async function verifyLock(memberId: string, secret: string): Promise<boolean> {
  try {
    const raw = localStorage.getItem(key(memberId));
    if (!raw) return true;
    const s = JSON.parse(raw) as StoredLock;
    return (await digest(s.salt, secret)) === s.hash;
  } catch {
    return false;
  }
}
