// /help/learn — Money school: the core lessons with progress, each lesson series (its own progress; a locked teaser for
// kids and relatives before it opens, a preview for managers), and (feature 'faith') the faith reflections.
// /help/learn#series-<id> scrolls to a series (from Home).
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Badge, Button, Card, Icon, LinkButton, ListRow, PageHeader, ProgressBar, Section } from '../../../components/ui';
import { useApp } from '../../../lib/session';
import type { SeriesProgress } from './catalog';
import { visibleLessons } from './lessons';
import { opensLabel } from './series';
import type { Lesson } from './types';
import { LESSON_XP } from './types';
import { useLessonCtx, useLessonsDone } from './useLearn';

type LessonLike = Pick<Lesson, 'id' | 'emoji' | 'title' | 'summary' | 'minutes'>;

export default function LearnHome() {
  const { isManager } = useApp();
  const ctx = useLessonCtx();
  const { hash } = useLocation();
  const { data, error, reload, progress, series } = useLessonsDone();
  useEffect(() => {
    const el = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (el) {
      el.scrollIntoView({ block: 'start' });
      el.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [hash]);
  const lessons = visibleLessons(ctx);
  const core = lessons.filter((l) => l.kind === 'core');
  const faith = lessons.filter((l) => l.kind === 'faith');
  const ready = data !== undefined;
  const { done, count, total, next } = progress;
  const xp = ctx.isKid && ctx.on('points');
  const allDone = ready && total > 0 && count === total;
  // Once the basics are done, an open series with lessons to do comes first.
  const seriesFirst = allDone && series.some((s) => s.open && s.count < s.total);

  const seriesSections = series.map((p) => (
    <SeriesSection key={p.series.id} p={p} ready={ready} xp={xp} isManager={isManager} upNext={ready && next === null} />
  ));

  return (
    <div className="space-y-6 pb-6">
      <PageHeader title="Money school" subtitle="Short lessons about money" back="/help" />

      <Card tone="accent" className="space-y-1.5">
        <p className="text-[17px] font-semibold leading-snug">
          <span aria-hidden="true">🎓 </span>Learn how money works: saving, interest, earning and more.
        </p>
        <p className="text-[15px] text-muted">
          Each lesson takes a few minutes and ends with a short quiz.
          {xp && ` Finish one for the first time and get +${LESSON_XP} XP.`}
        </p>
      </Card>

      <Card className="space-y-2">
        {ready ? (
          <>
            <ProgressBar label="The basics" showLabel valueText={`${count} of ${total} done`} value={count} max={total} tone={allDone ? 'good' : 'accent'} />
            {allDone && <p className="font-semibold">All done! 🎉 Do them again any time.</p>}
          </>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
            <p className="text-[15px] text-muted">Couldn’t load your progress. {error}</p>
            <Button size="sm" variant="secondary" icon="reset" onClick={reload}>Try again</Button>
          </div>
        ) : (
          <p className="text-[15px] text-muted" aria-live="polite">Loading your progress…</p>
        )}
      </Card>

      {isManager && (
        <Card padded={false} className="overflow-hidden">
          <ListRow
            to="/help/learn/progress" title="See what the kids learned" subtitle="Lessons done, with dates"
            left={<EmojiDot emoji="📊" />}
          />
        </Card>
      )}

      {seriesFirst && seriesSections}

      <Section title="The basics">
        <ol className="space-y-3">
          {core.map((l) => (
            <li key={l.id}>
              {ready && next?.id === l.id
                ? <NextLesson lesson={l} xp={xp} />
                : <LessonRow lesson={l} done={done.has(l.id)} xp={xp && ready} />}
            </li>
          ))}
        </ol>
      </Section>

      {!seriesFirst && seriesSections}

      {faith.length > 0 && (
        <Section title={<><span aria-hidden="true">🕊️ </span>Faith, hope and love — reflections</>}>
          <p className="px-1 text-[15px] text-muted">A few minutes to think and talk about together. Nothing to score.</p>
          <Card padded={false} className="divide-y divide-line overflow-hidden">
            {faith.map((l) => (
              <ListRow key={l.id} to={`/help/learn/${l.id}`} left={<EmojiDot emoji={l.emoji} />} title={l.title} subtitle={<>{l.summary}<Meta lesson={l} /></>} />
            ))}
          </Card>
        </Section>
      )}
    </div>
  );
}

/**
 * One lesson series. Open: its own progress and the lessons. Not open yet: managers preview it; kids and relatives see a
 * locked teaser (titles only, no links). `upNext` = the basics are done, so this series' next lesson is highlighted.
 */
function SeriesSection({ p, ready, xp, isManager, upNext }: {
  p: SeriesProgress; ready: boolean; xp: boolean; isManager: boolean; upNext: boolean;
}) {
  const { series, open, list, done, count, total, next } = p;
  const opens = opensLabel(series.opensOn);
  const locked = !open && !isManager;
  const finished = ready && total > 0 && count === total;
  return (
    <div id={`series-${series.id}`} tabIndex={-1} className="scroll-mt-28 outline-none">
      <Section
        title={<><span aria-hidden="true">{series.emoji} </span>{series.title}</>}
        action={open
          ? !finished && <Badge tone="accent" icon="star">New</Badge>
          : <Badge tone={locked ? 'neutral' : 'warn'} icon="lock">{locked ? 'Soon' : 'Preview'}</Badge>}
      >
        <p className="px-1 text-[15px] text-muted">{series.summary}.</p>

        {locked ? (
          <Card className="space-y-3">
            <p className="flex items-center gap-2 text-[17px] font-bold">
              <span aria-hidden="true">🔒</span>Opens on {opens}
            </p>
            <ul aria-label={`Lessons that open on ${opens}`} className="space-y-2">
              {list.map((l) => (
                <li key={l.id} className="flex min-h-11 items-center gap-3 text-muted">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-2xl opacity-60" aria-hidden="true">{l.emoji}</span>
                  <span className="min-w-0 text-[16px] font-semibold">{l.title}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <>
            {!open && (
              <Card tone="warn" role="note" className="flex items-start gap-3">
                <Icon name="lock" size={20} className="mt-0.5 shrink-0" />
                <p className="text-[15px] font-semibold leading-snug">Preview — the kids see this from {opens}.</p>
              </Card>
            )}
            {ready && (
              <Card className="space-y-2">
                <ProgressBar
                  label="Your progress" showLabel valueText={`${count} of ${total} done`} value={count} max={total}
                  tone={finished ? 'good' : 'accent'}
                />
                {finished && <p className="font-semibold">Series done! 🎉</p>}
              </Card>
            )}
            <ol className="space-y-3">
              {list.map((l) => (
                <li key={l.id}>
                  {open && upNext && next?.id === l.id
                    ? <NextLesson lesson={l} xp={xp} />
                    : <LessonRow lesson={l} done={done.has(l.id)} xp={xp && ready} />}
                </li>
              ))}
            </ol>
          </>
        )}
      </Section>
    </div>
  );
}

function EmojiDot({ emoji, done }: { emoji: string; done?: boolean }) {
  return (
    <span className="relative grid size-11 place-items-center rounded-full bg-accent-soft text-2xl" aria-hidden="true">
      {emoji}
      {done && (
        <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full bg-good text-white ring-2 ring-surface">
          <Icon name="check" size={12} strokeWidth={3.5} />
        </span>
      )}
    </span>
  );
}

function Meta({ lesson, xp }: { lesson: LessonLike; xp?: boolean }) {
  return (
    <span className="mt-0.5 block text-[13px] font-semibold text-muted">
      ~{lesson.minutes} min{xp && <> · <span className="text-accent-ink">+{LESSON_XP} XP</span></>}
    </span>
  );
}

function LessonRow({ lesson, done, xp }: { lesson: LessonLike; done: boolean; xp: boolean }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <ListRow
        to={`/help/learn/${lesson.id}`}
        left={<EmojiDot emoji={lesson.emoji} done={done} />}
        title={lesson.title}
        subtitle={<>{lesson.summary}<Meta lesson={lesson} xp={xp && !done} /></>}
        right={done ? <Badge tone="good" icon="check">Done</Badge> : undefined}
      />
    </Card>
  );
}

function NextLesson({ lesson, xp }: { lesson: LessonLike; xp: boolean }) {
  return (
    <Card className="space-y-3 ring-2 ring-accent">
      <div className="flex items-start gap-3">
        <EmojiDot emoji={lesson.emoji} />
        <div className="min-w-0 flex-1">
          <Badge tone="accent" icon="star">Up next</Badge>
          <h3 className="mt-1 text-lg font-bold leading-snug">{lesson.title}</h3>
          <p className="text-[14px] leading-snug text-muted">{lesson.summary}</p>
          <Meta lesson={lesson} xp={xp} />
        </div>
      </div>
      <LinkButton to={`/help/learn/${lesson.id}`} block size="lg">
        Start<span className="sr-only">: {lesson.title}</span>
        <Icon name="chevron-right" size={22} />
      </LinkButton>
    </Card>
  );
}
