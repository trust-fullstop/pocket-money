// Formatting helpers: money (cents), time (minutes), points (XP), dates in the family time zone, role labels.
import type { Role } from './types';

const LOCALE = 'en-GB';
const MINUS = '−';

// ---------------------------------------------------------------- money
const nfCache = new Map<string, Intl.NumberFormat>();
function nf(currency: string, sign: boolean, digits: number): Intl.NumberFormat {
  const key = `${currency}|${sign}|${digits}`;
  let f = nfCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(LOCALE, {
        style: 'currency', currency, currencyDisplay: 'narrowSymbol',
        signDisplay: sign ? 'exceptZero' : 'auto', minimumFractionDigits: digits, maximumFractionDigits: digits,
      });
    } catch {
      f = new Intl.NumberFormat(LOCALE, { signDisplay: sign ? 'exceptZero' : 'auto', minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    nfCache.set(key, f);
  }
  return f;
}

/** money(250, 'EUR') → "€2.50"; { sign: true } → "+€2.50" / "−€1.50"; { whole: true } drops ".00". */
export function money(cents: number, currency = 'EUR', opts: { sign?: boolean; whole?: boolean } = {}): string {
  const c = Math.round(cents || 0);
  const digits = opts.whole && c % 100 === 0 ? 0 : 2;
  return nf(currency, !!opts.sign, digits).format(c / 100).replace('-', MINUS);
}

/** "€", "R", "$", "£" … */
export function currencySymbol(currency = 'EUR'): string {
  try {
    const part = new Intl.NumberFormat(LOCALE, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0).find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Parse what a person typed ("2.50", "2,5", "€3") into cents. Returns null when it isn't a number. */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[^\d.,-]/g, '').replace(',', '.');
  if (!t || t === '.' || t === '-') return null;
  if (!/^-?\d*(\.\d{0,2})?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

/** cents → plain editable text: 250 → "2.50", 300 → "3" */
export function centsToInput(cents: number): string {
  if (!cents) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

// ---------------------------------------------------------------- time & points
/** minutes(90) → "1 h 30 min", minutes(45) → "45 min", { sign: true } → "+45 min" */
export function minutes(min: number, opts: { sign?: boolean } = {}): string {
  const m = Math.round(min || 0);
  const a = Math.abs(m);
  const h = Math.floor(a / 60);
  const r = a % 60;
  const body = h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
  const sign = m < 0 ? MINUS : opts.sign && m > 0 ? '+' : '';
  return sign + body;
}

/** points(120) → "120 XP" */
export function points(p: number, opts: { sign?: boolean } = {}): string {
  const v = Math.round(p || 0);
  const sign = v < 0 ? MINUS : opts.sign && v > 0 ? '+' : '';
  return `${sign}${Math.abs(v).toLocaleString(LOCALE)} XP`;
}

/** Format an amount of any currency: kind 'money' (cents), 'time' (minutes) or 'points'. */
export function amount(kind: 'money' | 'time' | 'points', value: number, currency = 'EUR', opts: { sign?: boolean } = {}): string {
  return kind === 'money' ? money(value, currency, opts) : kind === 'time' ? minutes(value, opts) : points(value, opts);
}

// ---------------------------------------------------------------- dates (family time zone)
function parts(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Today's date (YYYY-MM-DD) in the family time zone. Pass `now` (e.g. useApp().now()) to respect the demo clock. */
export function todayISO(tz: string, now: Date = new Date()): string {
  return parts(now, tz).date;
}

/** The local date (YYYY-MM-DD) of a timestamp in a time zone. Date-only strings are returned unchanged. */
export function dateInTz(iso: string, tz: string): string {
  return isDateOnly(iso) ? iso : parts(new Date(iso), tz).date;
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from a to b (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const toUtc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** ISO weekday 1 = Monday … 7 = Sunday of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

/** "Mon 18 Nov" (adds the year when it isn't the current year). Input: YYYY-MM-DD. */
export function formatDate(date: string, opts: { year?: boolean; long?: boolean } = {}): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const showYear = opts.year ?? y !== new Date().getFullYear();
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: 'UTC', weekday: opts.long ? 'long' : 'short', day: 'numeric', month: opts.long ? 'long' : 'short',
    ...(showYear ? { year: 'numeric' } : {}),
  }).format(dt).replace(',', '');
}

/** "Today" / "Tomorrow" / "Yesterday" / "Mon 18 Nov". Accepts YYYY-MM-DD or an ISO timestamp. */
export function formatDay(isoOrDate: string, tz: string, now: Date = new Date()): string {
  const date = dateInTz(isoOrDate, tz);
  const diff = daysBetween(todayISO(tz, now), date);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDate(date);
}

/** "19:00" in the family time zone. */
export function formatTime(iso: string, tz: string): string {
  return parts(new Date(iso), tz).time;
}

/** "Today 19:00", "Tomorrow 08:30", "Mon 18 Nov 19:00". */
export function formatWhen(iso: string, tz: string, now: Date = new Date()): string {
  return `${formatDay(iso, tz, now)} ${formatTime(iso, tz)}`;
}

/** "just now", "5 min ago", "3 h ago", "2 days ago", else a date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const s = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86_400 * 14) { const d = Math.floor(s / 86_400); return `${d} day${d === 1 ? '' : 's'} ago`; }
  return formatDate(new Date(iso).toISOString().slice(0, 10));
}

/** The browser's IANA time zone (falls back to Europe/Amsterdam). */
export function deviceTimeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam'; } catch { return 'Europe/Amsterdam'; }
}

// ---------------------------------------------------------------- people & words
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner', parent: 'Parent', step_parent: 'Bonus parent', guardian: 'Guardian', grandparent: 'Grandparent', kid: 'Kid',
};
export const roleLabel = (role: Role | string | null | undefined) => (role ? ROLE_LABELS[role as Role] ?? role : '');
/** Role name where no relation label is shown (role pickers, the join screen): aunts, uncles and godparents share the grandparent role. */
export const roleChoiceLabel = (role: Role | string | null | undefined) =>
  (role === 'grandparent' ? 'Grandparent or other family' : roleLabel(role));
/** What the family calls someone: their custom relationship ("Bonus dad") or else the role label. */
export const memberRoleLabel = (m: { role: Role | string; relation?: string | null } | null | undefined) =>
  (m ? m.relation?.trim() || roleLabel(m.role) : '');

/** Kids can be 0–21 years old. */
export const KID_MAX_AGE = 21;

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
/** "every Monday" / "every month on the 1st". */
export function allowanceSchedule(period: 'week' | 'month' | null | undefined, day: number | null | undefined): string {
  const d = day ?? 1;
  return period === 'month' ? `every month on the ${ordinal(d)}` : `every ${WEEKDAYS[(d - 1 + 7) % 7]}`;
}
/** "€20.00 every month on the 1st" (or null when no pocket money is set). */
export function allowanceText(m: { allowance_cents: number | null; allowance_period: 'week' | 'month' | null; allowance_day: number | null },
  currency = 'EUR'): string | null {
  if (!m.allowance_cents || m.allowance_cents <= 0) return null;
  return `${money(m.allowance_cents, currency)} ${allowanceSchedule(m.allowance_period, m.allowance_day)}`;
}
/** Next pay day (YYYY-MM-DD) on or after `fromISO` for a schedule. Same rule as the server (app.pay_allowances). */
export function nextPayDate(period: 'week' | 'month' | null | undefined, day: number | null | undefined, fromISO: string): string {
  const d = day ?? 1;
  const [y, mo, da] = fromISO.split('-').map(Number);
  const from = new Date(Date.UTC(y, mo - 1, da));
  if (period === 'month') {
    const thisMonth = new Date(Date.UTC(y, mo - 1, d));
    const pick = thisMonth >= from ? thisMonth : new Date(Date.UTC(y, mo, d));
    return pick.toISOString().slice(0, 10);
  }
  const iso = ((from.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
  const add = (d - iso + 7) % 7;
  return new Date(from.getTime() + add * 86400000).toISOString().slice(0, 10);
}
/** Whole years between a YYYY-MM-DD birthday and today (null if missing/invalid). */
export function ageFrom(birthday?: string | null, today: Date = new Date()): number | null {
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return null;
  const [y, m, d] = birthday.split('-').map(Number);
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

/** plural(3, 'task') → "3 tasks" */
export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** Full link encoded in a join QR code (token or short code). */
export function joinUrl(code: string): string {
  return `${location.origin}${import.meta.env.BASE_URL}join/${encodeURIComponent(code)}`;
}

/** "ABCD EFGH" — groups a short code 4-4 for reading aloud. */
export function groupCode(code: string): string {
  return code.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ');
}

/** Pull an invite code out of whatever was typed/pasted: a full join link, "abcd efgh", or a token. */
export function extractJoinCode(input: string): string {
  const t = input.trim();
  const m = t.match(/\/join\/([^/?#\s]+)/i);
  const raw = m ? decodeURIComponent(m[1]) : t;
  return /^[0-9a-f]{32}$/i.test(raw) ? raw.toLowerCase() : raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Readable name for this device, e.g. "iPhone · Safari" (shown in the devices list). */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /iPhone|iPod/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet')
    : /CrOS/.test(ua) ? 'Chromebook'
    : /Windows/.test(ua) ? 'Windows PC'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}

/** Link for an "Open Life360" button: the saved value if it's a URL, else the Life360 website. */
export function life360Href(value?: string | null): string {
  const v = value?.trim();
  return v && /^https?:\/\//i.test(v) ? v : 'https://www.life360.com/';
}
