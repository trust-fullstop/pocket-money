// Family-time-zone maths for the calendar. Every date/time a person types is a wall-clock time in
// the FAMILY's time zone (family.timezone), never the device's — a parent travelling abroad still
// plans "Swimming 17:00" in home time.

const fmtCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/**
 * Offset of `tz` from UTC at the instant `at`, in minutes (east positive: Amsterdam winter = 60,
 * New York winter = -300, Kolkata = 330).
 * Works by asking Intl for the wall clock in `tz` and reading it back as if it were UTC.
 */
export function tzOffsetMinutes(tz: string, at: Date): number {
  const parts = partsFormatter(tz).formatToParts(at);
  const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  const atWholeSeconds = at.getTime() - at.getUTCMilliseconds();
  return Math.round((wallAsUtc - atWholeSeconds) / 60_000);
}

/**
 * "2026-11-16" + "18:30" in `tz` → UTC ISO string.
 *
 * 1. Pretend the wall time is UTC (`wall`).
 * 2. Subtract the zone's offset at that instant → first guess.
 * 3. If the offset at the guess differs (we crossed a DST switch), use that offset instead.
 *
 * Reasoned examples (Europe/Amsterdam):
 * - 16 Nov 18:30 (CET +60): wall 18:30Z → off +60 → 17:30Z; off(17:30Z) +60 → 17:30Z ✓
 * - 1 Jul 18:30 (CEST +120): → 16:30Z ✓
 * - 29 Mar 01:30 (just before spring-forward at 01:00Z): off(01:30Z)=+120 → 23:30Z; off(23:30Z)=+60 ≠
 *   → 00:30Z = 01:30 CET ✓
 * - 29 Mar 02:30 (does not exist): → 01:30Z = 03:30 CEST (moves forward, like a phone alarm) ✓
 * - 25 Oct 02:30 (happens twice): → 01:30Z = the second (CET) one ✓
 * America/New_York 16 Nov 18:30 (EST -300): wall 18:30Z → off -300 → 23:30Z ✓
 */
export function zonedTimeToIso(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  const wall = Date.UTC(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
  const off1 = tzOffsetMinutes(tz, new Date(wall));
  let ts = wall - off1 * 60_000;
  const off2 = tzOffsetMinutes(tz, new Date(ts));
  if (off2 !== off1) ts = wall - off2 * 60_000;
  return new Date(ts).toISOString();
}

/** ISO instant → { date: 'YYYY-MM-DD', time: 'HH:MM' } as the wall clock in `tz`. */
export function isoToZoned(iso: string, tz: string): { date: string; time: string } {
  const parts = partsFormatter(tz).formatToParts(new Date(iso));
  const v = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = String(Number(v('hour')) % 24).padStart(2, '0');
  return { date: `${v('year')}-${v('month')}-${v('day')}`, time: `${hour}:${v('minute')}` };
}
