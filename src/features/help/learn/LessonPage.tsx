// /help/learn/:id — one lesson, one step at a time. Tracked lessons (core + the lesson bank's themes) end with a quiz and
// are finished on the server (with the quiz's answers as proof); faith reflections end with "Talk about it" and a Done
// (nothing stored). A theme lesson that isn't open (not planned, or before its opening day): a friendly locked page for
// kids and relatives, a preview for managers (the server says 'not_open' too).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { Button, Card, EmptyState, FxNote, Icon, LinkButton, PageHeader, ProgressBar } from '../../../components/ui';
import { api } from '../../../lib/api';
import { friendlyError, toAppError } from '../../../lib/errors';
import { useApp } from '../../../lib/session';
import { dayLabel, type Theme } from './bank';
import { BlockView } from './blocks';
import { visibleLessons } from './lessons';
import { LESSON_PLAN_PATH, lessonGate } from './progress';
import { Quiz } from './Quiz';
import { Rich } from './ui';
import { isTracked, type Lesson, type LessonCtx } from './types';
import { useFamilyToday, useLessonCtx, useLessonPlan, useLessonsDone } from './useLearn';

export default function LessonPage() {
  const { id } = useParams();
  const ctx = useLessonCtx();
  const { isManager } = useApp();
  const today = useFamilyToday();
  const plan = useLessonPlan();
  const lesson = visibleLessons(ctx).find((l) => l.id === id);
  if (!lesson) return <Navigate replace to="/help/learn" />;
  const g = lessonGate(lesson.id, plan, today, isManager);
  if (g.gate === 'locked') return <LockedLesson lesson={lesson} theme={g.theme} openOn={g.openOn} />;
  return (
    <LessonView
      key={lesson.id} lesson={lesson} ctx={ctx} theme={g.theme} openOn={g.openOn} preview={g.gate === 'preview'} isManager={isManager}
    />
  );
}

function LessonTitle({ lesson }: { lesson: Lesson }) {
  return <span className={`block whitespace-normal text-balance ${lesson.title.length > 22 ? 'text-[1.5rem]' : ''}`}>{lesson.title}</span>;
}

/** A theme lesson that isn't open for kids and relatives: no lesson text, just when it opens (or that it isn't planned). */
function LockedLesson({ lesson, theme, openOn }: { lesson: Lesson; theme: Theme; openOn: string | null }) {
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  const opens = openOn ? dayLabel(openOn) : null;
  return (
    <div className="pb-6">
      <PageHeader title={<LessonTitle lesson={lesson} />} subtitle={theme.title} back="/help/learn" />
      <Card className="mt-2">
        <EmptyState
          emoji="🔒"
          title={opens ? `Opens ${opens}` : 'Not in the lesson plan'}
          message={opens
            ? <>“{lesson.title}” is part of <strong>{theme.title}</strong>. It isn’t open yet: come back on {opens}!</>
            : <>“{lesson.title}” is part of <strong>{theme.title}</strong>, which isn’t in the family’s lesson plan. Ask a parent!</>}
          action={<LinkButton to="/help/learn" variant="secondary" icon="back">Back to Money school</LinkButton>}
        />
      </Card>
    </div>
  );
}

type Finish =
  | { s: 'idle' }
  | { s: 'saving' }
  | { s: 'error'; msg: string; quiz?: boolean }
  | { s: 'done'; points: number; money: number; first: boolean };

const FALLBACK_TALK = [
  'What was new for you today?',
  'What is one thing you want to do differently this week?',
];

function reduceMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function LessonView({ lesson, ctx, theme, openOn, preview, isManager }: {
  lesson: Lesson; ctx: LessonCtx; theme: Theme | null; openOn: string | null; preview: boolean; isManager: boolean;
}) {
  const { refresh } = useApp();
  const { school } = useLessonsDone();
  const steps = useMemo(() => lesson.steps(ctx), [lesson, ctx]);
  const quiz = useMemo(() => (isTracked(lesson.kind) && lesson.quiz ? lesson.quiz(ctx) : []), [lesson, ctx]);
  const hasQuiz = quiz.length > 0;
  const total = steps.length + (hasQuiz ? 1 : 0);
  const [i, setI] = useState(0);
  const [fin, setFin] = useState<Finish>({ s: 'idle' });
  // A new key starts the quiz afresh (after the server didn't accept the answers).
  const [quizKey, setQuizKey] = useState(0);
  const answersRef = useRef<number[]>([]);
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

  const finish = async (answers: number[]) => {
    answersRef.current = answers;
    setFin({ s: 'saving' });
    try {
      const r = await api.finishLesson(lesson.id, answers);
      setFin({ s: 'done', points: r.points, money: r.money_cents ?? 0, first: r.first });
      focusDone();
      void refresh();
    } catch (e) {
      const err = toAppError(e);
      if (err.code === 'feature_off') void refresh();
      if (err.code === 'invalid' && err.detail === 'answers') {
        setFin({ s: 'error', quiz: true, msg: 'Something went wrong with the quiz — please try it again.' });
      } else if (err.code === 'invalid' && err.detail === 'not_open') {
        setFin({ s: 'error', msg: openOn ? `This lesson opens on ${dayLabel(openOn)}.` : 'This lesson isn’t in the family’s lesson plan yet.' });
      } else {
        setFin({ s: 'error', msg: friendlyError(e) });
      }
    }
  };
  const retryQuiz = () => { setFin({ s: 'idle' }); setQuizKey((k) => k + 1); };

  // "Next lesson": the next open one not done yet in the same group (the core lessons, or this theme), after this one
  // and wrapping round. All core lessons done → Home's "Up next" (an open theme lesson). A manager previewing a theme
  // that isn't open: its next lesson.
  const nextLesson = useMemo(() => {
    const own = theme ? school.themes.find((t) => t.theme.id === theme.id) : school.core;
    const list: { lesson: { id: string; title: string }; open: boolean; done: boolean }[] = own
      ? own.lessons
      : (theme?.lessons ?? []).map((l) => ({ lesson: l, open: false, done: false }));
    const at = list.findIndex((s) => s.lesson.id === lesson.id);
    const order = [...list.slice(at + 1), ...list.slice(0, Math.max(0, at))];
    const next = order.find((s) => (s.open || (preview && isManager)) && !s.done);
    if (next) return next.lesson;
    const up = school.upNext;
    if (!theme && up.kind === 'lesson' && up.lesson.lesson.id !== lesson.id) return up.lesson.lesson;
    return null;
  }, [school, theme, lesson, preview, isManager]);

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
        subtitle={lesson.kind === 'faith' ? 'A reflection' : theme ? theme.title : 'Money school'}
        back="/help/learn"
      />

      {preview && theme && (
        <Card tone="warn" role="note" className="mb-4 flex items-start gap-3">
          <Icon name="lock" size={20} className="mt-0.5 shrink-0" />
          <div className="min-w-0 space-y-1">
            <p className="text-[15px] font-semibold leading-snug">
              {openOn ? `Preview — the kids see this from ${dayLabel(openOn)}.` : 'Preview — this theme isn’t in the lesson plan, so the kids can’t see it.'}
            </p>
            {!openOn && (
              <LinkButton to={LESSON_PLAN_PATH} size="sm" variant="secondary">
                <span aria-hidden="true">📅 </span>Lesson plan
              </LinkButton>
            )}
          </div>
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
            <Quiz key={quizKey} questions={quiz} onAllRight={(a) => void finish(a)} locked={fin.s === 'saving' || fin.s === 'done'} />
            {fin.s === 'saving' && <p className="text-[15px] text-muted" aria-live="polite">Saving…</p>}
            {fin.s === 'error' && (
              <Card tone="warn" role="alert" className="space-y-3">
                <p className="font-semibold">{fin.quiz ? 'Hmm, that didn’t work.' : 'All right, but we couldn’t save it yet.'}</p>
                <p className="text-[15px] text-muted">{fin.msg}</p>
                {fin.quiz
                  ? <Button icon="reset" variant="secondary" onClick={retryQuiz}>Do the quiz again</Button>
                  : <Button icon="reset" variant="secondary" onClick={() => void finish(answersRef.current)}>Try again</Button>}
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
