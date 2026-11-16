import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { cx } from './styles';

type Result = void | boolean | Promise<void | boolean>;

export interface PinPadProps {
  /** Number of digits (default 4). */
  length?: number;
  /** Called with the full PIN. Return false (or resolve false) to shake & clear as "wrong". */
  onComplete: (pin: string) => Result;
  /** Message under the dots (e.g. "Wrong PIN"). */
  error?: string | null;
  /** Heading above the dots, e.g. "Enter your PIN". */
  title?: string;
  className?: string;
}

/** Big phone-style number pad with PIN dots. Also accepts the physical keyboard (digits, Backspace). */
export function PinPad({ length = 4, onComplete, error, title, className }: PinPadProps) {
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(0);
  const busy = useRef(false);
  const pinRef = useRef('');
  const doneRef = useRef(onComplete);
  useEffect(() => { doneRef.current = onComplete; });

  const update = (p: string) => { pinRef.current = p; setPin(p); };
  const press = (d: string) => {
    if (busy.current || pinRef.current.length >= length) return;
    const next = pinRef.current + d;
    update(next);
    if (next.length < length) return;
    busy.current = true;
    window.setTimeout(async () => {
      let ok: void | boolean = undefined;
      try { ok = await doneRef.current(next); } finally {
        busy.current = false;
        update('');
        if (ok === false) setShake((s) => s + 1);
      }
    }, 120);
  };
  const back = () => { if (!busy.current) update(pinRef.current.slice(0, -1)); };

  const pressRef = useRef(press);
  const backRef = useRef(back);
  useEffect(() => { pressRef.current = press; backRef.current = back; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (/^\d$/.test(e.key)) { e.preventDefault(); pressRef.current(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); backRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
  return (
    <div className={cx('flex flex-col items-center gap-5', className)}>
      {title && <h2 className="text-xl font-bold">{title}</h2>}
      <div key={shake} className={cx('flex gap-4', shake > 0 && 'animate-shake')} aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cx('size-4 rounded-full border-2 border-ink transition', i < pin.length ? 'bg-ink' : 'bg-transparent')} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{pin.length} of {length} digits entered</p>
      <p className={cx('min-h-6 text-[15px] font-semibold', error ? 'text-bad' : 'text-transparent')} role={error ? 'alert' : undefined}>{error || '·'}</p>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k, i) => k === '' ? <span key={i} /> : k === 'back' ? (
          <button key={i} type="button" onClick={back} aria-label="Delete last digit" className="grid size-[4.5rem] place-items-center rounded-full text-ink hover:bg-surface-2 active:bg-surface-2">
            <Icon name="back" size={28} />
          </button>
        ) : (
          <button key={i} type="button" onClick={() => press(k)} className="grid size-[4.5rem] place-items-center rounded-full bg-surface-2 text-[1.75rem] font-bold tabular-nums text-ink active:scale-95 active:bg-accent-soft">
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
