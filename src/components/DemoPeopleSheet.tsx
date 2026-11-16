import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { backend } from '../lib/backend';
import { friendlyError } from '../lib/errors';
import { roleLabel } from '../lib/format';
import { useApp } from '../lib/session';
import { Avatar, EmptyState, Icon, Sheet, Spinner, useToast } from './ui';

type Person = Awaited<ReturnType<NonNullable<ReturnType<typeof backend>['demo']>['people']>>[number];

/** Demo only: pick which family member you are (no sign-in needed). */
export function DemoPeopleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, refresh } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPeople(null);
    backend().demo?.people()
      .then((p) => { if (alive) setPeople(p); })
      .catch((e) => { if (alive) { setPeople([]); toast.show(friendlyError(e), 'error'); } });
    return () => { alive = false; };
  }, [open, toast]);

  const pick = async (p: Person) => {
    if (p.member_id === me?.id) { onClose(); return; }
    setBusy(p.user_id);
    try {
      await backend().demo?.switchTo(p.user_id);
      await refresh();
      onClose();
      navigate('/');
      toast.show(`You are now ${p.display_name}`, 'success');
    } catch (e) {
      toast.show(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Switch person" description="The demo lets you try the app as anyone in the family.">
      {!people ? (
        <div className="grid place-items-center py-10"><Spinner size={28} label="Loading people" /></div>
      ) : people.length === 0 ? (
        <EmptyState emoji="🫥" title="Nobody here yet" message="Create a family first, or reset the demo to load the example family." />
      ) : (
        <ul className="-mx-2 space-y-1">
          {people.map((p) => {
            const current = p.member_id === me?.id;
            return (
              <li key={p.member_id}>
                <button
                  type="button" onClick={() => pick(p)} aria-current={current || undefined} disabled={!!busy}
                  className="flex min-h-16 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-surface-2 aria-[current]:bg-accent-soft"
                >
                  <Avatar emoji={p.avatar} name={p.display_name} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{p.display_name}</span>
                    <span className="block text-[14px] text-muted">{roleLabel(p.role)}</span>
                  </span>
                  {busy === p.user_id ? <Spinner /> : current ? (
                    <span className="flex items-center gap-1 text-[14px] font-bold text-accent-ink"><Icon name="check" size={18} />You</span>
                  ) : <Icon name="chevron-right" className="text-muted" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}
