// Sheets for checking a task: "Send it back" (note required) and "Excuse" (managers).
import { useId, useState } from 'react';
import { Button, Chip, Sheet, Textarea } from '../../components/ui';
import type { TaskInstance } from '../../lib/types';
import { useTaskActions, useTaskCtx } from './hooks';
import { joinWords, penaltyParts } from './lib';

const SEND_BACK_CHIPS = ['Take a clearer photo', 'Not finished yet', 'Please try again'];
const EXCUSE_CHIPS = ['Was ill', 'At the other home', 'Our mistake'];
const NOTE_MAX = 300;

function QuickNotes({ options, value, onPick, label }: { options: string[]; value: string; onPick: (s: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => <Chip key={o} selected={value.trim() === o} onClick={() => onPick(o)}>{o}</Chip>)}
    </div>
  );
}

type SheetProps = { inst: TaskInstance | null; onClose: () => void; onDone: () => void };

/** "Send it back" with a required note. Calls onDone() after it was sent back. Fresh state per task. */
export function SendBackSheet(props: SheetProps) {
  return <SendBackBody key={props.inst?.id ?? ''} {...props} />;
}

function SendBackBody({ inst, onClose, onDone }: SheetProps) {
  const { nameOf } = useTaskCtx();
  const actions = useTaskActions(onDone);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const missing = !note.trim();
  const submit = async () => {
    if (!inst) return;
    setTried(true);
    if (missing || busy) return;
    setBusy(true);
    const ok = await actions.sendBack(inst, note);
    setBusy(false);
    if (ok) onClose();
  };

  const who = inst ? nameOf(inst.assignee_id) : '';
  return (
    <Sheet
      open={!!inst} onClose={onClose} title="Send it back"
      description={inst ? `Tell ${who} what to fix on “${inst.title}”.` : undefined}
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" form={formId} loading={busy} className="flex-1" icon="back">Send back</Button>
        </div>
      )}
    >
      <form id={formId} className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <QuickNotes label="Quick notes" options={SEND_BACK_CHIPS} value={note} onPick={(s) => { setNote(s); setTried(false); }} />
        <Textarea
          label={`Message for ${who}`} value={note} maxLength={NOTE_MAX} rows={3}
          onChange={(e) => setNote(e.target.value)}
          error={tried && missing ? `Say what ${who} should fix.` : undefined}
          hint={`${who} sees this when they open the task.`}
        />
      </form>
    </Sheet>
  );
}

/** "Excuse this for Sam?" — managers, open or missed tasks. Missed penalties are given back. */
export function ExcuseSheet(props: SheetProps) {
  return <ExcuseBody key={props.inst?.id ?? ''} {...props} />;
}

function ExcuseBody({ inst, onClose, onDone }: SheetProps) {
  const { nameOf, currency } = useTaskCtx();
  const actions = useTaskActions(onDone);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const formId = useId();

  const submit = async () => {
    if (!inst || busy) return;
    setBusy(true);
    const ok = await actions.excuse(inst, note);
    setBusy(false);
    if (ok) onClose();
  };

  const who = inst ? nameOf(inst.assignee_id) : '';
  const back = inst?.status === 'missed' ? penaltyParts(inst, currency).map((p) => p.prose) : [];
  const description = !inst ? undefined
    : back.length ? `The ${joinWords(back)} will be given back.`
    : inst.status === 'missed' ? 'It won’t count as not done.'
    : 'It won’t count as not done, and nothing will be taken away.';
  return (
    <Sheet
      open={!!inst} onClose={onClose} title={`Excuse this for ${who}?`} description={description}
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" form={formId} loading={busy} className="flex-1">Excuse</Button>
        </div>
      )}
    >
      <form id={formId} className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <QuickNotes label="Quick reasons" options={EXCUSE_CHIPS} value={note} onPick={setNote} />
        <Textarea label="Why?" optional value={note} maxLength={NOTE_MAX} rows={2} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Sheet>
  );
}
