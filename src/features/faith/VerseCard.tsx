// Faith verse UI (feature 'faith'): the verse of the day card and a compact verse line for lessons and pages.
// Texts come only from verses.ts (World English Bible, public domain); links open the verse in the Bible App (a kid's tap
// is counted for the Bible time surprise, see bibleTrack.ts; the link itself is never delayed).
import { useId } from 'react';
import { Icon, LinkButton, buttonClass, cardClass, cx } from '../../components/ui';
import { useApp } from '../../lib/session';
import { useTrackBibleOpen } from './bibleTrack';
import { VERSES_SETTING_PATH, useVersesShown } from './prefs';
import { TRANSLATION, VERSE_BY_ID, bibleAppUrl, verseOfTheDay, type Verse } from './verses';

// Also available from here for the lesson screens (the hook itself lives in prefs.ts).
// oxlint-disable-next-line react/only-export-components
export { useVersesShown } from './prefs';

const linkProps = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** "Proverbs 13:11 (WEB)" */
function Ref({ v }: { v: Verse }) {
  return <>{v.ref} <span className="font-normal">({TRANSLATION})</span></>;
}

/** The verse text; one that runs on into the next verse ("…not for men,") ends with "…" instead of a comma. */
const textOf = (v: Verse) => v.text.replace(/[,;:]\s*$/, '…');

/** "🕊️ Verse of the day": the same verse for the whole family all day (family-local date). */
export function VerseOfTheDay({ className }: { className?: string }) {
  const shown = useVersesShown();
  const { state } = useApp();
  const titleId = useId();
  const track = useTrackBibleOpen();
  if (!shown || !state) return null;
  const v = verseOfTheDay(state.today);
  return (
    <section aria-labelledby={titleId} className={cx(cardClass, 'space-y-3 p-4', className)}>
      <h2 id={titleId} className="flex items-center gap-2 font-bold text-accent-ink">
        <span className="text-xl" aria-hidden="true">🕊️</span>Verse of the day
      </h2>
      <figure className="space-y-2">
        <blockquote cite={bibleAppUrl(v)} className="border-l-4 border-accent/40 pl-3 font-serif text-[1.1rem] italic leading-relaxed text-ink">
          {textOf(v)}
        </blockquote>
        <figcaption className="pl-4 text-[15px] font-semibold text-muted">
          <span aria-hidden="true">— </span><Ref v={v} />
        </figcaption>
      </figure>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <a href={bibleAppUrl(v)} {...linkProps} onClick={() => track(v.ref)} className={buttonClass('secondary', 'sm')}>
          <Icon name="external" size={18} />
          <span>Read<span className="sr-only"> {v.ref}</span> in the Bible App</span>
        </a>
        <LinkButton to={VERSES_SETTING_PATH} variant="ghost" size="sm" className="!text-muted underline underline-offset-2">
          Hide verses
        </LinkButton>
      </div>
    </section>
  );
}

/** One verse in a short paragraph: text, "— Ref (WEB)" and a small Bible App link. Nothing when verses are hidden or the id is unknown. */
export function VerseLine({ id, className }: { id: string; className?: string }) {
  const shown = useVersesShown();
  const track = useTrackBibleOpen();
  const v = VERSE_BY_ID[id];
  if (!shown || !v) return null;
  return (
    <figure className={cx('text-[15px] leading-relaxed', className)}>
      <blockquote cite={bibleAppUrl(v)} className="inline font-serif italic text-ink/90">{textOf(v)}</blockquote>{' '}
      <figcaption className="inline whitespace-nowrap text-[14px] font-semibold text-muted">
        <span aria-hidden="true">—&nbsp;</span><Ref v={v} />
        <a
          href={bibleAppUrl(v)} {...linkProps} onClick={() => track(v.ref)} aria-label={`Read ${v.ref} in the Bible App`}
          title="Read in the Bible App"
          className="-my-3 inline-grid size-11 place-items-center rounded-full align-middle text-accent-ink transition hover:bg-accent-soft"
        >
          <Icon name="external" size={16} />
        </a>
      </figcaption>
    </figure>
  );
}
