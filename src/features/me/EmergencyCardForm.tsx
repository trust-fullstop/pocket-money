import { useMemo, useState, type FormEvent } from 'react';
import { Button, Card, Icon, IconButton, Input, Section, Select, Textarea, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { friendlyError } from '../../lib/errors';
import { KID_MAX_AGE, ageFrom, life360Href, roleLabel } from '../../lib/format';
import type { EmergencyContact, Member, Profile } from '../../lib/types';

const BLOOD_TYPES = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map((v) => ({ value: v.replace('−', '-'), label: v }));

interface Draft {
  birthday: string; phone: string; height_cm: string; blood_type: string; allergies: string; medication: string;
  medical_notes: string; doctor: string; school: string; life360: string; revolut_note: string;
  emergency_contacts: EmergencyContact[];
}

function toDraft(p: Profile | null | undefined): Draft {
  return {
    birthday: p?.birthday ?? '', phone: p?.phone ?? '', height_cm: p?.height_cm ? String(p.height_cm) : '',
    blood_type: p?.blood_type ?? '', allergies: p?.allergies ?? '', medication: p?.medication ?? '',
    medical_notes: p?.medical_notes ?? '', doctor: p?.doctor ?? '', school: p?.school ?? '',
    life360: p?.life360 ?? '', revolut_note: p?.revolut_note ?? '',
    emergency_contacts: (p?.emergency_contacts ?? []).map((c) => ({ name: c.name ?? '', phone: c.phone ?? '', relation: c.relation ?? '' })),
  };
}

function toProfile(d: Draft, base: Profile | null | undefined): Profile {
  const out: Record<string, unknown> = { ...(base ?? {}) };
  const text = (k: keyof Draft) => {
    const v = (d[k] as string).trim();
    if (v) out[k] = v; else delete out[k];
  };
  (['birthday', 'phone', 'blood_type', 'allergies', 'medication', 'medical_notes', 'doctor', 'school', 'life360', 'revolut_note'] as const).forEach(text);
  const h = parseInt(d.height_cm, 10);
  if (Number.isFinite(h) && h > 0) out.height_cm = h; else delete out.height_cm;
  const contacts = d.emergency_contacts
    .map((c) => ({ name: c.name.trim(), phone: (c.phone ?? '').trim(), relation: (c.relation ?? '').trim() }))
    .filter((c) => c.name || c.phone)
    .map((c) => ({ name: c.name, ...(c.phone ? { phone: c.phone } : {}), ...(c.relation ? { relation: c.relation } : {}) }));
  if (contacts.length) out.emergency_contacts = contacts; else delete out.emergency_contacts;
  return out as Profile;
}

export interface EmergencyCardFormProps {
  /** Whose card (needs edit rights: yourself, or a kid/any member if you're a manager). */
  member: Pick<Member, 'id' | 'display_name' | 'profile'> & Partial<Pick<Member, 'role' | 'relation'>>;
  /** Called after a successful save (e.g. to refresh state / navigate). */
  onSaved?: () => void | Promise<void>;
  /** Text on the save button. */
  saveLabel?: string;
}

/** Edit form for a member's emergency card (Profile). Saves via api.updateMember(id, { profile }). */
export function EmergencyCardForm({ member, onSaved, saveLabel = 'Save emergency card' }: EmergencyCardFormProps) {
  const toast = useToast();
  const initial = useMemo(() => toDraft(member.profile), [member.profile]);
  const [d, setD] = useState<Draft>(initial);
  const initialRelation = member.relation ?? '';
  const [relation, setRelation] = useState(initialRelation);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial) || relation.trim() !== initialRelation.trim();

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setContact = (i: number, patch: Partial<EmergencyContact>) =>
    setD((x) => ({ ...x, emergency_contacts: x.emergency_contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const heightError = d.height_cm && !/^\d{2,3}$/.test(d.height_cm.trim()) ? 'Height in whole centimetres, e.g. 142' : undefined;
  const age = ageFrom(d.birthday);
  const birthdayError = d.birthday && age === null ? 'Please pick a date.'
    : age !== null && age < 0 ? 'That date is in the future.'
    : member.role === 'kid' && age !== null && age > KID_MAX_AGE ? `Kids can be 0 to ${KID_MAX_AGE} years old.`
    : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (heightError || birthdayError) return;
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { profile: toProfile(d, member.profile) };
      if (member.role !== undefined && relation.trim() !== initialRelation.trim()) patch.relation = relation.trim().slice(0, 30);
      await api.updateMember(member.id, patch);
      toast.show('Emergency card saved', 'success');
      await onSaved?.();
    } catch (err) {
      toast.show(friendlyError(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <Section title="Basics">
        <Card className="space-y-4">
          {member.role !== undefined && (
            <Input
              label="What the family calls them" value={relation} maxLength={30}
              onChange={(e) => setRelation(e.target.value)} optional
              placeholder={roleLabel(member.role)}
              hint={`E.g. Bonus dad, Oma, Godmother. Empty = “${roleLabel(member.role)}”.`}
            />
          )}
          <Input
            label="Birthday" type="date" value={d.birthday} onChange={(e) => set('birthday', e.target.value)} optional
            max={new Date().toISOString().slice(0, 10)} error={birthdayError}
          />
          <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" value={d.phone} onChange={(e) => set('phone', e.target.value)} optional placeholder="+27 82 123 4567" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Height" inputMode="numeric" suffix="cm" value={d.height_cm} onChange={(e) => set('height_cm', e.target.value.replace(/[^\d]/g, '').slice(0, 3))} error={heightError} optional />
            <Select label="Blood type" value={d.blood_type} onChange={(e) => set('blood_type', e.target.value)} options={BLOOD_TYPES} placeholder="Don’t know" optional />
          </div>
          <Input label="School" value={d.school} onChange={(e) => set('school', e.target.value)} optional />
        </Card>
      </Section>

      <Section title="Health">
        <Card className="space-y-4">
          <Textarea label="Allergies" value={d.allergies} onChange={(e) => set('allergies', e.target.value)} optional placeholder="e.g. peanuts, penicillin" rows={2} />
          <Textarea label="Medication" value={d.medication} onChange={(e) => set('medication', e.target.value)} optional rows={2} />
          <Textarea label="Medical notes" value={d.medical_notes} onChange={(e) => set('medical_notes', e.target.value)} optional rows={3} />
          <Input label="Doctor" value={d.doctor} onChange={(e) => set('doctor', e.target.value)} optional placeholder="Name and phone number" />
        </Card>
      </Section>

      <Section
        title="Emergency contacts"
        action={
          <Button
            variant="ghost" size="sm" icon="plus"
            onClick={() => set('emergency_contacts', [...d.emergency_contacts, { name: '', phone: '', relation: '' }])}
          >Add</Button>
        }
      >
        {d.emergency_contacts.length === 0 ? (
          <Card className="text-muted">
            No contacts yet.{' '}
            <button type="button" className="font-semibold text-accent-ink underline underline-offset-2" onClick={() => set('emergency_contacts', [{ name: '', phone: '', relation: '' }])}>
              Add someone to call
            </button>
          </Card>
        ) : (
          <div className="space-y-3">
            {d.emergency_contacts.map((c, i) => (
              <Card key={i} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Contact {i + 1}</h4>
                  <div className="flex items-center">
                    {c.phone?.trim() && (
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="inline-grid size-11 place-items-center rounded-xl text-accent-ink hover:bg-accent-soft" aria-label={`Call ${c.name || 'contact'}`}>
                        <Icon name="phone" size={20} />
                      </a>
                    )}
                    <IconButton
                      icon="trash" label={`Remove contact ${i + 1}`} className="text-bad"
                      onClick={() => set('emergency_contacts', d.emergency_contacts.filter((_, j) => j !== i))}
                    />
                  </div>
                </div>
                <Input label="Name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Phone" type="tel" inputMode="tel" value={c.phone ?? ''} onChange={(e) => setContact(i, { phone: e.target.value })} />
                  <Input label="Relation" value={c.relation ?? ''} onChange={(e) => setContact(i, { relation: e.target.value })} placeholder="e.g. Aunt" optional />
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Section title="Location & money">
        <Card className="space-y-4">
          <div>
            <Input
              label="Life360" value={d.life360} onChange={(e) => set('life360', e.target.value)} optional
              placeholder="Circle invite link or name" hint="We don’t track location — Life360 does that."
            />
            <a
              href={life360Href(d.life360)} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-semibold text-accent-ink hover:bg-accent-soft"
            >
              <Icon name="external" size={18} />Open Life360
            </a>
          </div>
          <Textarea
            label="Revolut" value={d.revolut_note} onChange={(e) => set('revolut_note', e.target.value)} optional rows={2}
            placeholder="e.g. Revolut <18 account @sam" hint="Just a note for now — no bank connection."
          />
        </Card>
      </Section>

      <div className="sticky z-10 -mx-1 rounded-2xl bg-bg/90 px-1 py-2 backdrop-blur" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
        <Button type="submit" block size="lg" loading={busy} disabled={!dirty || !!heightError} icon="check">
          {dirty ? saveLabel : 'Saved'}
        </Button>
      </div>
    </form>
  );
}
