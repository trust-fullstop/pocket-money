import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useOverlay } from './overlay';
import { cx } from './styles';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Small text under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky footer (e.g. Save button). */
  footer?: ReactNode;
  /** Hide the × close button (backdrop & Esc still close). */
  hideClose?: boolean;
  className?: string;
}

/** Bottom sheet modal (centered card on wide screens). Esc / backdrop / × close it. */
export function Sheet({ open, onClose, title, description, children, footer, hideClose, className }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useOverlay(open, onClose, panel);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full max-w-md animate-sheet-up flex-col rounded-t-3xl bg-surface text-ink shadow-2xl outline-none sm:rounded-3xl sm:animate-pop-in',
          className,
        )}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line sm:hidden" aria-hidden="true" />
        <div className="flex items-start gap-2 px-5 pb-2 pt-3">
          <div className="min-w-0 flex-1 pt-1.5">
            <h2 id={titleId} className="text-xl font-bold leading-tight">{title}</h2>
            {description && <p id={descId} className="mt-1 text-[15px] text-muted">{description}</p>}
          </div>
          {!hideClose && (
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2">
              <Icon name="close" />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
        {!footer && <div className="pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body,
  );
}
