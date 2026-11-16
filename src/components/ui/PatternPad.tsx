import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button } from './Button';
import { cx } from './styles';

type Result = void | boolean | Promise<void | boolean>;

export interface PatternPadProps {
  /** Called with the dot indexes (0–8, row by row). Return false (or resolve false) to shake as "wrong". */
  onComplete: (pattern: number[]) => Result;
  /** Minimum dots to connect (default 4). */
  minDots?: number;
  error?: string | null;
  title?: string;
  /** Pixel size of the square pad (default 264). */
  size?: number;
  className?: string;
}

const rc = (i: number) => [Math.floor(i / 3), i % 3] as const;

/**
 * 3×3 unlock pattern (drag with finger/mouse). Keyboard users can Tab to the dots, press Enter on each,
 * then "Done".
 */
export function PatternPad({ onComplete, minDots = 4, error, title, size = 264, className }: PatternPadProps) {
  const [path, setPath] = useState<number[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const pathRef = useRef<number[]>([]);
  const doneRef = useRef(onComplete);
  useEffect(() => { doneRef.current = onComplete; });

  const cell = size / 3;
  const center = (i: number) => { const [r, c] = rc(i); return { x: c * cell + cell / 2, y: r * cell + cell / 2 }; };
  const local = (e: RPointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const hit = (p: { x: number; y: number }) => {
    for (let i = 0; i < 9; i++) {
      const c = center(i);
      if (Math.hypot(c.x - p.x, c.y - p.y) < cell * 0.34) return i;
    }
    return -1;
  };
  const set = (p: number[]) => { pathRef.current = p; setPath(p); };
  const add = (i: number) => {
    const p = pathRef.current;
    if (p.includes(i)) return;
    const next = [...p];
    if (next.length) {
      // Crossing over an unused dot (e.g. 0 → 2 passes 1) includes it, like on phones.
      const [lr, lc] = rc(next[next.length - 1]);
      const [r, c] = rc(i);
      if ((lr + r) % 2 === 0 && (lc + c) % 2 === 0) {
        const mid = ((lr + r) / 2) * 3 + (lc + c) / 2;
        if (!next.includes(mid)) next.push(mid);
      }
    }
    next.push(i);
    set(next);
    navigator.vibrate?.(8);
  };

  const finish = async () => {
    const p = pathRef.current;
    setKeyboard(false);
    if (p.length === 0) return;
    if (p.length < minDots) {
      setHint(`Connect at least ${minDots} dots`);
      setShake((s) => s + 1);
      window.setTimeout(() => set([]), 400);
      return;
    }
    setHint(null);
    let ok: void | boolean = undefined;
    try { ok = await doneRef.current(p); } finally {
      if (ok === false) setShake((s) => s + 1);
      window.setTimeout(() => set([]), ok === false ? 400 : 150);
    }
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    box.current?.setPointerCapture(e.pointerId);
    setKeyboard(false);
    setHint(null);
    set([]);
    setDrawing(true);
    const pt = local(e);
    setCursor(pt);
    const i = hit(pt);
    if (i >= 0) add(i);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    const pt = local(e);
    setCursor(pt);
    const i = hit(pt);
    if (i >= 0) add(i);
  };
  const onUp = () => {
    if (!drawing) return;
    setDrawing(false);
    setCursor(null);
    void finish();
  };

  const pts = path.map(center);
  const last = pts[pts.length - 1];
  const message = error ?? hint;
  return (
    <div className={cx('flex flex-col items-center gap-4', className)}>
      {title && <h2 className="text-xl font-bold">{title}</h2>}
      <div
        ref={box} key={shake}
        className={cx('relative touch-none select-none rounded-3xl bg-surface-2', shake > 0 && 'animate-shake')}
        style={{ width: size, height: size }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        role="group" aria-label="Unlock pattern: 3 by 3 dots"
      >
        <svg className="pointer-events-none absolute inset-0" width={size} height={size} aria-hidden="true">
          {pts.length > 1 && (
            <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
          )}
          {drawing && last && cursor && (
            <line x1={last.x} y1={last.y} x2={cursor.x} y2={cursor.y} stroke="var(--accent)" strokeWidth={8} strokeLinecap="round" opacity={0.45} />
          )}
        </svg>
        {Array.from({ length: 9 }, (_, i) => {
          const c = center(i);
          const on = path.includes(i);
          return (
            <button
              key={i} type="button" tabIndex={0}
              aria-label={`Dot ${i + 1}${on ? `, selected as number ${path.indexOf(i) + 1}` : ''}`}
              onClick={(e) => { if (e.detail === 0) { setKeyboard(true); add(i); } }}
              className="absolute grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
              style={{ left: c.x, top: c.y }}
            >
              <span className={cx('rounded-full transition-all', on ? 'size-6 bg-accent-strong ring-8 ring-accent/25' : 'size-4 bg-muted')} />
            </button>
          );
        })}
      </div>
      <p className={cx('min-h-6 text-[15px] font-semibold', message ? 'text-bad' : 'text-muted')} role={message ? 'alert' : undefined}>
        {message ?? (path.length ? `${path.length} dots` : `Connect at least ${minDots} dots`)}
      </p>
      {keyboard && path.length > 0 && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => { set([]); setKeyboard(false); }}>Clear</Button>
          <Button size="sm" onClick={() => void finish()}>Done</Button>
        </div>
      )}
    </div>
  );
}
