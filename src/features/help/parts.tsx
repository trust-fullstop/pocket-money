import type { ReactNode } from 'react';
import { Avatar, Icon, cx } from '../../components/ui';

/** Pocket, the helper: a 🐷 avatar (read as "Pocket" by screen readers). */
export function PocketAvatar() {
  return <Avatar emoji="🐷" name="Pocket" size="sm" className="mt-0.5" />;
}

/** The kid's question: bubble on the right. */
export function QuestionBubble({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%] whitespace-pre-wrap wrap-break-word rounded-2xl rounded-br-md bg-accent-strong px-4 py-2.5 text-white shadow-sm">
        <span className="sr-only">You asked: </span>{children}
      </div>
      {meta && <div className="mt-1 px-1 text-xs text-muted">{meta}</div>}
    </div>
  );
}

/** Pocket's answer: bubble on the left with the 🐷 avatar. */
export function AnswerBubble({ children, meta, tone = 'default' }: { children: ReactNode; meta?: ReactNode; tone?: 'default' | 'muted' | 'warn' }) {
  return (
    <div className="flex items-start gap-2">
      <PocketAvatar />
      <div className="flex min-w-0 max-w-[85%] flex-col items-start">
        <div
          className={cx(
            'whitespace-pre-wrap wrap-break-word rounded-2xl rounded-bl-md border px-4 py-2.5 shadow-sm',
            tone === 'warn' ? 'border-warn/30 bg-warn-soft' : 'border-line bg-surface',
            tone === 'muted' && 'italic text-muted',
          )}
        >
          {children}
        </div>
        {meta && <div className="mt-1 px-1 text-xs text-muted">{meta}</div>}
      </div>
    </div>
  );
}

/** Three bouncing dots while Pocket is thinking. */
export function TypingBubble() {
  return (
    <div className="flex items-start gap-2" role="status">
      <PocketAvatar />
      <div className="flex h-11 items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-surface px-4 shadow-sm">
        <span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" aria-hidden="true" />
        <span className="size-2 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" aria-hidden="true" />
        <span className="size-2 animate-bounce rounded-full bg-muted" aria-hidden="true" />
        <span className="sr-only">Pocket is thinking…</span>
      </div>
    </div>
  );
}

/** Native accordion item (details/summary), styled as a list row. */
export function Disclosure({ summary, children, className }: { summary: ReactNode; children: ReactNode; className?: string }) {
  return (
    <details className={cx('group', className)}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 font-semibold transition hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{summary}</span>
        <Icon name="chevron-down" size={20} className="shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 text-[16px] leading-relaxed">{children}</div>
    </details>
  );
}
