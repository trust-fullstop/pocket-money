import { useMemo, useState, type FormEvent } from 'react';
import {
  Avatar, Button, Card, Chip, EmptyState, Icon, Input, ListRow, MemberPicker, PageHeader, Section, Select, Sheet, Textarea,
  buttonClass, useConfirm, useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError, toAppError } from '../../lib/errors';
import { useApp, useLoad } from '../../lib/session';
import type { Device, DeviceInput, DeviceType, Member } from '../../lib/types';

const TYPE_META: Record<DeviceType, { label: string; emoji: string }> = {
  phone: { label: 'Phone', emoji: '📱' },
  tablet: { label: 'Tablet', emoji: '📲' },
  console: { label: 'Game console', emoji: '🎮' },
  pc: { label: 'Computer', emoji: '🖥️' },
  tv: { label: 'TV', emoji: '📺' },
  watch: { label: 'Watch', emoji: '⌚' },
  other: { label: 'Other', emoji: '🔌' },
};
const TYPES = Object.keys(TYPE_META) as DeviceType[];

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$|^[0-9a-f]{12}$|^([0-9a-f]{4}\.){2}[0-9a-f]{4}$/i;
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i;

/** /family/devices — the family device registry. Managers add/edit; others see their own. */
export default function Devices() {
  const { me, isManager, members, membersById, state } = useApp();
  const list = useLoad(() => api.listDevices(), [state?.now]);
  const [editing, setEditing] = useState<Device | 'new' | null>(null);

  const groups = useMemo(() => {
    const devices = list.data ?? [];
    const byOwner = new Map<string | null, Device[]>();
    for (const d of devices) {
      const key = d.owner_id && membersById[d.owner_id] ? d.owner_id : null;
      byOwner.set(key, [...(byOwner.get(key) ?? []), d]);
    }
    const out: { key: string; title: string; member?: Member; items: Device[] }[] = [];
    for (const m of members) {
      const items = byOwner.get(m.id);
      if (items?.length) out.push({ key: m.id, title: m.id === me?.id ? `${m.display_name} (you)` : m.display_name, member: m, items });
    }
    const shared = byOwner.get(null);
    if (shared?.length) out.push({ key: 'shared', title: 'Shared / everyone', items: shared });
    return out;
  }, [list.data, members, membersById, me?.id]);

  if (!me) return null;
  const empty = list.data && list.data.length === 0;

  return (
    <>
      <PageHeader
        title={isManager ? 'Devices' : 'My devices'}
        subtitle={isManager ? 'Phones, tablets and consoles at home' : undefined}
        back="/family"
        right={isManager ? <Button size="sm" icon="plus" onClick={() => setEditing('new')}>Add</Button> : undefined}
      />

      <Card className="flex gap-3 bg-surface-2">
        <span className="text-2xl" aria-hidden="true">ℹ️</span>
        <p className="text-[15px]">
          Scanning the Wi-Fi from a web page isn’t possible. Coming later: a small home helper on your PC that finds devices on your network.
        </p>
      </Card>

      {list.error && !list.data ? (
        <Card className="mt-4 text-center">
          <p className="font-semibold">We couldn’t load the devices.</p>
          <p className="mt-1 text-muted">{list.error}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void list.reload()}>Try again</Button>
        </Card>
      ) : !list.data ? (
        <div className="mt-6 space-y-2" aria-busy="true" aria-label="Loading devices">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 w-full motion-safe:animate-pulse rounded-2xl bg-surface-2" />)}
        </div>
      ) : empty ? (
        <EmptyState
          className="mt-4"
          emoji="📱"
          title={isManager ? 'No devices yet' : 'No devices listed for you'}
          message={isManager
            ? 'Add phones, tablets and consoles so you can find them fast.'
            : 'Ask a parent to add your phone or tablet.'}
          action={isManager ? <Button icon="plus" onClick={() => setEditing('new')}>Add a device</Button> : undefined}
        />
      ) : (
        groups.map((g) => (
          <Section
            key={g.key}
            title={
              <span className="flex items-center gap-2">
                {g.member ? <Avatar member={g.member} size="xs" name="" /> : <span aria-hidden="true">🏠</span>}
                {g.title}
              </span>
            }
            className="mt-6"
          >
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-line">
                {g.items.map((d) => (
                  <DeviceRow key={d.id} d={d} onEdit={isManager ? () => setEditing(d) : undefined} />
                ))}
              </ul>
            </Card>
          </Section>
        ))
      )}

      {editing && (
        <DeviceSheet
          device={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void list.reload()}
        />
      )}
    </>
  );
}

function DeviceRow({ d, onEdit }: { d: Device; onEdit?: () => void }) {
  const meta = TYPE_META[d.type] ?? TYPE_META.other;
  const net = [d.mac, d.ip].filter(Boolean).join(' · ');
  return (
    <li className="flex items-center">
      <ListRow
        className="min-w-0 flex-1"
        onClick={onEdit}
        chevron={!!onEdit}
        left={
          <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-2xl" aria-hidden="true">{meta.emoji}</span>
        }
        title={<>{d.name}<span className="sr-only">, {meta.label}</span></>}
        subtitle={
          <>
            {(d.model || d.phone_number) && (
              <span className="block">{[d.model, d.phone_number].filter(Boolean).join(' · ')}</span>
            )}
            {net && <span className="block font-mono text-[12px]">{net}</span>}
            {d.notes && <span className="block truncate">{d.notes}</span>}
          </>
        }
      />
      {d.phone_number && (
        <a
          href={telHref(d.phone_number)}
          className={buttonClass('secondary', 'sm') + ' mr-3 shrink-0'}
          aria-label={`Call ${d.name} (${d.phone_number})`}
        >
          <Icon name="phone" size={18} />
        </a>
      )}
    </li>
  );
}

interface Draft {
  name: string; type: DeviceType; owner: string | null; model: string; phone: string; mac: string; ip: string; notes: string;
}

function DeviceSheet({ device, onClose, onSaved }: { device: Device | null; onClose: () => void; onSaved: () => void }) {
  const { members } = useApp();
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Draft>(() => ({
    name: device?.name ?? '',
    type: device?.type ?? 'phone',
    owner: device?.owner_id ?? null,
    model: device?.model ?? '',
    phone: device?.phone_number ?? '',
    mac: device?.mac ?? '',
    ip: device?.ip ?? '',
    notes: device?.notes ?? '',
  }));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [serverError, setServerError] = useState<{ field?: string; text: string } | null>(null);
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setServerError(null); };

  const nameError = !d.name.trim() ? 'Give it a name, e.g. “Sam’s iPad”.' : undefined;
  const macError = d.mac.trim() && !MAC_RE.test(d.mac.trim()) ? 'That doesn’t look like a MAC address (e.g. 3C:22:FB:12:34:56).' : undefined;
  const ipError = d.ip.trim() && !IP_RE.test(d.ip.trim()) ? 'That doesn’t look like an IP address (e.g. 192.168.1.23).' : undefined;
  const fieldErr = (f: string) => (serverError?.field === f ? serverError.text : undefined);

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    if (nameError || macError || ipError) return;
    const input: DeviceInput = {
      id: device?.id ?? null,
      owner_id: d.owner,
      name: d.name.trim(),
      type: d.type,
      model: d.model.trim() || null,
      phone_number: d.phone.trim() || null,
      mac: d.mac.trim() || null,
      ip: d.ip.trim() || null,
      notes: d.notes.trim() || null,
    };
    setBusy(true);
    try {
      await api.upsertDevice(input);
      toast.show(device ? 'Saved ✅' : 'Device added 📱', 'success');
      onSaved();
      onClose();
    } catch (err) {
      const ae = toAppError(err);
      if (ae.code === 'invalid' && ae.detail === 'too_many_devices') setServerError({ text: 'That’s the maximum of 200 devices.' });
      else if (ae.code === 'invalid' && ae.detail) setServerError({ field: ae.detail, text: 'Please check this.' });
      else setServerError({ text: friendlyError(err) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!device) return;
    const ok = await confirm({
      title: `Delete “${device.name}”?`,
      message: 'It’s only removed from this list.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.deleteDevice(device.id);
      toast.show('Deleted', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast.show(friendlyError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={device ? `Edit ${device.name}` : 'Add a device'}
      footer={
        <div className="flex gap-2">
          {device && (
            <Button variant="ghost" size="lg" icon="trash" onClick={remove} disabled={busy} className="!text-bad">
              Delete
            </Button>
          )}
          <Button size="lg" block loading={busy} onClick={() => void save()}>Save</Button>
        </div>
      }
    >
      <form className="space-y-5 pt-1" onSubmit={save} noValidate>
        <Input
          label="Name"
          value={d.name}
          maxLength={60}
          placeholder="Sam’s iPad"
          onChange={(e) => set({ name: e.target.value })}
          error={(tried && nameError) || fieldErr('name')}
          autoFocus={!device}
        />
        <Select
          label="Type"
          value={d.type}
          onChange={(e) => set({ type: e.target.value as DeviceType })}
          options={TYPES.map((t) => ({ value: t, label: `${TYPE_META[t].emoji} ${TYPE_META[t].label}` }))}
          error={fieldErr('type')}
        />
        <fieldset className="space-y-1">
          <legend className="mb-1.5 text-[15px] font-semibold">Whose is it?</legend>
          <Chip selected={d.owner === null} emoji="🏠" onClick={() => set({ owner: null })}>Nobody / shared</Chip>
          <MemberPicker label="Owner" members={members} value={d.owner} onChange={(id) => set({ owner: id })} />
        </fieldset>
        <Input
          label="Model"
          optional
          value={d.model}
          maxLength={60}
          placeholder="iPad 9th gen"
          onChange={(e) => set({ model: e.target.value })}
          error={fieldErr('model')}
        />
        <Input
          label="Phone number"
          optional
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={d.phone}
          maxLength={30}
          onChange={(e) => set({ phone: e.target.value })}
          hint="For a phone or watch with its own number."
          error={fieldErr('phone_number')}
        />
        <fieldset className="space-y-3 rounded-2xl border border-line p-3">
          <legend className="px-1 text-[15px] font-semibold">Network <span className="font-normal text-muted">(optional)</span></legend>
          <p className="text-[13px] text-muted">Handy for setting up screen-time rules on your router. Find these in the device’s Wi-Fi settings.</p>
          <Input
            label="MAC address"
            value={d.mac}
            maxLength={30}
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono"
            placeholder="3C:22:FB:12:34:56"
            onChange={(e) => set({ mac: e.target.value })}
            error={(tried && macError) || fieldErr('mac')}
          />
          <Input
            label="IP address"
            value={d.ip}
            maxLength={45}
            inputMode="decimal"
            spellCheck={false}
            className="font-mono"
            placeholder="192.168.1.23"
            onChange={(e) => set({ ip: e.target.value })}
            error={(tried && ipError) || fieldErr('ip')}
          />
        </fieldset>
        <Textarea
          label="Notes"
          optional
          rows={3}
          value={d.notes}
          maxLength={300}
          onChange={(e) => set({ notes: e.target.value })}
          error={fieldErr('notes')}
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
