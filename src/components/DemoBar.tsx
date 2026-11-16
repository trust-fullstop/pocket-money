import { useState } from 'react';
import { useNavigate } from 'react-router';
import { backend } from '../lib/backend';
import { friendlyError } from '../lib/errors';
import { formatDate, todayISO } from '../lib/format';
import { useApp } from '../lib/session';
import { DemoPeopleSheet } from './DemoPeopleSheet';
import { Icon, Spinner, useConfirm, useToast } from './ui';

/** Thin strip at the very top in demo mode: who you are · jump a day ahead · reset. */
export function DemoBar() {
  const { me, family, refresh } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [people, setPeople] = useState(false);
  const [busy, setBusy] = useState<'day' | 'reset' | null>(null);

  const nextDay = async () => {
    setBusy('day');
    try {
      const iso = await backend().demo!.advance(24);
      await refresh({ tick: true });
      toast.show(`⏩ It's now ${formatDate(todayISO(family?.timezone ?? 'UTC', new Date(iso)), { long: true })}`, 'info');
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Reset the demo?',
      message: 'Everything you changed in the demo is thrown away and the example family comes back.',
      confirmLabel: 'Reset demo', danger: true,
    });
    if (!ok) return;
    setBusy('reset');
    try {
      await backend().demo!.reset();
      const s = await refresh();
      navigate(s ? '/' : '/welcome', { replace: true });
      toast.show('Demo reset', 'success');
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const btn = 'inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[13px] font-bold hover:bg-black/10 disabled:opacity-60';
  return (
    <div className="bg-amber-300 text-amber-950 dark:bg-amber-400">
      <div className="mx-auto flex max-w-md items-center gap-1 px-2" role="region" aria-label="Demo controls">
        <span className="rounded-md bg-amber-950 px-1.5 py-0.5 text-[11px] font-black tracking-wider text-amber-300">DEMO</span>
        <button type="button" className={`${btn} min-w-0 flex-1 justify-start`} onClick={() => setPeople(true)} aria-haspopup="dialog">
          <span className="truncate">{me ? `${me.avatar} ${me.display_name}` : 'Pick a person'}</span>
          <Icon name="chevron-down" size={16} />
          <span className="sr-only">– switch person</span>
        </button>
        <button type="button" className={btn} onClick={nextDay} disabled={!!busy} aria-label="Jump one day ahead">
          {busy === 'day' ? <Spinner size={14} /> : <Icon name="forward" size={14} />}+1 day
        </button>
        <button type="button" className={btn} onClick={reset} disabled={!!busy} aria-label="Reset the demo">
          {busy === 'reset' ? <Spinner size={14} /> : <Icon name="reset" size={14} />}Reset
        </button>
      </div>
      <DemoPeopleSheet open={people} onClose={() => setPeople(false)} />
    </div>
  );
}
