// /help/learn/plan — managers: the Money school lesson plan. Which lesson-bank themes (./bank.ts) open in which month:
// this month and the next 11, up to 3 themes a month, a theme in one month only. A theme whose month has started can't
// be removed or moved any more (the server says plan_locked too). Saved as family setting lesson_plan via update_family.
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import {
  Badge, Button, Card, IconButton, LinkButton, PageHeader, PageSpinner, Section, Sheet, useToast,
} from '../../../components/ui';
import { api } from '../../../lib/api';
import { friendlyError, toAppError } from '../../../lib/errors';
import { useFeatures } from '../../../lib/features';
import { money } from '../../../lib/format';
import { useApp } from '../../../lib/session';
import { lessonRewardOf } from '../../../lib/types';
import {
  MAX_THEMES_A_MONTH, THEMES, THEME_BY_ID, addMonths, dayLabel, lessonOpenOn, lockedThemes, monthLabel, monthYearLabel,
  releaseLabel, themeMonth, themeVisible, type LessonPlan, type Theme,
} from './bank';
import { useFamilyToday, useLessonPlan } from './useLearn';

/** Friendly text for update_family's lesson_plan errors. */
function planError(e: unknown): string {
  const a = toAppError(e);
  if (a.code === 'invalid') {
    if (a.detail === 'plan_locked') return 'That theme has started, so it stays in its month. Reload the page and try again.';
    if (a.detail === 'duplicate_theme') return 'That theme is already planned for another month. Remove it there first.';
    if (a.detail === 'too_big') return 'That’s too much to save at once.';
    if (a.detail === 'setting:lesson_plan') return 'Please check the plan: up to 3 themes a month, from the list.';
  }
  return friendlyError(e);
}

export default function LessonPlanPage() {
  const { family, isManager } = useApp();
  const today = useFamilyToday();
  useEffect(() => { window.scrollTo({ top: 0 }); }, []);
  if (!isManager) return <Navigate replace to="/help/learn" />;
  if (!family || !today) return <PageSpinner />;
  return <PlanEditor today={today} currency={family.currency} reward={lessonRewardOf(family.settings)} />;
}

function PlanEditor({ today, currency, reward }: { today: string; currency: string; reward: number }) {
  const { refresh } = useApp();
  const { on } = useFeatures();
  const toast = useToast();
  const plan = useLessonPlan();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const thisMonth = today.slice(0, 7);
  const months = Array.from({ length: 12 }, (_, i) => addMonths(thisMonth, i));
  // Planned further ahead than the 12 months shown (only possible through the API): still listed, so nothing is hidden.
  const later = Object.keys(plan).filter((k) => k > months[11]).sort();
  const earlier = Object.keys(plan).filter((k) => k < thisMonth).sort().reverse();
  const locked = lockedThemes(plan, thisMonth);
  const m = (cents: number) => money(cents, currency, { whole: true });

  const save = async (next: LessonPlan, message: string) => {
    setBusy(true);
    setErr(null);
    try {
      await api.updateFamily({ settings: { lesson_plan: next } });
      await refresh();
      toast.show(message, 'success');
      setAdding(null);
    } catch (e) {
      setErr(planError(e));
    } finally {
      setBusy(false);
    }
  };

  const add = (month: string, t: Theme) =>
    void save({ ...plan, [month]: [...(plan[month] ?? []), t.id] }, `${t.title}: planned for ${monthYearLabel(month)} ✅`);
  const remove = (month: string, t: Theme) => {
    const next: LessonPlan = { ...plan, [month]: (plan[month] ?? []).filter((id) => id !== t.id) };
    if (next[month].length === 0) delete next[month];
    void save(next, `${t.title}: removed from ${monthYearLabel(month)}`);
  };

  // This month's lessons: what opens when, and (Money school reward on) how much the kids can earn with them.
  const nowThemes = (plan[thisMonth] ?? []).map((id) => THEME_BY_ID[id]).filter((t): t is Theme => !!t && t.status === 'ready');
  const newThisMonth = nowThemes
    .filter((t) => themeVisible(t, on))
    .flatMap((t) => t.lessons)
    .filter((l) => lessonOpenOn(plan, l.id)?.slice(0, 7) === thisMonth).length;

  const monthCard = (month: string) => (
    <MonthCard
      key={month} month={month} isNow={month === thisMonth} plan={plan} locked={locked} busy={busy}
      faithOn={on('faith')} onAdd={() => { setErr(null); setAdding(month); }} onRemove={(t) => remove(month, t)}
    >
      {month === thisMonth && nowThemes.length > 0 && (
        <div className="space-y-1 rounded-xl bg-surface-2 px-3 py-2.5">
          <p className="text-[14px] font-bold uppercase tracking-wide text-muted">This month</p>
          <ul className="space-y-1 text-[15px]">
            {nowThemes.map((t) => (
              <li key={t.id}>
                {scheduleLine(t, plan, today)}
                {!themeVisible(t, on) && <span className="text-muted"> (hidden while Faith is switched off)</span>}
              </li>
            ))}
          </ul>
          {reward > 0 && newThisMonth > 0 && (
            <p className="text-[15px] font-semibold text-good">
              Up to {newThisMonth} new lesson{newThisMonth === 1 ? '' : 's'} × {m(reward)} = {m(newThisMonth * reward)} a child this month.
            </p>
          )}
        </div>
      )}
    </MonthCard>
  );

  return (
    <div className="space-y-6 pb-6">
      <PageHeader title="Lesson plan" subtitle="Money school" back="/help/learn" />

      <Card tone="accent" className="space-y-1.5">
        <p className="text-[17px] font-semibold leading-snug">
          <span aria-hidden="true">📅 </span>Pick up to {MAX_THEMES_A_MONTH} themes a month to keep Money school fresh.
        </p>
        <p className="text-[15px] text-muted">
          A weekly theme opens one lesson a week from the 1st; others open all their lessons on the 1st. The basics are
          always open. Once a theme’s month has started, it stays in the plan.
        </p>
      </Card>

      {err && !adding && <Card tone="bad" role="alert" className="text-[16px] font-semibold">{err}</Card>}

      <Section title="The next 12 months">
        <div className="space-y-3">{months.map((k) => monthCard(k))}</div>
      </Section>

      {later.length > 0 && (
        <Section title="Later">
          <div className="space-y-3">{later.map((k) => monthCard(k))}</div>
        </Section>
      )}

      {earlier.length > 0 && (
        <Section title="Earlier months">
          <Card className="space-y-2">
            {earlier.map((k) => (
              <p key={k} className="text-[16px]">
                <strong>{monthYearLabel(k)}:</strong>{' '}
                {(plan[k] ?? []).map((id) => THEME_BY_ID[id]).filter(Boolean).map((t) => `${t.emoji} ${t.title}`).join(', ')}
              </p>
            ))}
            <p className="text-[15px] text-muted">These stay open for everyone.</p>
          </Card>
        </Section>
      )}

      <AddThemeSheet
        month={adding} isNow={adding === thisMonth} plan={plan} busy={busy} err={adding ? err : null} faithOn={on('faith')}
        onClose={() => { setAdding(null); setErr(null); }} onAdd={(t) => adding && add(adding, t)}
      />
    </div>
  );
}

/** "Lesson 2 of 5 opens Tue 8 Dec" / "All 6 lessons are open" */
function scheduleLine(t: Theme, plan: LessonPlan, today: string): string {
  const dates = t.lessons.map((l) => lessonOpenOn(plan, l.id));
  const next = dates.findIndex((d) => d !== null && d > today);
  const icon = `${t.emoji} ${t.title}: `;
  if (next === -1) return `${icon}all ${t.lessons.length} lessons are open.`;
  if (t.release === 'all') return `${icon}all ${t.lessons.length} lessons open ${dayLabel(dates[next] as string)}.`;
  return `${icon}lesson ${next + 1} of ${t.lessons.length} opens ${dayLabel(dates[next] as string)}.`;
}

function MonthCard({ month, isNow, plan, locked, busy, faithOn, onAdd, onRemove, children }: {
  month: string; isNow: boolean; plan: LessonPlan; locked: Set<string>; busy: boolean; faithOn: boolean;
  onAdd: () => void; onRemove: (t: Theme) => void; children?: ReactNode;
}) {
  const themes = (plan[month] ?? []).map((id) => THEME_BY_ID[id]).filter((t): t is Theme => !!t);
  const label = monthYearLabel(month);
  return (
    <Card className="space-y-3" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-bold">{label}</h3>
        {isNow && <Badge tone="accent">This month</Badge>}
      </div>
      {themes.length === 0 ? (
        <p className="text-[15px] text-muted">No themes: just the basics.</p>
      ) : (
        <ul className="space-y-2">
          {themes.map((t) => {
            const isLocked = locked.has(t.id);
            return (
              <li key={t.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
                <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-snug">{t.title}</span>
                  <span className="block text-[14px] text-muted">
                    {releaseLabel(t)}{t.kind === 'faith' && ' · 🕊️ Faith'}
                    {t.kind === 'faith' && !faithOn && ' · hidden while Faith is switched off'}
                  </span>
                  {isLocked && <span className="block text-[14px] font-semibold text-muted">Started — can’t be removed</span>}
                </span>
                <IconButton
                  icon="close" label={`Remove ${t.title} from ${label}`} disabled={isLocked || busy}
                  onClick={() => onRemove(t)} className="shrink-0 disabled:opacity-40"
                />
              </li>
            );
          })}
        </ul>
      )}
      {children}
      {themes.length < MAX_THEMES_A_MONTH ? (
        <Button variant="secondary" size="sm" icon="plus" onClick={onAdd} disabled={busy}>
          Add a theme<span className="sr-only"> to {label}</span>
        </Button>
      ) : (
        <p className="text-[14px] text-muted">That’s {MAX_THEMES_A_MONTH} themes: the most for one month.</p>
      )}
    </Card>
  );
}

function AddThemeSheet({ month, isNow, plan, busy, err, faithOn, onClose, onAdd }: {
  month: string | null; isNow: boolean; plan: LessonPlan; busy: boolean; err: string | null; faithOn: boolean;
  onClose: () => void; onAdd: (t: Theme) => void;
}) {
  const visible = THEMES.filter((t) => t.kind !== 'faith' || faithOn);
  const ready = visible.filter((t) => t.status === 'ready');
  const soon = visible.filter((t) => t.status === 'soon');
  const monthNo = month ? Number(month.slice(5, 7)) : 0;
  return (
    <Sheet
      open={month !== null} onClose={onClose}
      title={month ? `Add a theme: ${monthYearLabel(month)}` : 'Add a theme'}
      description={`Up to ${MAX_THEMES_A_MONTH} themes a month.`}
    >
      {month && (
        <div className="space-y-4">
          {isNow && (
            <Card tone="warn" role="note" className="text-[15px] font-semibold leading-snug">
              This month has started: the theme opens right away (weekly lessons whose day has passed open at once), and
              it can’t be removed afterwards.
            </Card>
          )}
          {err && <Card tone="bad" role="alert" className="text-[15px] font-semibold">{err}</Card>}
          <ul className="space-y-3">
            {ready.map((t) => {
              const at = themeMonth(plan, t.id);
              const here = at === month;
              const suggested = t.suggestedMonths.includes(monthNo);
              return (
                <li key={t.id} className="space-y-2 rounded-2xl border border-line p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-3xl" aria-hidden="true">{t.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[17px] font-bold leading-snug">
                        {t.title}
                        {t.kind === 'faith' && <Badge tone="accent"><span aria-hidden="true">🕊️</span> Faith</Badge>}
                      </p>
                      <p className="text-[15px] text-muted">{t.summary}.</p>
                      <p className="text-[14px] text-muted">
                        {releaseLabel(t)}
                        {t.suggestedMonths.length > 0 && (
                          <> · {suggested ? <strong className="text-good">Suggested for {monthLabel(month)}</strong> : `Suggested: ${t.suggestedMonths.map((n) => monthLabel(`2000-${String(n).padStart(2, '0')}`)).join(', ')}`}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {here ? (
                      <Badge tone="good" icon="check">In {monthLabel(month)}</Badge>
                    ) : at ? (
                      <p className="text-[15px] font-semibold text-muted">Planned for {monthYearLabel(at)}</p>
                    ) : (
                      <Button size="sm" icon="plus" disabled={busy} onClick={() => onAdd(t)}>
                        Add<span className="sr-only"> {t.title}</span> to {monthLabel(month)}
                      </Button>
                    )}
                    <LinkButton size="sm" variant="secondary" to={`/help/learn/${t.lessons[0].id}`} onClick={onClose}>
                      Preview<span className="sr-only">: {t.title}</span>
                    </LinkButton>
                  </div>
                </li>
              );
            })}
          </ul>
          {soon.length > 0 && (
            <div className="space-y-2">
              <h3 className="px-1 text-sm font-bold uppercase tracking-wide text-muted">Coming soon</h3>
              <ul className="space-y-2" aria-label="Themes coming soon">
                {soon.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 rounded-2xl border border-dashed border-line p-3 opacity-70">
                    <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[16px] font-bold leading-snug">
                        {t.title}
                        {t.kind === 'faith' && <Badge tone="neutral"><span aria-hidden="true">🕊️</span> Faith</Badge>}
                        <Badge tone="neutral">Coming soon</Badge>
                      </p>
                      <p className="text-[15px] text-muted">{t.summary}.</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
