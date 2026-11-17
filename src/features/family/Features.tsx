// /family/features — parents choose which parts of the app the family uses ("start small", switch on more later).
import { useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, LinkButton, PageHeader, Section, Sheet, Toggle, useToast, type BadgeTone,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { useApp } from '../../lib/session';
import {
  EVERYTHING, FEATURE_NEEDS, START_SMALL, featureOn, type Family, type FeatureKey, type Features as Switches,
} from '../../lib/types';
import {
  FEATURE_GROUPS, FEATURE_INFO, FEATURE_KEYS, FEATURE_TOTAL, countOn, featureChanges, fullFeatures, type FeatureInfo,
} from './featureList';

type Preset = 'small' | 'all';
const PRESET_NAME: Record<Preset, string> = { small: 'Start small', all: 'Everything' };
const INTRO = 'Start small. Switch on more once everyone gets the idea.';

const sameSwitches = (a: Switches, b: Switches) => FEATURE_KEYS.every((k) => a[k] === b[k]);

export default function FeaturesPage() {
  const { family, me, members, isManager, refresh } = useApp();
  if (!family || !me) return null;
  const owner = members.find((m) => m.role === 'owner');
  const askNote = owner && owner.id !== me.id
    ? `Needs the AI key set up by ${owner.display_name}.`
    : 'Needs the AI key set up first.';
  if (!isManager) return <ReadOnly family={family} />;
  return <FeaturesForm key={family.id} family={family} refresh={refresh} askNote={askNote} />;
}

function FeaturesForm({ family, refresh, askNote }: { family: Family; refresh: () => Promise<unknown>; askNote: string }) {
  const toast = useToast();
  const saved = useMemo(() => fullFeatures(family.settings?.features), [family.settings?.features]);
  const [d, setD] = useState<Switches>(saved);
  const [prevSaved, setPrevSaved] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState<Preset | null>(null);

  // Saved switches changed (our save, or another parent's): follow them unless there are unsaved edits.
  if (prevSaved !== saved) {
    setPrevSaved(saved);
    if (sameSwitches(d, prevSaved)) setD(saved);
  }

  const dirty = !sameSwitches(d, saved);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async (next: Switches, message: string): Promise<boolean> => {
    // The server merges switches, so send only the changed ones (the activity log then says what changed).
    const changed = Object.fromEntries(FEATURE_KEYS.filter((k) => next[k] !== saved[k]).map((k) => [k, next[k]]));
    if (Object.keys(changed).length === 0) { setD(next); return true; }
    setBusy(true);
    try {
      await api.updateFamily({ settings: { features: changed as Switches } });
      await refresh();
      setD(next);
      toast.show(message, 'success');
      return true;
    } catch (err) {
      toast.show(friendlyError(err), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  // "Everything" leaves Ask Pocket alone: it only works once the AI key is set up.
  const presetSwitches = (p: Preset): Switches => (p === 'small' ? { ...START_SMALL } : { ...EVERYTHING, ask: saved.ask });
  const inUse = (p: Preset) => {
    const c = featureChanges(saved, presetSwitches(p));
    return c.on.length + c.off.length === 0;
  };

  const pick = (p: Preset) => {
    const target = presetSwitches(p);
    const c = featureChanges(saved, target);
    if (c.on.length + c.off.length > 0) { setPreset(p); return; }
    if (sameSwitches(saved, target)) {
      setD(saved);
      toast.show(`You’re already on “${PRESET_NAME[p]}”.`, 'info');
    } else {
      void save(target, `“${PRESET_NAME[p]}” is on ✅`);
    }
  };

  const set = (key: FeatureKey, on: boolean) => setD((x) => ({ ...x, [key]: on }));

  return (
    <>
      <PageHeader title="Features" subtitle={`${countOn(d)} of ${FEATURE_TOTAL} on`} back="/family" />

      <div className="space-y-6">
        <Card tone="accent">
          <h2 className="text-lg font-extrabold leading-snug"><span aria-hidden="true">🌱</span> {INTRO}</h2>
          <p className="mt-1 text-[15px]">
            Chores and spending money are always on. Switching something off hides it for everyone — you can switch it back on any time.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={inUse('small') ? 'check' : undefined} disabled={busy} onClick={() => pick('small')}>
              Start small
            </Button>
            <Button variant="secondary" icon={inUse('all') ? 'check' : undefined} disabled={busy} onClick={() => pick('all')}>
              Everything
            </Button>
          </div>
          <LinkButton to="/help" variant="ghost" size="sm" icon="info" className="mt-2">How Sow & Grow works</LinkButton>
        </Card>

        {FEATURE_GROUPS.map((g) => (
          <Section key={g.key} title={<><span aria-hidden="true">{g.emoji}</span> {g.title}</>}>
            <Card className="divide-y divide-line !py-1">
              {g.items.map((i) => {
                const need = FEATURE_NEEDS[i.key];
                const blocked = !!need && !featureOn(d, need);
                return (
                  <Toggle
                    key={i.key}
                    className="py-2"
                    checked={!blocked && d[i.key]}
                    disabled={blocked || busy}
                    onChange={(v) => set(i.key, v)}
                    label={<FeatureLabel info={i} needs={blocked && need ? FEATURE_INFO[need].label : undefined} />}
                    description={i.key === 'ask' ? `${i.line} ${askNote}` : i.line}
                  />
                );
              })}
            </Card>
          </Section>
        ))}
      </div>

      {dirty && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+9rem)] z-20 mt-4">
          <Card className="flex items-center gap-2 shadow-lg" role="region" aria-label="Unsaved changes">
            <span className="min-w-0 flex-1 text-[15px] font-semibold">You have unsaved changes</span>
            <Button variant="ghost" onClick={() => setD(saved)} disabled={busy}>Undo</Button>
            <Button loading={busy} onClick={() => void save(d, 'Saved ✅')}>Save</Button>
          </Card>
        </div>
      )}

      {preset && (
        <PresetSheet
          preset={preset}
          changes={featureChanges(saved, presetSwitches(preset))}
          dirty={dirty}
          busy={busy}
          onClose={() => setPreset(null)}
          onConfirm={async () => {
            if (await save(presetSwitches(preset), `“${PRESET_NAME[preset]}” is on ✅`)) setPreset(null);
          }}
        />
      )}
    </>
  );
}

function FeatureLabel({ info, needs }: { info: FeatureInfo; needs?: string }) {
  return (
    <>
      <span aria-hidden="true">{info.emoji}</span> {info.label}
      {needs && <Badge tone="warn" className="ml-2 align-middle">Needs {needs}</Badge>}
    </>
  );
}

function PresetSheet({ preset, changes, dirty, busy, onClose, onConfirm }: {
  preset: Preset; changes: { on: FeatureKey[]; off: FeatureKey[] }; dirty: boolean; busy: boolean;
  onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={preset === 'small' ? 'Start small?' : 'Switch everything on?'}
      description="This is what changes for the whole family:"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={onConfirm}>Use “{PRESET_NAME[preset]}”</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <ChangeList title="Switched on" tone="good" mark="✓ On" keys={changes.on} />
        <ChangeList title="Switched off" tone="neutral" mark="Off" keys={changes.off} />
        {preset === 'all' && (
          <p className="text-[14px] text-muted">
            <span aria-hidden="true">💬</span> Ask Pocket stays as it is — it needs the AI key, so you switch it on yourself.
          </p>
        )}
        {dirty && <p className="text-[14px] font-semibold text-warn">Your unsaved changes on this page will be replaced.</p>}
      </div>
    </Sheet>
  );
}

function ChangeList({ title, tone, mark, keys }: { title: string; tone: BadgeTone; mark: string; keys: FeatureKey[] }) {
  if (keys.length === 0) return null;
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="mt-1 divide-y divide-line">
        {keys.map((k) => (
          <li key={k} className="flex min-h-11 items-center gap-3 py-1.5">
            <span className="w-7 shrink-0 text-center text-xl" aria-hidden="true">{FEATURE_INFO[k].emoji}</span>
            <span className="min-w-0 flex-1 font-semibold">{FEATURE_INFO[k].label}</span>
            <Badge tone={tone}>{mark}</Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Kids, grandparents: see what's on, can't change it. */
function ReadOnly({ family }: { family: Family }) {
  const raw = family.settings?.features;
  return (
    <>
      <PageHeader title="Features" subtitle={`${countOn(raw)} of ${FEATURE_TOTAL} on`} back="/family" />
      <div className="space-y-6">
        <Card tone="accent">
          <p className="font-semibold">
            <span aria-hidden="true">🌱</span> These are the parts of Sow & Grow your family uses. A parent can switch more on once everyone gets the idea.
          </p>
          <LinkButton to="/help" variant="ghost" size="sm" icon="info" className="mt-2">How Sow & Grow works</LinkButton>
        </Card>
        {FEATURE_GROUPS.map((g) => (
          <Section key={g.key} title={<><span aria-hidden="true">{g.emoji}</span> {g.title}</>}>
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-line">
                {g.items.map((i) => {
                  const on = featureOn(raw ?? {}, i.key);
                  return (
                    <li key={i.key} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                      <span className="w-7 shrink-0 text-center text-xl" aria-hidden="true">{i.emoji}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{i.label}</span>
                        <span className="block text-[14px] leading-snug text-muted">{i.line}</span>
                      </span>
                      {on ? <Badge tone="good">✓ On</Badge> : <Badge tone="neutral">Off</Badge>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Section>
        ))}
      </div>
    </>
  );
}
