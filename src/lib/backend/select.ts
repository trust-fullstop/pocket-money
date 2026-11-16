// Chooses the backend at startup.
//   - No VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY  → always demo (in-browser PGlite).
//   - Otherwise localStorage 'pm.mode' ('demo' | 'cloud', default 'cloud').
//   - ?demo=1 in the URL switches to demo (and ?demo=0 back to cloud) and is then removed from the URL.
import { setBackend, type Backend } from './index';

export type Mode = 'demo' | 'cloud';
const MODE_KEY = 'pm.mode';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when this build has Supabase credentials (cloud mode is possible). */
export const cloudConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

export function selectedMode(): Mode {
  if (!cloudConfigured) return 'demo';
  return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'cloud';
}

export async function initBackend(): Promise<Backend> {
  const url = new URL(location.href);
  const flag = url.searchParams.get('demo');
  if (flag === '1' || flag === '0') {
    localStorage.setItem(MODE_KEY, flag === '1' ? 'demo' : 'cloud');
    url.searchParams.delete('demo');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  const mode = selectedMode();
  const b = mode === 'demo'
    ? (await import('./demo')).createDemoBackend()
    : (await import('./supabase')).createSupabaseBackend(SUPABASE_URL!, SUPABASE_KEY!);
  setBackend(b);
  return b;
}

/** Switch between demo and cloud and reload the app at its start page. */
export function switchMode(mode: Mode): void {
  localStorage.setItem(MODE_KEY, mode);
  location.assign(import.meta.env.BASE_URL);
}
