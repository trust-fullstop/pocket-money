import { useUpdateReady } from '../lib/updates';
import { Icon } from './ui';

/** "A new version is ready — Refresh". Shown when an update arrived while someone was busy (see src/lib/updates.ts). */
export function UpdateBar() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-2.5 text-surface shadow-lg"
      style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
    >
      <Icon name="reset" size={20} />
      <span className="min-w-0 flex-1 text-[15px] font-semibold">A new version is ready</span>
      <button
        type="button" onClick={() => window.location.reload()}
        className="min-h-11 rounded-full bg-surface px-4 text-[15px] font-bold text-ink"
      >
        Refresh
      </button>
    </div>
  );
}
