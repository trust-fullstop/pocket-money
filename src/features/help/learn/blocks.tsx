// Renders one lesson block: text, example, list, verse, reflect or widget.
import { VerseLine, useVersesShown } from '../../faith/VerseCard';
import { VERSE_BY_ID } from '../../faith/verses';
import { Rich } from './ui';
import type { Block, LessonCtx } from './types';
import { Widget } from './widgets';

export function BlockView({ block, ctx }: { block: Block; ctx: LessonCtx }) {
  switch (block.kind) {
    case 'text':
      return <p className="text-[17px] leading-relaxed"><Rich text={block.text} /></p>;
    case 'example':
      return (
        <div className="rounded-xl border-l-4 border-accent bg-accent-soft px-4 py-3 text-[16px] leading-relaxed">
          <p className="mb-0.5 text-[13px] font-bold uppercase tracking-wide text-accent-ink">For example</p>
          <p><Rich text={block.text} /></p>
        </div>
      );
    case 'list':
      return (
        <ul className="space-y-2 text-[17px] leading-relaxed">
          {block.items.map((item, i) => {
            const num = /^(\d+)\.\s+(.*)$/.exec(item);
            return (
              <li key={i} className="flex gap-3">
                {num
                  ? <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-[14px] font-bold text-accent-ink">{num[1]}</span>
                  : <span className="mt-2.5 size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                <span className="min-w-0"><Rich text={num ? num[2] : item} /></span>
              </li>
            );
          })}
        </ul>
      );
    case 'verse':
      return <VerseBlock id={block.id} note={block.note} />;
    case 'reflect':
      return (
        <div className="rounded-xl bg-surface-2 px-4 py-3">
          <p className="flex items-center gap-2 text-[14px] font-bold text-muted"><span aria-hidden="true">💭</span>Think about it</p>
          <p className="mt-1 text-[17px] font-semibold leading-snug"><Rich text={block.prompt} /></p>
        </div>
      );
    case 'widget':
      return <Widget kind={block.widget} ctx={ctx} />;
  }
}

/** A verse with its note; nothing at all when faith is off or the reader hides verses. */
function VerseBlock({ id, note }: { id: string; note?: string }) {
  const shown = useVersesShown();
  if (!shown || !VERSE_BY_ID[id]) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="mb-1 flex items-center gap-2 text-[14px] font-bold text-accent-ink"><span aria-hidden="true">🕊️</span>From the Bible</p>
      <VerseLine id={id} />
      {note && <p className="mt-2 text-[15px] text-muted"><Rich text={note} /></p>}
    </div>
  );
}
