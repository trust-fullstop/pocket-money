import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ConfirmProvider } from './Dialog';
import { Icon } from './Icon';
import { ToastContext, type ToastApi, type ToastTone } from './context';
import { cx } from './styles';

interface ToastItem { id: number; message: string; tone: ToastTone }

const TONE: Record<ToastTone, string> = {
  success: 'bg-good text-white dark:text-black',
  error: 'bg-bad text-white dark:text-black',
  info: 'bg-ink text-bg',
};

/** Provides useToast(). Included in <UIProvider>. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = next.current++;
    setItems((list) => [...list.slice(-2), { id, message, tone }]);
    timers.current.set(id, window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500));
  }, [dismiss]);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => window.clearTimeout(t));
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
        aria-live="polite" aria-atomic="false"
      >
        {items.map((t) => (
          <div
            key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx('pointer-events-auto flex w-full max-w-md animate-pop-in items-center gap-3 rounded-2xl px-4 py-3 shadow-lg', TONE[t.tone])}
          >
            <Icon name={t.tone === 'success' ? 'check' : t.tone === 'error' ? 'alert' : 'info'} />
            <span className="flex-1 text-[15px] font-semibold">{t.message}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-mr-2 grid size-10 place-items-center rounded-full opacity-80 hover:opacity-100">
              <Icon name="close" size={18} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Wrap the app once: toasts + confirm dialogs. */
export function UIProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
