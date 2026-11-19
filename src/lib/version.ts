// Release info baked in at build time (vite.config.ts `define`). Shown in Family rules → "About this app".

declare const __BUILD_TIME__: string;
declare const __BUILD_COMMIT__: string;

/** When this version was built (ISO timestamp), or null in tests. */
export const BUILD_TIME: string | null = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : null;
/** Short git commit of this version ("567bf80"), or '' when unknown. */
export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : '';

/** Version name from the build time: "2026.11.19-1249" (date and time in UTC, so it's the same on every phone). */
export function versionName(iso: string | null = BUILD_TIME): string {
  if (!iso) return 'development';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
