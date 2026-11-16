import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { ConfirmContext, type ConfirmOptions } from './context';
import { useOverlay } from './overlay';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  /** Buttons row (right-aligned, stacked on narrow screens). */
  actions?: ReactNode;
}

/** Small centered modal for short messages / confirmations. Prefer useConfirm() for yes/no. */
export function Dialog({ open, onClose, title, children, actions }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 animate-fade-in bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel} role="alertdialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="relative w-full max-w-sm animate-pop-in rounded-3xl bg-surface p-5 text-ink shadow-2xl outline-none"
      >
        <h2 id={titleId} className="text-xl font-bold leading-tight">{title}</h2>
        {children && <div className="mt-2 text-[15px] text-muted">{children}</div>}
        {actions && <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void }

/** Provides useConfirm(). Included in <UIProvider>. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => {
    setPending((prev) => { prev?.resolve(false); return { ...opts, resolve }; });
  }), []);
  const done = useCallback((ok: boolean) => {
    setPending((p) => { p?.resolve(ok); return null; });
  }, []);
  const value = useMemo(() => confirm, [confirm]);
  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={!!pending} onClose={() => done(false)} title={pending?.title}
        actions={<>
          <Button variant="secondary" onClick={() => done(false)}>{pending?.cancelLabel ?? 'Cancel'}</Button>
          <Button variant={pending?.danger ? 'danger' : 'primary'} onClick={() => done(true)} data-autofocus>
            {pending?.confirmLabel ?? 'OK'}
          </Button>
        </>}
      >
        {pending?.message}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
