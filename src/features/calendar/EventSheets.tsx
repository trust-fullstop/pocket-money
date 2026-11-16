import { useState } from 'react';
import {
  Button, Chip, EmojiGrid, Icon, Input, LinkButton, MemberPicker, Segmented, Select, Sheet, Textarea, Toggle,
  useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { formatDate } from '../../lib/format';
import { useApp } from '../../lib/session';
import type { EventInput, EventKind, EventOccurrence } from '../../lib/types';
import {
  EVENT_EMOJIS, KIND_META, REPEAT_LABEL, type RepeatKind, eventWhen, forWhomText, nextWholeHour, repeatText,
} from './events';
import { isoToZoned, zonedTimeToIso } from './tz';

interface Draft {
  kind: EventKind;
  emoji: string;
  title: string;
  date: string;
  time: string;
  allDay: boolean;
  repeat: RepeatKind;
  forMembers: string[];
  notes: string;
}

function draftFrom(occ: EventOccurrence | null, kind: EventKind, tz: string, now: Date): Draft {
  const start = nextWholeHour(tz, now);
  if (occ) {
    const z = isoToZoned(occ.occurs_at, tz);
    return {
      kind: occ.kind,
      emoji: occ.emoji || KIND_META[occ.kind].emoji,
      title: occ.title,
      date: z.date,
      time: occ.all_day ? start.time : z.time,
      allDay: occ.all_day,
      repeat: (occ.repeat as RepeatKind) || 'none',
      forMembers: [...occ.for_members],
      notes: occ.notes ?? '',
    };
  }
  const birthday = kind === 'birthday';
  return {
    kind, emoji: KIND_META[kind].emoji, title: '', date: start.date, time: start.time,
    allDay: birthday, repeat: birthday ? 'yearly' : 'none', forMembers: [], notes: '',
  };
}

/**
 * list_events only returns occurrences, not the series' first date. When a repeating item is edited
 * without touching its date/repeat we look back (≤ 399 days, the RPC allows 400) for the earliest
 * occurrence so saving doesn't silently move the series start to the tapped day.
 */
async function findSeriesStart(occ: EventOccurrence): Promise<string> {
  const t = new Date(occ.occurs_at).getTime();
  try {
    const list = await api.listEvents(new Date(t - 399 * 86_400_000).toISOString(), new Date(t + 60_000).toISOString());
    const same = list
      .filter((o) => o.source === 'event' && o.id === occ.id)
      .sort((a, b) => a.occurs_at.localeCompare(b.occurs_at));
    return same[0]?.occurs_at ?? occ.occurs_at;
  } catch {
    return occ.occurs_at;
  }
}

/** Confirm + delete. Resolves true when deleted. */
function useDeleteEvent() {
  const confirm = useConfirm();
  const toast = useToast();
  return async (occ: EventOccurrence): Promise<boolean> => {
    const ok = await confirm({
      title: `Delete “${occ.title}”?`,
      message: occ.repeat && occ.repeat !== 'none'
        ? 'It disappears for everyone, every time it repeats.'
        : 'It disappears for everyone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return false;
    try {
      await api.deleteEvent(occ.id);
      toast.show('Deleted', 'success');
      return true;
    } catch (e) {
      toast.show(friendlyError(e), 'error');
      return false;
    }
  };
}

export interface EventEditSheetProps {
  /** The occurrence being edited; null = add a new item. */
  occurrence: EventOccurrence | null;
  /** Kind for a new item (e.g. from Home's "Add reminder"). */
  initialKind?: EventKind;
  onClose: () => void;
  onSaved: () => void;
}

/** Add / edit sheet. Mount it only while open (state is initialised on mount). */
export function EventEditSheet({ occurrence, initialKind = 'event', onClose, onSaved }: EventEditSheetProps) {
  const { family, now, members } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const toast = useToast();
  const deleteEvent = useDeleteEvent();
  const [d, setD] = useState<Draft>(() => draftFrom(occurrence, initialKind, tz, now()));
  const [pickEmoji, setPickEmoji] = useState(false);
  const [busy, setBusy] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const changeKind = (kind: EventKind) => {
    setD((prev) => {
      const next: Draft = { ...prev, kind };
      if (prev.emoji === KIND_META[prev.kind].emoji) next.emoji = KIND_META[kind].emoji;
      if (kind === 'birthday') {
        next.allDay = true;
        if (prev.repeat === 'none') next.repeat = 'yearly';
      }
      return next;
    });
  };

  const emojiOptions = EVENT_EMOJIS.includes(d.emoji) ? EVENT_EMOJIS : [d.emoji, ...EVENT_EMOJIS];

  const save = async () => {
    setFormError(null);
    let bad = false;
    if (!d.title.trim()) { setTitleError('Give it a name.'); bad = true; } else setTitleError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || (!d.allDay && !/^\d{2}:\d{2}/.test(d.time))) {
      setDateError(d.allDay ? 'Pick a date.' : 'Pick a date and a time.');
      bad = true;
    } else setDateError(null);
    if (bad) return;
    setBusy(true);
    try {
      const time = d.allDay ? '00:00' : d.time.slice(0, 5);
      let startDate = d.date;
      if (occurrence && occurrence.repeat !== 'none') {
        const orig = draftFrom(occurrence, occurrence.kind, tz, now());
        if (orig.date === d.date && orig.repeat === d.repeat) {
          startDate = isoToZoned(await findSeriesStart(occurrence), tz).date;
        }
      }
      const input: EventInput = {
        id: occurrence?.id ?? null,
        title: d.title.trim().slice(0, 80),
        notes: d.notes.trim() ? d.notes.trim().slice(0, 500) : null,
        emoji: d.emoji,
        kind: d.kind,
        starts_at: zonedTimeToIso(startDate, time, tz),
        all_day: d.allDay,
        repeat: d.repeat,
        for_members: d.forMembers,
      };
      await api.upsertEvent(input);
      toast.show(occurrence ? 'Saved ✓' : 'Added to the calendar 📅', 'success');
      onSaved();
      onClose();
    } catch (e) {
      const msg = friendlyError(e);
      setFormError(msg);
      toast.show(msg, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!occurrence) return;
    if (await deleteEvent(occurrence)) { onSaved(); onClose(); }
  };

  const kindWord = KIND_META[d.kind].label.toLowerCase();
  return (
    <Sheet
      open
      onClose={onClose}
      title={occurrence ? `Edit ${kindWord}` : `New ${kindWord}`}
      footer={
        <div className="flex gap-2">
          {occurrence && (
            <Button variant="ghost" size="lg" icon="trash" onClick={remove} disabled={busy} className="!text-bad">
              Delete
            </Button>
          )}
          <Button size="lg" block loading={busy} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        <Segmented<EventKind>
          label="What is it?"
          value={d.kind}
          onChange={changeKind}
          options={(['event', 'reminder', 'birthday'] as EventKind[]).map((k) => ({
            value: k,
            label: <span><span aria-hidden="true">{KIND_META[k].emoji} </span>{KIND_META[k].label}</span>,
          }))}
        />

        <div className="flex items-end gap-3">
          <div className="shrink-0">
            <div className="mb-1.5 text-[15px] font-semibold" aria-hidden="true">Emoji</div>
            <button
              type="button"
              onClick={() => setPickEmoji((v) => !v)}
              aria-expanded={pickEmoji}
              aria-label={`Emoji ${d.emoji}, change`}
              className="grid size-12 place-items-center rounded-xl border border-line bg-surface text-[1.6rem] hover:bg-surface-2"
            >
              <span aria-hidden="true">{d.emoji}</span>
            </button>
          </div>
          <Input
            label="Title"
            wrapperClassName="min-w-0 flex-1"
            value={d.title}
            maxLength={80}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={d.kind === 'birthday' ? 'Grandma’s birthday' : d.kind === 'reminder' ? 'Bring swimming kit' : 'Football match'}
            error={titleError ?? undefined}
            autoFocus={!occurrence}
          />
        </div>
        {pickEmoji && (
          <EmojiGrid
            label="Pick an emoji"
            options={emojiOptions}
            value={d.emoji}
            onChange={(e) => { set({ emoji: e }); setPickEmoji(false); }}
          />
        )}

        <div className="space-y-3">
          <div className={d.allDay ? '' : 'grid grid-cols-[1.4fr_1fr] gap-3'}>
            <Input type="date" label="Date" value={d.date} onChange={(e) => set({ date: e.target.value })} error={dateError ?? undefined} />
            {!d.allDay && (
              <Input type="time" label="Time" step={300} value={d.time} onChange={(e) => set({ time: e.target.value })} />
            )}
          </div>
          <Toggle checked={d.allDay} onChange={(v) => set({ allDay: v })} label="All day" />
          <p className="text-[13px] text-muted">Times are in family time ({tz.replace(/_/g, ' ')}).</p>
        </div>

        <Select
          label="Repeat"
          value={d.repeat}
          onChange={(e) => set({ repeat: e.target.value as RepeatKind })}
          options={(Object.keys(REPEAT_LABEL) as RepeatKind[]).map((r) => ({ value: r, label: REPEAT_LABEL[r] }))}
        />

        <fieldset className="space-y-1">
          <legend className="mb-1.5 text-[15px] font-semibold">Who?</legend>
          <Chip selected={d.forMembers.length === 0} emoji="👨‍👩‍👧‍👦" onClick={() => set({ forMembers: [] })}>
            Everyone
          </Chip>
          <MemberPicker
            multiple
            label="Or pick people"
            members={members}
            value={d.forMembers}
            onChange={(ids) => set({ forMembers: ids })}
          />
          <p className="text-[13px] text-muted">
            {d.forMembers.length === 0 ? 'Shows for the whole family.' : `Only for ${forWhomText(d.forMembers, Object.fromEntries(members.map((m) => [m.id, m])))}.`}
          </p>
        </fieldset>

        <Textarea label="Notes" optional value={d.notes} maxLength={500} onChange={(e) => set({ notes: e.target.value })} rows={3} />

        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-bad-soft p-3 text-[15px] text-bad">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            {formError}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export interface EventViewSheetProps {
  occurrence: EventOccurrence;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}

/** Read-only details, with Edit / Delete for people allowed to change it. */
export function EventViewSheet({ occurrence: o, onClose, onEdit, onChanged }: EventViewSheetProps) {
  const { family, now, membersById } = useApp();
  const tz = family?.timezone ?? 'UTC';
  const deleteEvent = useDeleteEvent();
  const isBirthdayFromProfile = o.source === 'profile_birthday';
  const birthdayPerson = isBirthdayFromProfile ? membersById[o.id] : undefined;
  const creator = o.created_by ? membersById[o.created_by] : undefined;
  const repeat = o.repeat && o.repeat !== 'none' ? repeatText(o.repeat) : null;
  const date = isoToZoned(o.occurs_at, tz).date;

  const remove = async () => {
    if (await deleteEvent(o)) { onChanged(); onClose(); }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={<span><span aria-hidden="true">{o.emoji || KIND_META[o.kind].emoji} </span>{o.title}</span>}
      description={KIND_META[o.kind].label}
      footer={o.can_edit ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="lg" icon="trash" onClick={remove} className="!text-bad">Delete</Button>
          <Button size="lg" block icon="edit" onClick={onEdit}>Edit</Button>
        </div>
      ) : undefined}
    >
      <dl className="divide-y divide-line">
        <div className="flex gap-3 py-3">
          <dt className="w-24 shrink-0 font-semibold text-muted">When</dt>
          <dd>
            {eventWhen(o, tz, now())}
            <span className="block text-[14px] text-muted">{formatDate(date, { long: true })}</span>
          </dd>
        </div>
        {repeat && (
          <div className="flex gap-3 py-3">
            <dt className="w-24 shrink-0 font-semibold text-muted">Repeats</dt>
            <dd><span aria-hidden="true">🔁 </span>{repeat}</dd>
          </div>
        )}
        <div className="flex gap-3 py-3">
          <dt className="w-24 shrink-0 font-semibold text-muted">For</dt>
          <dd>{forWhomText(o.for_members, membersById)}</dd>
        </div>
        {o.notes && (
          <div className="flex gap-3 py-3">
            <dt className="w-24 shrink-0 font-semibold text-muted">Notes</dt>
            <dd className="whitespace-pre-line">{o.notes}</dd>
          </div>
        )}
        {creator && (
          <div className="flex gap-3 py-3">
            <dt className="w-24 shrink-0 font-semibold text-muted">Added by</dt>
            <dd>{creator.display_name}</dd>
          </div>
        )}
      </dl>
      {isBirthdayFromProfile && (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface-2 p-4">
          <p className="text-[15px]">
            <span aria-hidden="true">🎂 </span>Birthdays come from each person’s profile, so they can’t be changed here.
          </p>
          {birthdayPerson && (
            <LinkButton to={`/family/${birthdayPerson.id}`} variant="secondary" block onClick={onClose}>
              Open {birthdayPerson.display_name}’s profile
            </LinkButton>
          )}
        </div>
      )}
      {!o.can_edit && !isBirthdayFromProfile && (
        <p className="mt-3 text-[14px] text-muted">Only the person who added this or a parent can change it.</p>
      )}
    </Sheet>
  );
}
