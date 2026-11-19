// Tallies card: This week · This month · This year, as cause → effect lines ("Earned +€5.00 — from tasks…").
import { useState } from 'react';
import { Card, Segmented, cx } from '../../components/ui';
import { useFeatures } from '../../lib/features';
import { addDays, formatDate, minutes, money, points } from '../../lib/format';
import type { Tally, Wallet } from '../../lib/types';
import { CardTitle } from './parts';
import { TONE_TEXT, type TxTone } from './txMeta';

type Period = 'week' | 'month' | 'ytd';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'ytd', label: 'This year' },
];

interface Line { key: string; emoji: string; label: string; why: string; text: string; words: string; tone: TxTone; zero: boolean }

function line(key: string, emoji: string, label: string, why: string, value: number, fmt: (v: number) => string, tone: TxTone, signed: boolean): Line {
  const sign = signed ? (tone === 'plus' ? '+' : tone === 'minus' ? '−' : '') : '';
  return {
    key, emoji, label, why, tone, zero: value === 0,
    text: `${sign}${fmt(Math.abs(value))}`,
    words: signed && tone !== 'neutral' ? `${tone === 'plus' ? 'plus' : 'minus'} ${fmt(Math.abs(value))}` : fmt(Math.abs(value)),
  };
}

function rangeText(t: Tally): string {
  if (t.period === 'ytd') return `Since ${formatDate(t.start, { year: true })}`;
  return `${formatDate(t.start)} – ${formatDate(addDays(t.end, -1))}`;
}

const join = (parts: string[]) => parts.join(' · ');

/** "Tasks, bonuses and pocket money" */
function andList(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function TalliesCard({ wallet, self, name, cur }: { wallet: Wallet; self: boolean; name: string; cur: string }) {
  const [period, setPeriod] = useState<Period>('week');
  const features = useFeatures();
  const on = features.on;
  const t = wallet.tallies[period];
  const m = (v: number) => money(v, cur);
  const savedOut = t.money_saved < 0;
  const timeOn = on('time');
  const pointsOn = on('points');

  // Lines (and their explanations) only for the parts that are switched on (Family → Features).
  const earnedFrom = andList([
    'Tasks', ...(on('spotted') ? ['bonuses', 'gifts'] : []), ...(on('targets') ? ['prizes'] : []), ...(on('allowance') ? ['pocket money'] : []),
  ]);
  const moneyLines: Line[] = [
    line('earned', '✅', 'Earned', earnedFrom, t.money_earned, m, 'plus', true),
    line('lost', '⚠️', 'Lost', on('spotted') ? 'Fines and tasks not done in time' : 'Tasks not done in time', t.money_lost, m, 'minus', true),
    ...(on('savings') ? [line('saved', '🐷', savedOut ? 'Taken out of savings' : 'Saved', savedOut ? 'Moved back to the wallet' : 'Moved into savings', t.money_saved, m, 'neutral', false)] : []),
    line('spent', '🛍️', 'Spent', 'Things bought', t.money_spent, m, 'neutral', false),
    ...(on('interest') ? [line('interest', '🌱', 'Interest', 'Savings grew by themselves (counted in Earned)', t.interest, m, 'plus', true)] : []),
  ];
  const timeLines: Line[] = [
    line('t-earned', '⏱️', 'Time earned', 'From tasks and rewards', t.time_earned, (v) => minutes(v), 'plus', true),
    line('t-lost', '⏰', 'Time lost', 'Consequences and missed tasks', t.time_lost, (v) => minutes(v), 'minus', true),
    line('t-used', '⏳', 'Time used', 'Screen or fun time used', t.time_used, (v) => minutes(v), 'neutral', false),
  ];
  const pointLines: Line[] = [
    line('p-earned', '✨', 'Points earned', 'From tasks and rewards', t.points_earned, (v) => points(v), 'plus', true),
    line('p-lost', '💨', 'Points lost', 'Consequences and missed tasks', t.points_lost, (v) => points(v), 'minus', true),
  ];

  const possible = join([
    t.possible_cents > 0 ? m(t.possible_cents) : '',
    timeOn && t.possible_minutes > 0 ? minutes(t.possible_minutes) : '',
    pointsOn && t.possible_points > 0 ? points(t.possible_points) : '',
  ].filter(Boolean));
  const got = join([
    t.possible_cents > 0 || t.money_earned > 0 ? m(t.money_earned) : '',
    timeOn && t.possible_minutes > 0 && t.time_earned > 0 ? minutes(t.time_earned) : '',
    pointsOn && t.possible_points > 0 && t.points_earned > 0 ? points(t.points_earned) : '',
  ].filter(Boolean));

  return (
    <Card role="region" aria-labelledby="tallies-title">
      <CardTitle id="tallies-title">{self ? 'How you’re doing' : `How ${name} is doing`}</CardTitle>
      <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS} />
      <p className="mt-2 text-[13px] font-semibold text-muted">{rangeText(t)}</p>

      {period === 'week' && (
        <div className="mt-3 rounded-2xl bg-accent-soft px-3.5 py-3 text-[15px] text-accent-ink">
          {possible ? (
            self ? (
              <p><span aria-hidden="true">🎯 </span>This week you could earn <strong>{possible}</strong> — you’ve got <strong>{got || m(0)}</strong> so far. Do extra to earn more!</p>
            ) : (
              <p><span aria-hidden="true">🎯 </span>Possible this week: <strong>{possible}</strong> · {name} has <strong>{got || m(0)}</strong> so far.</p>
            )
          ) : (
            <p><span aria-hidden="true">🎯 </span>{self ? 'No tasks with rewards this week yet. Ask what you can do!' : `${name} has no tasks with rewards this week yet.`}</p>
          )}
        </div>
      )}

      <TallyGroup title="Money" emoji="💰" lines={moneyLines} />
      {timeOn && <TallyGroup title="Time" emoji="⏱️" lines={timeLines} />}
      {pointsOn && <TallyGroup title="Points" emoji="✨" lines={pointLines} />}

      <div className="mt-4">
        <h4 className="text-[13px] font-bold uppercase tracking-wide text-muted"><span aria-hidden="true">📋 </span>Tasks</h4>
        <p className="mt-1 text-[15px] font-semibold">
          {t.tasks_done} done · {t.tasks_missed} not done · {t.tasks_open} to do
        </p>
      </div>
    </Card>
  );
}

function TallyGroup({ title, emoji, lines }: { title: string; emoji: string; lines: Line[] }) {
  return (
    <div className="mt-4">
      <h4 className="text-[13px] font-bold uppercase tracking-wide text-muted"><span aria-hidden="true">{emoji} </span>{title}</h4>
      <dl className="mt-1 divide-y divide-line/70">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-3 py-2">
            <span className="text-lg" aria-hidden="true">{l.emoji}</span>
            <dt className="min-w-0 flex-1">
              <span className="block font-semibold leading-tight">{l.label}</span>
              <span className="block text-[13px] leading-snug text-muted">{l.why}</span>
            </dt>
            <dd className={cx('whitespace-nowrap text-[17px] font-extrabold tabular-nums', l.zero ? 'text-muted' : TONE_TEXT[l.tone])}>
              {l.zero ? (
                <><span aria-hidden="true">—</span><span className="sr-only">none</span></>
              ) : (
                <><span aria-hidden="true">{l.text}</span><span className="sr-only">{l.words}</span></>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

