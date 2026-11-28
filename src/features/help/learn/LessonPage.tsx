// /help/learn/:id — one lesson, one step at a time. Tracked lessons (core + series) end with a quiz and are finished on
// the server; faith reflections end with "Talk about it" and a Done (nothing stored). A series lesson before its opening
// day: a friendly locked page for kids and relatives, a preview for managers (the server says 'not_open' too).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Button, Card, EmptyState, FxNote, Icon, LinkButton, PageHeader, ProgressBar } from '../../../components/ui';
import { api } from '../../../lib/api';
import { friendlyError, toAppError } from '../../../lib/errors';
import { useApp } from '../../../lib/session';
import { BlockView } from './blocks';
import { visibleLessons } from './lessons';
import { Quiz } from './Quiz';
import { lessonGate, opensLabel, seriesOf, type LessonSeries } from './series';
import { Rich } from './ui';
import { isTracked, type Lesson, type LessonCtx } from './types';
import { useFamilyToday, useLessonCtx, useLessonsDone } from './useLearn';

export default function LessonPage() {
  const { id } = useParams();
  const ctx = useLessonCtx();
  const { isManager } = useApp();
  const today = useFamilyToday();
  const lesson = visibleLessons(ctx).find((l) => l.id === id);
  if (!lesson) return <Navigate replace to="/help/learn" />;
  const series = seriesOf(lesson.id);
  const gate = lessonGate(lesson.id, today, isManager);
  if (gate === 'locked' && series) return <LockedLesson lesson={lesson} series={series} />;
  return <LessonView key={lesson.id} lesson={lesson} ctx={ctx} series={series} preview={gate === 'preview'} />;
}

function LessonTitle({ lesson }: { lesson: Lesson }) {
  return <span className={`block whitespace-normal text-balance ${lesson.title.length > 22 ? 'text-[1.5rem]' : ''}`}>{lesson.title}</span>;
}

/** Before the opening day, for kids and relatives: no lesson text, just when it opens. */
function LockedLesson({ lesson, series }: { lesson: Lesson; series: LessonSeries }) {
  const opens = opensLabel(series.opensOn);
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  return (
    <div className="pb-6">
      <PageHeader title={<LessonTitle lesson={lesson} />} subtitle={series.title} back="/help/learn" />
      <Card className="mt-2">
        <EmptyState
          emoji="🔒"
          title={`Opens on ${opens}`}
          message={<>“{lesson.title}” is part of <strong>{series.title}</strong>. It isn’t open yet: come back on {opens}!</>}
          action={<LinkButton to="/help/learn" variant="secondary" icon="back">Back to Money school</LinkButton>}
        />
      </Card>
    </div>
  );
}

type Finish =
  | { s: 'idle' }
  | { s: 'saving' }
  | { s: 'error'; msg: string }
  | { s: 'done'; points: number; money: number; first: boolean };

const FALLBACK_TALK = [
  'What was new for you today?',
  'What is one thing you want to do differently this week?',
];

function reduceMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function LessonView({ lesson, ctx, series, preview }: { lesson: Lesson; ctx: LessonCtx; series?: LessonSeries; preview: boolean }) {
  const { refresh } = useApp();
  const { progress, series: seriesProgress } = useLessonsDone();
  const steps = useMemo(() => lesson.steps(ctx), [lesson, ctx]);
  const quiz = useMemo(() => (isTracked(lesson.kind) && lesson.quiz ? lesson.quiz(ctx) : []), [lesson, ctx]);
  const hasQuiz = quiz.length > 0;
  const total = steps.length + (hasQuiz ? 1 : 0);
  const [i, setI] = useState(0);
  const [fin, setFin] = useState<Finish>({ s: 'idle' });
  const [faithDone, setFaithDone] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  const isQuizStep = hasQuiz && i === steps.length;
  const isLast = i === total - 1;
  const step = isQuizStep ? null : steps[i];

  const go = (n: number) => {
    setI(n);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
      headingRef.current?.focus({ preventScroll: true });
    });
  };
  const focusDone = () => requestAnimationFrame(() => doneRef.current?.focus());

  const finish = async () => {
    setFin({ s: 'saving' });
    try {
      const r = await api.finishLesson(lesson.id);
      setFin({ s: 'done', points: r.points, money: r.money_cents ?? 0, first: r.first });
      focusDone();
      void refresh();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'feature_off') void refresh();
      const notOpen = err.code === 'invalid' && err.detail === 'not_open' && series;
      setFin({ s: 'error', msg: notOpen ? `This lesson opens on ${opensLabel(series.opensOn)}.` : friendlyError(e) });
    }
  };

  // "Next lesson": the next one not done yet in the same group (the core lessons, or this series), after this one and
  // wrapping round. All core lessons done → the first lesson not done yet of a series that is open.
  const nextLesson = useMemo(() => {
    const own = series ? seriesProgress.find((p) => p.series.id === series.id) : progress;
    if (!own) return null;
    const list = own.list;
    const at = list.findIndex((l) => l.id === lesson.id);
    const order = [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))];
    const next = order.find((l) => !own.done.has(l.id));
    if (next) return next;
    if (!series && lesson.kind === 'core') return seriesProgress.find((p) => p.open && p.next)?.next ?? null;
    return null;
  }, [progress, seriesProgress, series, lesson]);

  const talk = useMemo(() => {
    const prompts = steps.flatMap((s) => s.blocks.flatMap((b) => (b.kind === 'reflect' ? [b.prompt] : [])));
    return prompts.length > 0 ? prompts : FALLBACK_TALK;
  }, [steps]);

  const finished = fin.s === 'done' || faithDone;

  return (
    <div className="pb-6">
      {/* PageHeader truncates its title; long lesson titles wrap here instead. */}
      <PageHeader
        title={<LessonTitle lesson={lesson} />}
        subtitle={lesson.kind === 'faith' ? 'A reflection' : series ? series.title : 'Money school'}
        back="/help/learn"
      />

      {preview && series && (
        <Card tone="warn" role="note" className="mb-4 flex items-start gap-3">
          <Icon name="lock" size={20} className="mt-0.5 shrink-0" />
          <p className="text-[15px] font-semibold leading-snug">Preview — the kids see this from {opensLabel(series.opensOn)}.</p>
        </Card>
      )}

      <div className="space-y-1.5">
        <p className="text-[14px] font-semibold text-muted">Step {i + 1} of {total}</p>
        <ProgressBar size="sm" label="Lesson progress" valueText={`Step ${i + 1} of ${total}`} value={i + 1} max={total} />
      </div>

      <article className="mt-5 space-y-4">
        <h2 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-2xl font-extrabold leading-tight outline-none">
          <span aria-hidden="true">{isQuizStep ? '🧠' : step?.emoji ?? lesson.emoji}</span>
          {isQuizStep ? 'Quick quiz' : step?.title}
        </h2>

        {step?.blocks.map((b, k) => <BlockView key={k} block={b} ctx={ctx} />)}

        {isQuizStep && (
          <>
            <p className="text-[17px]">Answer all the questions, then check. You can try again as often as you like.</p>
            <Quiz questions={quiz} onAllRight={finish} locked={fin.s === 'saving' || fin.s === 'done'} />
            {fin.s === 'saving' && <p className="text-[15px] text-muted" aria-live="polite">Saving…</p>}
            {fin.s === 'error' && (
              <Card tone="warn" role="alert" className="space-y-3">
                <p className="font-semibold">All right, but we couldn’t save it yet.</p>
                <p className="text-[15px] text-muted">{fin.msg}</p>
                <Button icon="reset" variant="secondary" onClick={finish}>Try again</Button>
              </Card>
            )}
            {fin.s === 'done' && (
              <Card tone="good" role="status" className="space-y-3 text-center">
                <h3 ref={doneRef} tabIndex={-1} className="text-2xl font-extrabold outline-none">Lesson done! 🎉</h3>
                {fin.money > 0 && (
                  <p className="text-xl font-extrabold text-good">
                    +{ctx.m(fin.money)} into your Wallet <span aria-hidden="true">🎉</span>
                    <FxNote cents={fin.money} currency={ctx.currency} className="block text-[15px] font-semibold" />
                  </p>
                )}
                {fin.points > 0 && <p className="text-xl font-extrabold text-good">+{fin.points} XP</p>}
                {!fin.first && <p className="text-[15px] text-muted">You finished this one before. Great to do it again!</p>}
                <div className="space-y-2 pt-1">
                  {nextLesson && (
                    <LinkButton to={`/help/learn/${nextLesson.id}`} block size="lg">
                      Next lesson: {nextLesson.title}
                    </LinkButton>
                  )}
                  <LinkButton to="/help/learn" variant={nextLesson ? 'secondary' : 'primary'} block>Back to Money school</LinkButton>
                </div>
              </Card>
            )}
          </>
        )}

        {lesson.kind === 'faith' && isLast && (
          <Card className="space-y-2">
            <h3 className="flex items-center gap-2 text-lg font-bold"><span aria-hidden="true">💬</span>Talk about it</h3>
            <p className="text-[15px] text-muted">Together, or on your own. There are no wrong answers.</p>
            <ul className="space-y-2">
              {talk.map((p, k) => (
                <li key={k} className="rounded-xl bg-surface-2 px-3 py-2 text-[16px] font-semibold"><Rich text={p} /></li>
              ))}
            </ul>
          </Card>
        )}

        {faithDone && (
          <Card tone="good" role="status" className="space-y-3 text-center">
            <h3 ref={doneRef} tabIndex={-1} className="text-xl font-extrabold outline-none">Thanks for taking the time 🕊️</h3>
            <LinkButton to="/help/learn" block>Back to Money school</LinkButton>
          </Card>
        )}
      </article>

      {!finished && (
        <nav aria-label="Lesson steps" className="mt-6 grid grid-cols-2 gap-3">
          {i === 0
            ? <LinkButton to="/help/learn" variant="secondary" icon="back">All lessons</LinkButton>
            : <Button variant="secondary" icon="back" onClick={() => go(i - 1)}>Back</Button>}
          {!isLast ? (
            <Button onClick={() => go(i + 1)}>
              Next<Icon name="chevron-right" size={20} />
            </Button>
          ) : lesson.kind === 'faith' ? (
            <Button icon="check" onClick={() => { setFaithDone(true); focusDone(); }}>Done</Button>
          ) : null}
        </nav>
      )}
    </div>
  );
}
