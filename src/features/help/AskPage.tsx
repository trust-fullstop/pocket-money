import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  Button, Card, Chip, EmptyState, Icon, LinkButton, PageHeader, PageSpinner, Spinner, Textarea, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { timeAgo } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import type { AskEntry } from '../../lib/types';
import { localAnswer } from './answers';
import { STARTERS, plainAnswer } from './guide';
import { AnswerBubble, QuestionBubble, TypingBubble } from './parts';

const MAX = 500;

/** /help/ask — chat with "Ask Pocket". */
export default function AskPage() {
  const { me, isManager } = useApp();
  const features = useFeatures();
  if (!me) return <PageSpinner />;
  if (!features.on('ask')) return <AskOff isManager={isManager} />;
  return <AskChat key={me.id} meId={me.id} name={me.display_name} isManager={isManager} />;
}

function AskOff({ isManager }: { isManager: boolean }) {
  return (
    <>
      <PageHeader title="Ask Pocket" back="/help" />
      <EmptyState
        emoji="🐷" title="Ask a parent 🙂"
        message={isManager
          ? 'The question helper is switched off. You can switch it on in Family → Features.'
          : 'The question helper isn’t switched on in your family. A parent can help, or read Help to see how the app works.'}
        action={
          <div className="flex flex-col gap-2">
            <LinkButton to="/help" icon="back">Back to Help</LinkButton>
            {isManager && <LinkButton to="/family/features" variant="secondary" icon="settings">Family → Features</LinkButton>}
            {isManager && <LinkButton to="/help/ask/all" variant="ghost">See everyone’s questions</LinkButton>}
          </div>
        }
      />
    </>
  );
}

interface Bubble {
  key: string;
  question: string;
  answer: string | null;
  status: AskEntry['status'];
  created_at: string;
  /** Small caption under the answer (e.g. for a built-in answer that wasn't saved). */
  note?: string;
}

type Problem = 'not_configured' | 'limit' | 'off';

const toBubble = (e: AskEntry): Bubble => ({ key: e.id, question: e.question, answer: e.answer, status: e.status, created_at: e.created_at });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function AskChat({ meId, name, isManager }: { meId: string; name: string; isManager: boolean }) {
  const { now, refresh } = useApp();
  const features = useFeatures();
  const toast = useToast();
  const history = useLoad(() => api.listAsks(meId, 50), [meId]);
  const [extra, setExtra] = useState<Bubble[]>([]);   // asked during this visit (until the history has them)
  const [pending, setPending] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  const saved = (history.data ?? []).slice().reverse().map(toBubble);   // API: newest first → show oldest first
  const savedIds = new Set(saved.map((b) => b.key));
  const items = [...saved, ...extra.filter((b) => !savedIds.has(b.key))];

  const count = items.length + (pending ? 1 : 0);
  const loaded = !history.loading;
  useEffect(() => {
    if (!loaded || count === 0) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    composerRef.current?.scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' });
  }, [count, loaded]);

  const send = async (raw: string) => {
    const q = raw.trim().slice(0, MAX);
    if (!q || pending) return;
    const created = now().toISOString();
    const localKey = `local-${++seq.current}`;
    setPending(q);
    setText('');
    setProblem(null);
    try {
      const [res] = await Promise.all([api.ask(q), wait(600)]);
      const answer = res.answer?.trim() || null;
      setExtra((x) => [...x, { key: res.id ?? localKey, question: q, answer, status: answer ? 'answered' : 'pending', created_at: created }]);
      setPending(null);
      await history.reload();
    } catch (e) {
      setPending(null);
      const code = toAppError(e).code;
      if (code === 'ask_not_configured') {
        // The AI helper isn't set up yet: still give the built-in answer, so the question isn't wasted.
        setProblem('not_configured');
        setExtra((x) => [...x, { key: localKey, question: q, answer: localAnswer(q, features.on), status: 'answered', created_at: created, note: 'Quick answer from the Help pages' }]);
      } else if (code === 'ask_limit' || code === 'feature_off') {
        setProblem(code === 'ask_limit' ? 'limit' : 'off');
        setText(q);
        if (code === 'feature_off') refresh().catch(() => undefined);
      } else {
        setText(q);
        toast.show(friendlyError(e), 'error');
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(text);
    }
  };

  const at = (iso: string) => timeAgo(iso, now());

  return (
    <>
      <PageHeader title="Ask Pocket" subtitle="Questions about the app" back="/help" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <Icon name="lock" size={16} />Parents can read your questions.
        </p>
        {isManager && (
          <LinkButton to="/help/ask/all" variant="ghost" size="sm" className="-mr-2">See everyone’s questions</LinkButton>
        )}
      </div>

      <div role="log" aria-label="Your questions and Pocket’s answers" className="space-y-4">
        <AnswerBubble>
          Hi {name}! I’m Pocket. 🐷 Ask me anything about how the app works.
        </AnswerBubble>

        {history.loading && !history.data && (
          <p className="flex items-center gap-2 px-1 text-sm text-muted" role="status">
            <Spinner size={16} />Loading your questions…
          </p>
        )}
        {history.error && !history.data && (
          <Card className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[15px]">We couldn’t load your earlier questions.</span>
            <Button variant="secondary" size="sm" icon="reset" onClick={() => void history.reload()}>Try again</Button>
          </Card>
        )}

        {items.map((b) => (
          <div key={b.key} className="space-y-2">
            <QuestionBubble meta={at(b.created_at)}>{b.question}</QuestionBubble>
            {b.status === 'failed' ? (
              <AnswerBubble tone="warn">Pocket couldn’t answer this one. Try asking again, or ask a parent.</AnswerBubble>
            ) : b.answer ? (
              <AnswerBubble meta={b.note}>{plainAnswer(b.answer)}</AnswerBubble>
            ) : (
              <AnswerBubble tone="muted">Pocket is still thinking. Check back soon.</AnswerBubble>
            )}
          </div>
        ))}

        {pending && (
          <div className="space-y-2">
            <QuestionBubble meta="Sending…">{pending}</QuestionBubble>
            <TypingBubble />
          </div>
        )}
      </div>

      {problem && <ProblemCard problem={problem} isManager={isManager} />}

      <div ref={composerRef} className="mt-6 scroll-mb-28 space-y-3">
        <div className="-mx-4 overflow-x-auto px-4 pb-1">
          <div className="flex w-max gap-2" role="group" aria-label="Try asking">
            {STARTERS.map((s) => (
              <Chip key={s} onClick={() => void send(s)} disabled={!!pending}>{s}</Chip>
            ))}
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void send(text); }} className="space-y-3">
          <Textarea
            label="Your question" value={text} maxLength={MAX} rows={2} enterKeyHint="send"
            placeholder="How does…?" onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
            hint={<span className="tabular-nums">{text.length}/{MAX}</span>}
          />
          <Button type="submit" block size="lg" icon="send" loading={!!pending} disabled={!text.trim()}>
            {pending ? 'Asking…' : 'Send'}
          </Button>
        </form>
      </div>
    </>
  );
}

function ProblemCard({ problem, isManager }: { problem: Problem; isManager: boolean }) {
  const title = problem === 'not_configured'
    ? 'The helper isn’t switched on yet — ask a parent.'
    : problem === 'limit'
      ? 'You’ve asked a lot of questions today!'
      : 'The helper was just switched off. Ask a parent 🙂';
  const body = problem === 'not_configured'
    ? `Above is a quick answer from the Help pages.${isManager ? ' Parents: the AI helper still needs its key on the server.' : ''}`
    : problem === 'limit'
      ? 'Try again tomorrow, or ask a parent.'
      : 'You can still read how the app works in Help.';
  return (
    <Card tone="warn" className="mt-4 space-y-2" role="alert">
      <p className="flex items-start gap-2 font-bold"><Icon name="alert" size={20} className="mt-0.5 shrink-0 text-warn" />{title}</p>
      <p className="text-[15px]">{body}</p>
      <LinkButton to="/help" variant="secondary" size="sm" icon="help">Read how it works</LinkButton>
    </Card>
  );
}
