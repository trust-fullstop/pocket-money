// /help/learn — Money school: the core lessons with progress; the themes the parents planned (lesson bank, ./bank.ts):
// this month's first, then earlier months, each with its progress and when the next lesson opens; the next planned
// month as a teaser (managers can preview); and (feature 'faith') the faith reflections. Kids and relatives only see
// planned themes; lessons that aren't open yet are locked rows ("Opens Tue 8 Dec"). /help/learn#theme-<id> scrolls to
// a theme (from Home).
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { Badge, Button, Card, Icon, LinkButton, ListRow, PageHeader, ProgressBar, Section } from '../../../components/ui';
import { useApp } from '../../../lib/session';
import { dayLabel, monthLabel, releaseLabel } from './bank';
import { visibleLessons } from './lessons';
import { LESSON_PLAN_PATH, type LessonStatus, type ThemeProgress } from './progress';
import type { Lesson } from './types';
import { LESSON_XP, kidLessonReward } from './types';
import { useLessonCtx, useLessonsDone } from './useLearn';

type LessonLike = Pick<Lesson, 'id' | 'emoji' | 'title' | 'summary' | 'minutes'>;

export default function LearnHome() {
  const { isManager } = useApp();
  const ctx = useLessonCtx();
  const { hash } = useLocation();
  const { data, error, reload, school } = useLessonsDone();
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
  const { count, total } = school.core;
  const doneIds = new Set<string>(school.core.lessons.filter((s) => s.done).map((s) => s.lesson.id));
  const upNextId = ready && school.upNext.kind === 'lesson' ? school.upNext.lesson.lesson.id : null;
  const xp = ctx.isKid && ctx.on('points');
  // Kids only (grown-ups never see money promises): the family's Money school reward for a new lesson.
  const reward = kidLessonReward(ctx);
  const prize = reward > 0 ? `+${ctx.m(reward)}` : null;
  const allDone = ready && total > 0 && count === total;
  // Themes that started (this month's first, then earlier months), and the next planned month's as a teaser.
  const started = school.themes.filter((t) => t.started);
  const comingMonth = school.themes.find((t) => !t.started)?.month ?? null;
  const coming = school.themes.filter((t) => !t.started && t.month === comingMonth);
  // Once the basics are done, a theme with an open lesson to do comes first.
  const themesFirst = allDone && started.some((t) => t.next !== null);

  const themeSections = started.map((p) => (
    <ThemeSection key={p.theme.id} p={p} ready={ready} xp={xp} prize={prize} isManager={isManager} upNextId={upNextId} />
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
          {xp && !prize && ` Finish one for the first time and get +${LESSON_XP} XP.`}
        </p>
        {prize && (
          <p className="text-[16px] font-semibold text-good">
            <span aria-hidden="true">💰 </span>Finish a new lesson and get {prize}{xp ? ` and +${LESSON_XP} XP` : ''}.
          </p>
        )}
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
        <Card padded={false} className="divide-y divide-line overflow-hidden">
          <ListRow
            to="/help/learn/progress" title="See what the kids learned" subtitle="Lessons done, with dates"
            left={<EmojiDot emoji="📊" />}
          />
          <ListRow
            to={LESSON_PLAN_PATH} title="Lesson plan"
            subtitle={school.themes.length > 0 ? 'Pick the themes for each month' : 'No themes planned yet — pick some for the coming months'}
            left={<EmojiDot emoji="📅" />}
          />
        </Card>
      )}

      {themesFirst && themeSections}

      <Section title="The basics">
        <ol className="space-y-3">
          {core.map((l) => (
            <li key={l.id}>
              {upNextId === l.id
                ? <NextLesson lesson={l} xp={xp} prize={prize} />
                : <LessonRow lesson={l} done={doneIds.has(l.id)} xp={xp && ready} prize={ready ? prize : null} />}
            </li>
          ))}
        </ol>
      </Section>

      {!themesFirst && themeSections}

      {coming.map((p) => (
        <ThemeSection key={p.theme.id} p={p} ready={ready} xp={xp} prize={prize} isManager={isManager} upNextId={upNextId} />
      ))}

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
 * One planned theme: its month, progress ("2 of 5 done") and when the next lesson opens. Open lessons are links; the
 * ones that aren't open yet are locked rows for kids and relatives, previews for managers. `upNextId` = Home's "Up
 * next" lesson, highlighted.
 */
function ThemeSection({ p, ready, xp, prize, isManager, upNextId }: {
  p: ThemeProgress; ready: boolean; xp: boolean; prize: string | null; isManager: boolean; upNextId: string | null;
}) {
  const { theme, month, started, lessons, count, total, openCount, nextOpening } = p;
  const finished = ready && total > 0 && count === total;
  const fresh = lessons.some((s) => s.fresh && !s.done);
  const firstOpens = lessons[0]?.openOn ?? `${month}-01`;
  return (
    <div id={`theme-${theme.id}`} tabIndex={-1} className="scroll-mt-28 outline-none">
      <Section
        title={<><span aria-hidden="true">{theme.emoji} </span>{theme.title}</>}
        action={!started
          ? <Badge tone={isManager ? 'warn' : 'neutral'} icon="lock">{isManager ? 'Preview' : 'Soon'}</Badge>
          : fresh ? <Badge tone="accent" icon="star">New this week</Badge> : undefined}
      >
        <p className="px-1 text-[15px] text-muted">
          {monthLabel(month)} · {releaseLabel(theme)}. {theme.summary}.
        </p>

        {!started ? (
          <Card className="flex items-center gap-2 text-[17px] font-bold">
            <span aria-hidden="true">🔒</span>Opens {dayLabel(firstOpens)}
            {isManager && <span className="text-[15px] font-semibold text-muted"> · you can preview it now</span>}
          </Card>
        ) : ready && (
          <Card className="space-y-2">
            <ProgressBar
              label="Your progress" showLabel valueText={`${count} of ${total} done`} value={count} max={total}
              tone={finished ? 'good' : 'accent'}
            />
            {finished && <p className="font-semibold">Theme done! 🎉</p>}
            {nextOpening?.openOn && (
              <p className="text-[15px] text-muted">
                Next: <strong className="text-ink">{nextOpening.lesson.title}</strong> opens {dayLabel(nextOpening.openOn)}
              </p>
            )}
            {!finished && openCount === total && total > 1 && <p className="text-[15px] text-muted">All {total} lessons are open.</p>}
          </Card>
        )}

        <ol className="space-y-3">
          {lessons.map((s) => (
            <li key={s.lesson.id}>
              <ThemeLessonRow s={s} ready={ready} xp={xp} prize={prize} isManager={isManager} upNext={upNextId === s.lesson.id} />
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}

function ThemeLessonRow({ s, ready, xp, prize, isManager, upNext }: {
  s: LessonStatus; ready: boolean; xp: boolean; prize: string | null; isManager: boolean; upNext: boolean;
}) {
  const { lesson, open, done, openOn } = s;
  if (open) {
    return upNext
      ? <NextLesson lesson={lesson} xp={xp} prize={prize} />
      : <LessonRow lesson={lesson} done={done} xp={xp && ready} prize={ready ? prize : null} />;
  }
  const opens = openOn ? `Opens ${dayLabel(openOn)}` : 'Not planned';
  if (isManager) return <LessonRow lesson={lesson} done={done} xp={false} note={`${opens} · preview`} />;
  return (
    <Card className="flex min-h-16 items-center gap-3 text-muted">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-2 text-2xl opacity-60" aria-hidden="true">{lesson.emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-snug">{lesson.title}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[14px] font-semibold">
          <Icon name="lock" size={14} />{opens}
        </span>
      </span>
    </Card>
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

function Meta({ lesson, xp, prize, note }: { lesson: LessonLike; xp?: boolean; prize?: string | null; note?: string }) {
  return (
    <span className="mt-0.5 block text-[13px] font-semibold text-muted">
      ~{lesson.minutes} min
      {note && <> · <span className="text-warn">{note}</span></>}
      {prize && <> · <span className="text-good">{prize}</span></>}
      {xp && <> · <span className="text-accent-ink">+{LESSON_XP} XP</span></>}
    </span>
  );
}

function LessonRow({ lesson, done, xp, prize, note }: { lesson: LessonLike; done: boolean; xp: boolean; prize?: string | null; note?: string }) {
  return (
    <Card padded={false} className="overflow-hidden">
      <ListRow
        to={`/help/learn/${lesson.id}`}
        left={<EmojiDot emoji={lesson.emoji} done={done} />}
        title={lesson.title}
        subtitle={<>{lesson.summary}<Meta lesson={lesson} xp={xp && !done} prize={done ? null : prize} note={note} /></>}
        right={done ? <Badge tone="good" icon="check">Done</Badge> : undefined}
      />
    </Card>
  );
}

function NextLesson({ lesson, xp, prize }: { lesson: LessonLike; xp: boolean; prize?: string | null }) {
  return (
    <Card className="space-y-3 ring-2 ring-accent">
      <div className="flex items-start gap-3">
        <EmojiDot emoji={lesson.emoji} />
        <div className="min-w-0 flex-1">
          <Badge tone="accent" icon="star">Up next</Badge>
          <h3 className="mt-1 text-lg font-bold leading-snug">{lesson.title}</h3>
          <p className="text-[14px] leading-snug text-muted">{lesson.summary}</p>
          <Meta lesson={lesson} xp={xp} prize={prize} />
        </div>
      </div>
      <LinkButton to={`/help/learn/${lesson.id}`} block size="lg">
        Start<span className="sr-only">: {lesson.title}</span>
        <Icon name="chevron-right" size={22} />
      </LinkButton>
    </Card>
  );
}
