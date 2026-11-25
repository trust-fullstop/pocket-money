import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Card, LinkButton, PageHeader, Section, cx } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { allowanceText, money } from '../../lib/format';
import { useApp } from '../../lib/session';
import { FaithSection } from '../faith/FaithSection';
import { FAQ } from './answers';
import { featureGuide } from './guide';
import { monthLabel } from './learn/series';
import { useLessonsDone } from './learn/useProgress';
import { Disclosure } from './parts';

const SECTION = 'scroll-mt-28 rounded-2xl outline-none';

function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

/** /help — how Sow & Grow works, for kids (12–14) and grown-ups. */
export default function HelpHome() {
  const { me, family, isManager } = useApp();
  const features = useFeatures();
  const on = features.on;
  const isKid = me?.role === 'kid';
  const m = (cents: number) => money(cents, family?.currency ?? 'EUR', { whole: true });
  const cards = featureGuide(on, m, family?.settings ?? {}, { allowance: me ? allowanceText(me, family?.currency) : null });
  const faq = FAQ.filter((e) => e.q && (!e.feature || on(e.feature)));
  const lessons = useLessonsDone();
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  const hero = (
    <Card key="hero" tone="accent" className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-5xl" aria-hidden="true">🐷</span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight text-accent-ink">How Sow &amp; Grow works</h2>
          <p className="text-accent-ink/90">
            {isKid ? 'Do your part. See the result. Watch your money grow.' : 'A family app about cause and effect, saving and teamwork.'}
          </p>
        </div>
      </div>
      {!on('ask') && (isManager ? (
        <p className="text-[15px] text-accent-ink/90">
          The question helper “Ask Pocket” is off. You can switch it on in Family → Features.
        </p>
      ) : (
        <p className="text-[15px] font-semibold text-accent-ink">Got a question? Ask a parent 🙂</p>
      ))}
    </Card>
  );

  const learnOn = on('learn');
  const { count, total } = lessons.progress;
  // The basics done and a lesson series just opened: point at what's new.
  const fresh = count === total ? lessons.series.find((s) => s.open && s.next) : undefined;
  const tiles = (
    <nav key="tiles" aria-label="Help topics" className={cx('grid gap-3', learnOn ? 'grid-cols-3' : 'grid-cols-2')}>
      <Tile emoji="📖" title="How the app works" sub="Start here" onClick={() => jumpTo(isKid ? 'help-start' : 'help-purpose')} />
      {learnOn && (
        <Tile
          emoji="🎓" title="Money school" to="/help/learn"
          sub={lessons.data === undefined ? 'Short lessons' : fresh ? `New for ${monthLabel(fresh.series.opensOn)}` : `${count} of ${total} done`}
        />
      )}
      {on('ask')
        ? <Tile emoji="💬" title="Ask a question" sub="Ask Pocket" to="/help/ask" />
        : <Tile emoji="💬" title="Ask a question" sub="Questions and answers" onClick={() => jumpTo(faq.length > 0 ? 'help-faq' : 'help-guide')} />}
    </nav>
  );

  const purpose = (
    <Jump key="purpose" id="help-purpose">
    <Section title="What it’s for">
      <Card padded={false} className="divide-y divide-line">
        <Point emoji="🔁" title="Cause and effect">
          What you do has a result. Do the job and you earn. Leave it and it costs a little.
        </Point>
        <Point emoji="🙌" title="Responsibility and rewards">
          You get trusted with real choices. Doing your part pays off{on('points') ? ', in money and points' : ''}.
        </Point>
        {on('savings') && (
          <Point emoji="🌱" title="Saving grows">
            Money you keep is there later{on('interest') ? ', and it gets a little bigger every week' : ''}{on('goals') ? '. Save up for something you really want' : ''}.
          </Point>
        )}
        <Point emoji="💛" title="Partnership, not punishment">
          {on('challenges')
            ? 'Challenges go both ways: kids can challenge grown-ups too. We’re a team.'
            : 'We’re a team. Grown-ups explain why, and mistakes can always be fixed.'}
        </Point>
      </Card>
    </Section>
    </Jump>
  );

  const startHere = (
    <Jump key="start" id="help-start">
    <Section title={isKid ? 'Start here' : 'Start here (for kids)'}>
      <Card padded={false}>
        <ol className="divide-y divide-line">
          <Step n={1} title="Check today’s tasks" action={isKid && <LinkButton to="/tasks" variant="secondary" size="sm">Open Tasks</LinkButton>}>
            Open Tasks. See what’s due today, and by when.
          </Step>
          <Step n={2} title="Do it, then add a photo">
            Tap the task, do the job and take a photo of the result. Send it. Sometimes a note is enough.
          </Step>
          <Step n={3} title="Watch your money" action={isKid && <LinkButton to="/money" variant="secondary" size="sm">Open Money</LinkButton>}>
            A grown-up checks it and says OK. Your reward lands in Money{on('points') ? ', and your points go up' : ''}. 🎉
          </Step>
        </ol>
      </Card>
    </Section>
    </Jump>
  );

  const guide = (
    <Jump key="guide" id="help-guide">
    <Section title="What our family uses">
      <ul className="space-y-3">
        {cards.map((c) => (
          <li key={c.key}>
            <Card className="space-y-2">
              <h3 className="flex items-center gap-2 text-lg font-bold">
                <span className="text-2xl" aria-hidden="true">{c.emoji}</span>{c.title}
              </h3>
              <p>{c.what}</p>
              <p className="text-[15px] text-muted"><span className="font-semibold text-ink">Why: </span>{c.why}</p>
              <p className="rounded-xl bg-surface-2 px-3 py-2 text-[15px]">
                <span className="font-semibold">Example: </span>{c.example}
              </p>
            </Card>
          </li>
        ))}
      </ul>
      <p className="px-1 text-sm text-muted">Parents choose which parts the family uses, and can add more later.</p>
    </Section>
    </Jump>
  );

  const parents = (
    <Jump key="parents" id="help-parents">
    <Section title="For parents">
      <Card className="space-y-3">
        <ul className="space-y-3">
          <Tip emoji="🌱">
            <b>Start small.</b> Begin with tasks{on('allowance') ? ', pocket money' : ''}{on('spotted') ? ' and Spotted' : ''}.
            Switch on savings, time or targets once the basics work.
          </Tip>
          <Tip emoji="⚙️"><b>Family → Features</b> switches parts of the app on or off for everyone.</Tip>
          {on('spotted') && (
            <Tip emoji="📸">
              <b>Spotted:</b> catch the good moments too, not only the mistakes. Write the reason in one line your child can read.
            </Tip>
          )}
          <Tip emoji="✅">
            <b>Approvals:</b> check the photo, then OK or Send back with a note. Was your child ill? Excuse a missed task and the cost is given back.
          </Tip>
          <Tip emoji="🧾">
            Every change shows who did it and why, so parents in different homes stay in sync. Mistakes can be undone, never hidden.
          </Tip>
          <Tip emoji="👪">
            Bonus parents and guardians can do everything parents can. Grandparents, aunts, uncles and godparents give gifts{on('challenges') ? ' and set fun challenges' : ''}.
          </Tip>
          {on('ask') && <Tip emoji="💬">Ask Pocket answers the kids’ questions about the app. Parents can read every question.</Tip>}
          {learnOn && (
            <Tip emoji="🎓">
              <b>Money school:</b> short lessons about saving, interest, goals, borrowing and insurance, each with a quick quiz.
              {isManager && <> <Link to="/help/learn/progress" className="font-semibold text-accent-ink underline underline-offset-2">See what the kids learned</Link>.</>}
            </Tip>
          )}
        </ul>
        {isManager && (
          <LinkButton to="/family/features" variant="secondary" icon="settings" block>Switch parts on or off</LinkButton>
        )}
      </Card>
    </Section>
    </Jump>
  );

  const faqSection = faq.length > 0 && (
    <Jump key="faq" id="help-faq">
    <Section title="Questions and answers">
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {faq.map((e) => (
          <Disclosure key={e.id} summary={e.q}>{e.en}</Disclosure>
        ))}
      </Card>
      {on('ask') && (
        <LinkButton to="/help/ask" variant="ghost" icon="chat" block>Something else? Ask Pocket</LinkButton>
      )}
    </Section>
    </Jump>
  );

  const faith = <FaithSection key="faith" />;

  // Kids first see how to start; grown-ups first see the parent tips.
  const order = isKid
    ? [hero, tiles, startHere, purpose, faith, guide, faqSection, parents]
    : isManager
      ? [hero, tiles, purpose, faith, parents, guide, startHere, faqSection]
      : [hero, tiles, purpose, faith, guide, startHere, faqSection, parents];

  return (
    <>
      <PageHeader title="Help" subtitle="How it works and questions" back />
      <div className="space-y-6">{order}</div>
    </>
  );
}

/** A section the tiles can jump to (focusable, so keyboard and screen-reader users land there too). */
function Jump({ id, children }: { id: string; children: ReactNode }) {
  return <div id={id} tabIndex={-1} className={SECTION}>{children}</div>;
}

const TILE = 'flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-2xl border border-line bg-surface px-2 py-3 text-center shadow-sm transition-colors hover:bg-surface-2 active:bg-surface-2';

function Tile({ emoji, title, sub, to, onClick }: { emoji: string; title: string; sub: string; to?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="text-3xl leading-none" aria-hidden="true">{emoji}</span>
      <span className="text-[15px] font-bold leading-tight text-ink">{title}</span>
      <span className="text-xs leading-tight text-muted">{sub}</span>
    </>
  );
  return to
    ? <Link to={to} className={TILE}>{body}</Link>
    : <button type="button" onClick={onClick} className={TILE}>{body}</button>;
}

function Point({ emoji, title, children }: { emoji: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <span className="text-2xl leading-8" aria-hidden="true">{emoji}</span>
      <div className="min-w-0">
        <h3 className="font-bold">{title}</h3>
        <p className="text-[16px] text-muted">{children}</p>
      </div>
    </div>
  );
}

function Step({ n, title, action, children }: { n: number; title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-strong font-extrabold text-white" aria-hidden="true">{n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-bold leading-9"><span className="sr-only">Step {n}: </span>{title}</h3>
        <p className="text-[16px] text-muted">{children}</p>
        {action}
      </div>
    </li>
  );
}

function Tip({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-xl leading-7" aria-hidden="true">{emoji}</span>
      <span className="min-w-0 flex-1 text-[16px]">{children}</span>
    </li>
  );
}
