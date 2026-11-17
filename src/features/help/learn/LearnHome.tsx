// /help/learn — Money school: the core lessons with progress, and (feature 'faith') the faith reflections.
import { useEffect } from 'react';
import { Badge, Button, Card, Icon, LinkButton, ListRow, PageHeader, ProgressBar, Section } from '../../../components/ui';
import { useApp } from '../../../lib/session';
import { visibleLessons } from './lessons';
import type { Lesson } from './types';
import { LESSON_XP } from './types';
import { useLessonCtx, useLessonsDone } from './useLearn';

export default function LearnHome() {
  const { isManager } = useApp();
  const ctx = useLessonCtx();
  const { data, error, reload, progress } = useLessonsDone();
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  const lessons = visibleLessons(ctx);
  const core = lessons.filter((l) => l.kind === 'core');
  const faith = lessons.filter((l) => l.kind === 'faith');
  const ready = data !== undefined;
  const { done, count, total, next } = progress;
  const xp = ctx.isKid && ctx.on('points');
  const allDone = ready && total > 0 && count === total;

  return (
    <div className="space-y-6 pb-6">
      <PageHeader title="Money school" subtitle="Short lessons about money" back="/help" />

      <Card tone="accent" className="space-y-1.5">
        <p className="text-[17px] font-semibold leading-snug">
          <span aria-hidden="true">🎓 </span>Learn how money works: saving, interest, earning and more.
        </p>
        <p className="text-[15px] text-muted">
          Each lesson takes about 3 minutes and ends with a short quiz.
          {xp && ` Finish one for the first time and get +${LESSON_XP} XP.`}
        </p>
      </Card>

      <Card className="space-y-2">
        {ready ? (
          <>
            <ProgressBar label="Your progress" showLabel valueText={`${count} of ${total} done`} value={count} max={total} tone={allDone ? 'good' : 'accent'} />
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

      <Section title="Lessons">
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

function Meta({ lesson, xp }: { lesson: Lesson; xp?: boolean }) {
  return (
    <span className="mt-0.5 block text-[13px] font-semibold text-muted">
      ~{lesson.minutes} min{xp && <> · <span className="text-accent-ink">+{LESSON_XP} XP</span></>}
    </span>
  );
}

function LessonRow({ lesson, done, xp }: { lesson: Lesson; done: boolean; xp: boolean }) {
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

function NextLesson({ lesson, xp }: { lesson: Lesson; xp: boolean }) {
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
