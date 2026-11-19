// /family/needs — "What we need": grown-ups note what each child needs (school shoes, a bag…) for an occasion,
// say "I'll get it" and tick it off when it is bought. Kids never see this page or its data (the server refuses them).
import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Avatar, Badge, Button, Card, Chip, EmptyState, Icon, Input, LinkButton, MemberPicker, PageHeader, Section, Select, Sheet,
  Textarea, buttonClass, cx, useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { dateInTz, formatDate, formatDay, formatTime } from '../../lib/format';
import { useApp, useLoad } from '../../lib/session';
import { NEED_DEFAULT_OCCASIONS, type Member, type Need } from '../../lib/types';

const QUICK_ITEMS = ['School shoes', 'School bag', 'Stationery', 'Lunch box', 'School uniform', 'Sports kit'];
const CHANGED = 'Someone else just changed this. The list is refreshed.';
/** Someone else got there first (or removed it): refresh instead of showing an error. */
const isStale = (e: unknown) => ['wrong_status', 'not_found'].includes(toAppError(e).code);

export default function Needs() {
  const { me, members, membersById, family, state, now } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const active = useLoad(() => api.listNeeds('active'), [state?.now]);
  const done = useLoad(() => api.listNeeds('done'), [state?.now]);
  const occasions = useLoad(() => api.listNeedOccasions(), [state?.now]);
  const [kidFilter, setKidFilter] = useState<string | null>(null);
  const [occFilter, setOccFilter] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Need | 'new' | null>(null);
  const [buying, setBuying] = useState<Need | null>(null);
  const [menuFor, setMenuFor] = useState<Need | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const tz = family?.timezone ?? 'Europe/Amsterdam';
  const kids = useMemo(() => members.filter((m) => m.role === 'kid'), [members]);
  const nameOf = (id: string | null) => (id && id === me?.id ? 'you' : (id && membersById[id]?.display_name) || 'someone');
  const kidName = (n: Need) => membersById[n.member_id]?.display_name ?? 'a child';

  const occasionList = useMemo(() => {
    const seen = new Map<string, string>();
    for (const o of [...(occasions.data ?? NEED_DEFAULT_OCCASIONS), ...(active.data ?? []).map((n) => n.occasion),
      ...(done.data ?? []).map((n) => n.occasion)]) {
      if (!seen.has(o.toLowerCase())) seen.set(o.toLowerCase(), o);
    }
    return [...seen.values()];
  }, [occasions.data, active.data, done.data]);
  // Only the occasions that are actually on the lists are worth filtering on.
  const usedOccasions = useMemo(() => {
    const used = new Set([...(active.data ?? []), ...(done.data ?? [])].map((n) => n.occasion));
    if (occFilter) used.add(occFilter);
    return occasionList.filter((o) => used.has(o));
  }, [occasionList, active.data, done.data, occFilter]);

  const groups = useMemo(() => {
    const list = (active.data ?? []).filter((n) => (!kidFilter || n.member_id === kidFilter) && (!occFilter || n.occasion === occFilter));
    return kids.map((k) => ({ kid: k, items: list.filter((n) => n.member_id === k.id) })).filter((g) => g.items.length > 0);
  }, [active.data, kids, kidFilter, occFilter]);
  const doneShown = (done.data ?? []).filter((n) => (!kidFilter || n.member_id === kidFilter) && (!occFilter || n.occasion === occFilter));

  if (!me) return null;

  const reloadAll = () => { void active.reload(); void done.reload(); void occasions.reload(); };

  const run = async (n: Need, fn: () => Promise<unknown>, ok: string) => {
    setBusy(n.id);
    try {
      await fn();
      toast.show(ok, 'success');
    } catch (e) {
      toast.show(isStale(e) ? CHANGED : friendlyError(e), isStale(e) ? 'info' : 'error');
    } finally {
      setBusy(null);
      reloadAll();
    }
  };

  const claim = (n: Need) => run(n, () => api.claimNeed(n.id), `Thank you! You’re getting “${n.item}” 🙋`);
  const release = (n: Need) => run(n, () => api.releaseNeed(n.id), `“${n.item}” is open again`);
  const reopen = (n: Need) => run(n, () => api.reopenNeed(n.id), `“${n.item}” is back on the list`);
  const cancel = async (n: Need) => {
    setMenuFor(null);
    const yes = await confirm({
      title: `Take “${n.item}” off the list?`,
      message: `${kidName(n)} doesn’t need it any more. Everyone will see it is cancelled in the activity log.`,
      confirmLabel: 'Yes, cancel it',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (yes) await run(n, () => api.cancelNeed(n.id), `“${n.item}” is cancelled`);
  };

  const anyActive = (active.data?.length ?? 0) > 0;
  const filtered = !!kidFilter || !!occFilter;

  return (
    <>
      <PageHeader title="🛍️ What we need" back="/family" />

      <Card className="flex gap-3 bg-surface-2">
        <span className="text-2xl" aria-hidden="true">🤫</span>
        <p className="text-[15px]">
          Only grown-ups see this list, so surprises stay surprises. Say “I’ll get it” so nobody buys the same thing twice.
        </p>
      </Card>

      {kids.length > 0 && (
        <Button block icon="plus" className="mt-4" onClick={() => setEditing('new')}>Add a need</Button>
      )}

      {kids.length === 0 ? (
        <EmptyState
          className="mt-4"
          emoji="🧒"
          title="No children yet"
          message="Add a child to the family first, then note what they need here."
          action={<LinkButton to="/family" icon="family">Go to Family</LinkButton>}
        />
      ) : (
        <>
          {(anyActive || (done.data?.length ?? 0) > 0) && (
            <div className="mt-4 space-y-3">
              <div role="group" aria-label="Show needs for" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
                <Chip selected={kidFilter === null} onClick={() => setKidFilter(null)}>All children</Chip>
                {kids.map((k) => (
                  <Chip key={k.id} emoji={k.avatar} selected={kidFilter === k.id} onClick={() => setKidFilter(k.id)}>{k.display_name}</Chip>
                ))}
              </div>
              {usedOccasions.length > 1 && (
                <Select
                  label="Occasion"
                  value={occFilter}
                  onChange={(e) => setOccFilter(e.target.value)}
                  options={[{ value: '', label: 'All occasions' }, ...usedOccasions.map((o) => ({ value: o, label: o }))]}
                />
              )}
            </div>
          )}

          {active.error && !active.data ? (
            <Card className="mt-4 text-center">
              <p className="font-semibold">We couldn’t load the list.</p>
              <p className="mt-1 text-muted">{active.error}</p>
              <Button variant="secondary" className="mt-3" onClick={reloadAll}>Try again</Button>
            </Card>
          ) : !active.data ? (
            <div className="mt-6 space-y-2" aria-busy="true" aria-label="Loading what we need">
              {[0, 1, 2].map((i) => <div key={i} className="h-28 w-full motion-safe:animate-pulse rounded-2xl bg-surface-2" />)}
            </div>
          ) : !anyActive ? (
            <EmptyState
              className="mt-4"
              emoji="🛍️"
              title="Nothing on the list"
              message="Add what a child needs, like school shoes or a new bag. Every grown-up in the family will see it."
            />
          ) : groups.length === 0 ? (
            <Card className="mt-4 text-center">
              <p className="font-semibold">Nothing open for this choice.</p>
              <Button variant="ghost" className="mt-2" onClick={() => { setKidFilter(null); setOccFilter(''); }}>Show everything</Button>
            </Card>
          ) : (
            groups.map((g) => (
              <Section
                key={g.kid.id}
                className="mt-6"
                title={
                  <span className="flex items-center gap-2">
                    <Avatar member={g.kid} size="xs" name="" />
                    {g.kid.display_name} · {g.items.length} open
                  </span>
                }
              >
                <ul className="space-y-3">
                  {g.items.map((n) => (
                    <li key={n.id}>
                      <NeedCard
                        n={n}
                        kid={g.kid}
                        busy={busy === n.id}
                        nameOf={nameOf}
                        when={(iso) => formatDay(iso, tz, now())}
                        onClaim={() => void claim(n)}
                        onBuy={() => setBuying(n)}
                        onRelease={() => void release(n)}
                        onMenu={() => setMenuFor(n)}
                      />
                    </li>
                  ))}
                </ul>
              </Section>
            ))
          )}

          <section className="mt-8" aria-labelledby="needs-done-title">
            <h2 id="needs-done-title">
              <button
                type="button"
                aria-expanded={showDone}
                aria-controls="needs-done"
                onClick={() => setShowDone((x) => !x)}
                className="flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl border border-line/70 bg-surface px-4 text-left text-[16px] font-bold"
              >
                <span>✅ Done{done.data ? ` (${doneShown.length})` : ''}</span>
                <span className="flex items-center gap-1 text-[14px] font-semibold text-muted">
                  {showDone ? 'Hide' : 'Show'}
                  <Icon name="chevron-right" size={18} className={cx('transition-transform', showDone ? '-rotate-90' : 'rotate-90')} />
                </span>
              </button>
            </h2>
            {showDone && (
              <div id="needs-done" className="mt-3">
                {!done.data ? (
                  done.error
                    ? <p className="px-1 text-muted">{done.error}</p>
                    : <div className="h-16 w-full motion-safe:animate-pulse rounded-2xl bg-surface-2" aria-busy="true" aria-label="Loading" />
                ) : doneShown.length === 0 ? (
                  <p className="px-1 text-[15px] text-muted">Nothing bought yet{filtered ? ' for this choice' : ''}. Ticked-off needs stay here for a year.</p>
                ) : (
                  <Card padded={false} className="overflow-hidden">
                    <ul className="divide-y divide-line">
                      {doneShown.map((n) => (
                        <li key={n.id} className="flex items-start gap-3 p-4">
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] [overflow-wrap:anywhere]">
                              <span aria-hidden="true">✅ </span>
                              <strong>{n.item}</strong> for {kidName(n)}: bought by {nameOf(n.done_by)} on{' '}
                              {formatDate(dateInTz(n.done_at!, tz), { year: true })}, {formatTime(n.done_at!, tz)}
                            </p>
                            <p className="mt-1 text-[13px] text-muted">{n.occasion}</p>
                            {n.done_note && <p className="mt-1 text-[14px] italic [overflow-wrap:anywhere]">“{n.done_note}”</p>}
                          </div>
                          {n.can_reopen && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={busy === n.id}
                              aria-label={`Reopen ${n.item} for ${kidName(n)}`}
                              onClick={() => void reopen(n)}
                            >
                              Reopen
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {editing && (
        <NeedSheet
          need={editing === 'new' ? null : editing}
          kids={kids}
          defaultKid={kidFilter ?? (kids.length === 1 ? kids[0].id : null)}
          occasions={occasionList}
          onClose={() => setEditing(null)}
          onSaved={reloadAll}
        />
      )}
      {buying && (
        <BoughtSheet need={buying} kidName={kidName(buying)} onClose={() => setBuying(null)} onSaved={reloadAll} />
      )}
      {menuFor && (
        <Sheet open onClose={() => setMenuFor(null)} title={menuFor.item} description={`For ${kidName(menuFor)} · ${menuFor.occasion}`}>
          <div className="space-y-2 pb-2">
            {menuFor.can_edit && (
              <Button variant="secondary" size="lg" block icon="edit" onClick={() => { setEditing(menuFor); setMenuFor(null); }}>
                Edit
              </Button>
            )}
            {menuFor.can_cancel && (
              <Button variant="secondary" size="lg" block icon="trash" className="!text-bad" onClick={() => void cancel(menuFor)}>
                Cancel this need
              </Button>
            )}
            {!menuFor.can_edit && !menuFor.can_cancel && (
              <p className="text-[15px] text-muted">Only the person who added it, or a parent, can change this.</p>
            )}
            {!menuFor.can_edit && menuFor.can_cancel && menuFor.status === 'claimed' && (
              <p className="text-[14px] text-muted">Someone is already getting it, so it can’t be edited. Release it first.</p>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

function NeedCard({ n, kid, busy, nameOf, when, onClaim, onBuy, onRelease, onMenu }: {
  n: Need; kid: Member; busy: boolean; nameOf: (id: string | null) => string; when: (iso: string) => string;
  onClaim: () => void; onBuy: () => void; onRelease: () => void; onMenu: () => void;
}) {
  const what = `${n.item} for ${kid.display_name}`;
  const claimer = nameOf(n.claimed_by);
  const adder = nameOf(n.created_by);
  const since = n.claimed_at ? when(n.claimed_at) : '';
  const claimedLine = `${claimer === 'you' ? 'You are' : `${claimer.charAt(0).toUpperCase()}${claimer.slice(1)} is`} getting it`
    + (since ? ` · since ${['Today', 'Yesterday'].includes(since) ? since.toLowerCase() : since}` : '');
  return (
    <Card className={cx(n.status === 'claimed' && '!border-accent/40')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-snug [overflow-wrap:anywhere]">{n.item}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="accent"><span aria-hidden="true">🗓️</span><span className="sr-only">Occasion:</span> {n.occasion}</Badge>
          </div>
          {n.details && <p className="mt-2 whitespace-pre-line text-[15px] [overflow-wrap:anywhere]">{n.details}</p>}
          <p className="mt-2 text-[13px] text-muted">Added by {adder} · {when(n.created_at)}</p>
        </div>
        {(n.can_edit || n.can_cancel) && (
          <button
            type="button"
            onClick={onMenu}
            aria-label={`More for ${what}`}
            title="More"
            className={cx(buttonClass('ghost', 'sm'), 'size-11 shrink-0 rounded-full !px-0 text-xl')}
          >
            <span aria-hidden="true">⋯</span>
          </button>
        )}
      </div>

      <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[15px] font-semibold">
        {n.status === 'claimed' ? (
          <p><span aria-hidden="true">🙋 </span>{claimedLine}</p>
        ) : (
          <p><span aria-hidden="true">🔎 </span>Open: nobody is getting it yet</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {n.status === 'open' && n.can_claim && (
          <Button size="sm" loading={busy} onClick={onClaim} aria-label={`I’ll get it: ${what}`}>I’ll get it 🙋</Button>
        )}
        {n.can_complete && (
          <Button
            size="sm"
            variant={n.status === 'claimed' ? 'primary' : 'secondary'}
            disabled={busy}
            onClick={onBuy}
            aria-label={`Bought: ${what}`}
          >
            Bought ✅
          </Button>
        )}
        {n.status === 'claimed' && n.can_release && (
          <Button size="sm" variant="secondary" loading={busy} onClick={onRelease} aria-label={`Release ${what}`}>Release</Button>
        )}
      </div>
    </Card>
  );
}

function BoughtSheet({ need, kidName, onClose, onSaved }: { need: Need; kidName: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sending = useRef(false);
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await api.completeNeed(need.id, note.trim() || null);
      toast.show(`“${need.item}” is bought ✅ Thank you!`, 'success');
      onSaved();
      onClose();
    } catch (err) {
      // not_allowed here means someone else claimed it in the meantime: show the fresh list.
      if (isStale(err) || toAppError(err).code === 'not_allowed') {
        toast.show(CHANGED, 'info');
        onSaved();
        onClose();
      } else {
        setError(toAppError(err).code === 'invalid' ? 'The note is too long (200 characters at most).' : friendlyError(err));
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Bought “${need.item}”?`}
      description={`For ${kidName}. Everyone sees who bought it and when.`}
      footer={<Button size="lg" block loading={busy} onClick={() => void save()}>Bought ✅</Button>}
    >
      <form className="space-y-4 pt-1" onSubmit={save} noValidate>
        <Textarea
          label="Note"
          optional
          rows={2}
          maxLength={200}
          value={note}
          placeholder="Bought at Mr Price, size 5"
          hint="Where, which size, or where it is now."
          onChange={(e) => { setNote(e.target.value); setError(null); }}
          autoFocus
        />
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-bad-soft p-3 text-[15px] text-bad">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />{error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

function NeedSheet({ need, kids, defaultKid, occasions, onClose, onSaved }: {
  need: Need | null; kids: Member[]; defaultKid: string | null; occasions: string[]; onClose: () => void; onSaved: () => void;
}) {
  const { membersById } = useApp();
  const toast = useToast();
  const [kid, setKid] = useState<string | null>(need?.member_id ?? defaultKid);
  const [item, setItem] = useState(need?.item ?? '');
  const [occasion, setOccasion] = useState(need?.occasion ?? 'Anytime');
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState('');
  const [details, setDetails] = useState(need?.details ?? '');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<{ field?: string; text: string } | null>(null);
  const clear = () => setServerError(null);

  const chosenOccasion = custom ? customText.trim() : occasion;
  const kidError = !kid ? 'Pick a child.' : undefined;
  const itemError = !item.trim() ? 'Write what they need, e.g. “School shoes”.' : undefined;
  const occasionError = custom && !customText.trim() ? 'Type the occasion, or pick one above.' : undefined;
  const fieldErr = (f: string) => (serverError?.field === f ? serverError.text : undefined);
  const choices = occasions.some((o) => o.toLowerCase() === occasion.toLowerCase()) ? occasions : [...occasions, occasion];

  const sending = useRef(false);
  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    if (sending.current) return;
    setTried(true);
    if (kidError || itemError || occasionError) return;
    sending.current = true;
    setBusy(true);
    try {
      if (need) await api.updateNeed(need.id, item.trim(), chosenOccasion, details.trim() || null);
      else await api.addNeed(kid!, item.trim(), chosenOccasion, details.trim() || null);
      toast.show(need ? 'Saved ✅' : `Added “${item.trim()}” 🛍️`, 'success');
      onSaved();
      onClose();
    } catch (err) {
      const ae = toAppError(err);
      if (isStale(err) && need) {
        toast.show(CHANGED, 'info');
        onSaved();
        onClose();
      } else if (ae.code === 'invalid' && ae.detail === 'too_many_needs') {
        setServerError({ text: 'The list is full (300 open needs). Tick some off first.' });
      } else if (ae.code === 'invalid' && ae.detail && ['member', 'item', 'occasion', 'details'].includes(ae.detail)) {
        setServerError({ field: ae.detail, text: ae.detail === 'member' ? 'Pick one of the children.' : 'Please check this.' });
      } else {
        setServerError({ text: friendlyError(err) });
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const forKid = need ? membersById[need.member_id] : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={need ? `Edit “${need.item}”` : 'What does a child need?'}
      description="Only grown-ups see this."
      footer={<Button size="lg" block loading={busy} onClick={() => void save()}>{need ? 'Save' : 'Add to the list'}</Button>}
    >
      <form className="space-y-5 pt-1" onSubmit={save} noValidate>
        {need ? (
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {forKid && <Avatar member={forKid} size="sm" name="" />} For {forKid?.display_name ?? 'a child'}
          </p>
        ) : (
          <div>
            <MemberPicker label="For which child?" showLabel members={kids} value={kid} onChange={(id) => { setKid(id); clear(); }} />
            {((tried && kidError) || fieldErr('member')) && (
              <p className="mt-1 text-[14px] font-semibold text-bad" role="alert">
                <Icon name="alert" size={16} className="mr-1 inline" />{(tried && kidError) || fieldErr('member')}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Input
            label="What do they need?"
            value={item}
            maxLength={80}
            placeholder="School shoes"
            onChange={(e) => { setItem(e.target.value); clear(); }}
            error={(tried && itemError) || fieldErr('item')}
          />
          {!need && (
            <div role="group" aria-label="Quick picks" className="flex flex-wrap gap-2">
              {QUICK_ITEMS.map((q) => (
                <Chip key={q} selected={item === q} onClick={() => { setItem(q); clear(); }}>{q}</Chip>
              ))}
            </div>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[15px] font-semibold">When is it for?</legend>
          <div className="flex flex-wrap gap-2">
            {choices.map((o) => (
              <Chip key={o} selected={!custom && occasion === o} onClick={() => { setOccasion(o); setCustom(false); clear(); }}>{o}</Chip>
            ))}
            <Chip selected={custom} emoji="✏️" onClick={() => { setCustom(true); clear(); }}>New occasion…</Chip>
          </div>
          {custom && (
            <Input
              label="New occasion"
              value={customText}
              maxLength={40}
              placeholder="Summer camp"
              onChange={(e) => { setCustomText(e.target.value); clear(); }}
              error={(tried && occasionError) || fieldErr('occasion')}
              autoFocus
            />
          )}
          {!custom && fieldErr('occasion') && <p className="text-[14px] font-semibold text-bad" role="alert">{fieldErr('occasion')}</p>}
        </fieldset>

        <Textarea
          label="Details"
          optional
          rows={3}
          maxLength={300}
          value={details}
          placeholder="Size 5, black, no laces"
          hint="Size, colour, a shop or a link."
          onChange={(e) => { setDetails(e.target.value); clear(); }}
          error={fieldErr('details')}
        />

        {serverError && !serverError.field && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-bad-soft p-3 text-[15px] text-bad">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />{serverError.text}
          </p>
        )}
      </form>
    </Sheet>
  );
}
