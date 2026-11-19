// Keep every phone on the latest version. A home-screen app often stays open in the background for days, and the
// service worker only checks for a new version on a fresh start. So we check when the app opens, every time it comes
// back to the front, and every 30 minutes. A new version takes over at once (skipWaiting + clientsClaim in
// vite.config.ts). Then:
//   - just opened (or back after 5+ minutes away), nothing tapped yet and no unsaved work → reload straight away;
//   - otherwise a small "New version ready" bar appears, so nobody loses a half-filled form or photo.
// We never reload while the app is in the background (the camera on Android counts as "background").
import { useEffect, useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';

const CHECK_EVERY_MS = 30 * 60 * 1000;
const AWAY_COUNTS_AS_OPEN_MS = 5 * 60 * 1000;

let held = 0;
let ready = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Keep the page from reloading while there is unsaved work (a form with input, an open sheet). */
export function useHoldUpdates(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    held += 1;
    return () => { held -= 1; };
  }, [active]);
}

/** True when a new version is installed and waiting for a reload (shows the "New version ready" bar). */
export function useUpdateReady(): boolean {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => ready, () => false);
}

export function startUpdates(): void {
  // A page part from the old version can't be loaded after an update (its file is gone): reload once to get the new one.
  window.addEventListener('vite:preloadError', (e) => {
    const last = Number(sessionStorage.getItem('pm.preloadReload') || 0);
    if (Date.now() - last < 10_000) return;
    sessionStorage.setItem('pm.preloadReload', String(Date.now()));
    e.preventDefault();
    window.location.reload();
  });
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  let fresh = true;
  let hiddenAt = 0;
  const touched = () => { fresh = false; };
  for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, touched, { capture: true, passive: true });

  let check: () => Promise<void> = async () => undefined;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= AWAY_COUNTS_AS_OPEN_MS && held === 0) fresh = true;
    void check();
  });

  registerSW({
    immediate: true,
    onNeedReload() {
      if (fresh && held === 0 && document.visibilityState === 'visible') { window.location.reload(); return; }
      ready = true;
      emit();
    },
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      check = async () => {
        if (registration.installing || !navigator.onLine) return;
        try {
          // Only when the service worker file is reachable (avoids errors offline or on a flaky connection).
          const res = await fetch(swUrl, { cache: 'no-store', headers: { 'cache-control': 'no-cache' } });
          if (res.status === 200) await registration.update();
        } catch { /* offline: try again later */ }
      };
      void check();
      setInterval(() => void check(), CHECK_EVERY_MS);
    },
  });
}
