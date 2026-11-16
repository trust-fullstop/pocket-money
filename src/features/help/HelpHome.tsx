import type { ReactNode } from 'react';
import { Card, LinkButton, PageHeader, Section } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { money } from '../../lib/format';
import { useApp } from '../../lib/session';
import { FAQ } from './answers';
import { featureGuide } from './guide';
import { Disclosure } from './parts';

/** /help — how Pocket Money works, for kids (12–14) and grown-ups. */
export default function HelpHome() {
  const { me, family, isManager } = useApp();
  const features = useFeatures();
  const on = features.on;
  const isKid = me?.role === 'kid';
  const m = (cents: number) => money(cents, family?.currency ?? 'EUR', { whole: true });
  const cards = featureGuide(on, m, family?.settings ?? {});
  const faq = FAQ.filter((e) => e.q && (!e.feature || on(e.feature)));

  const hero = (
    <Card key="hero" tone="accent" className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-5xl" aria-hidden="true">🐷</span>
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold leading-tight text-accent-ink">How Pocket Money works</h2>
          <p className="text-accent-ink/90">
            {isKid ? 'Do your part. See the result. Watch your money grow.' : 'A family app about cause and effect, saving and teamwork.'}
          </p>
        </div>
      </div>
      {on('ask') ? (
        <LinkButton to="/help/ask" size="lg" block>
          <span aria-hidden="true">💬</span> Ask Pocket
        </LinkButton>
      ) : isManager ? (
        <p className="text-[15px] text-accent-ink/90">
          The question helper “Ask Pocket” is off. You can switch it on in Family → Features.
        </p>
      ) : (
        <p className="text-[15px] font-semibold text-accent-ink">Got a question? Ask a parent 🙂</p>
      )}
    </Card>
  );

  const purpose = (
    <Section key="purpose" title="What it’s for">
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
  );

  const startHere = (
    <Section key="start" title={isKid ? 'Start here' : 'Start here (for kids)'}>
      <Card padded={false}>
        <ol className="divide-y divide-line">
          <Step n={1} title="Check today’s tasks" action={isKid && <LinkButton to="/tasks" variant="secondary" size="sm">Open Tasks</LinkButton>}>
            Open Tasks. See what’s due today, and by when.
          </Step>
          <Step n={2} title="Do it, then add a photo">
            Tap the task, do the job and take a photo of the result. Send it. Sometimes a note is enough.
          </Step>
          <Step n={3} title="Watch your wallet" action={isKid && <LinkButton to="/money" variant="secondary" size="sm">Open Money</LinkButton>}>
            A grown-up checks it and says OK. Your reward lands in Money{on('points') ? ', and your points go up' : ''}. 🎉
          </Step>
        </ol>
      </Card>
    </Section>
  );

  const guide = (
    <Section key="guide" title="What our family uses">
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
  );

  const parents = (
    <Section key="parents" title="For parents">
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
            Bonus parents can do everything parents can. Grandparents give gifts{on('challenges') ? ' and set fun challenges' : ''}.
          </Tip>
          {on('ask') && <Tip emoji="💬">Ask Pocket answers the kids’ questions about the app. Parents can read every question.</Tip>}
        </ul>
        {isManager && (
          <LinkButton to="/family/features" variant="secondary" icon="settings" block>Switch parts on or off</LinkButton>
        )}
      </Card>
    </Section>
  );

  const faqSection = faq.length > 0 && (
    <Section key="faq" title="Questions and answers">
      <Card padded={false} className="divide-y divide-line overflow-hidden">
        {faq.map((e) => (
          <Disclosure key={e.id} summary={e.q}>{e.en}</Disclosure>
        ))}
      </Card>
      {on('ask') && (
        <LinkButton to="/help/ask" variant="ghost" icon="chat" block>Something else? Ask Pocket</LinkButton>
      )}
    </Section>
  );

  // Kids first see how to start; grown-ups first see the parent tips.
  const order = isKid
    ? [hero, startHere, purpose, guide, faqSection, parents]
    : isManager
      ? [hero, purpose, parents, guide, startHere, faqSection]
      : [hero, purpose, guide, startHere, faqSection, parents];

  return (
    <>
      <PageHeader title="Help" subtitle="How it works and questions" back />
      <div className="space-y-6">{order}</div>
    </>
  );
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
