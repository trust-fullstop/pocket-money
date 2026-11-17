import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AmountInput, Button, Card, EmptyState, Icon, Input, LinkButton, ListRow, PageHeader, Segmented, Select, Sheet, Spinner, Toggle,
  useToast,
} from '../../components/ui';
import { api } from '../../lib/api';
import { backend } from '../../lib/backend';
import { friendlyError, toAppError } from '../../lib/errors';
import { useFeatures } from '../../lib/features';
import { minutes as minutesText, money, timeAgo } from '../../lib/format';
import { currencyWord, spendCurrencyOf } from '../../lib/fx';
import { useApp, useLoad } from '../../lib/session';
import { familySpotRules, type Evidence, type Family, type FamilySettings, type SpotAmount, type SpotRules } from '../../lib/types';
import { describeAudit, type AuditEntry } from './audit';

const CURRENCIES: { code: string; label: string }[] = [
  { code: 'EUR', label: '€ Euro (EUR)' },
  { code: 'ZAR', label: 'R South African rand (ZAR)' },
  { code: 'USD', label: '$ US dollar (USD)' },
  { code: 'GBP', label: '£ British pound (GBP)' },
];
const GRACE_OPTIONS = [0, 5, 10, 15, 30, 60];

function timeZones(current: string): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  let zones: string[] = [];
  try { zones = intl.supportedValuesOf?.('timeZone') ?? []; } catch { zones = []; }
  return [...new Set([...zones, current, 'UTC'])].sort();
}

interface Draft {
  name: string; currency: string; timezone: string; spendCurrency: string;
  interest: string; saverBonus: string; noSavingsPenalty: string;
  lateGrace: string; challengeCap: string; catchup: string;
  gpMoney: boolean; managersAddAdults: boolean; emergency: FamilySettings['emergency_visibility']; evidence: Evidence;
  spotRules: SpotRules;
}
type FieldKey = keyof FamilySettings | 'name' | 'currency' | 'timezone';

const draftFrom = (f: Family): Draft => ({
  name: f.name,
  currency: f.currency,
  timezone: f.timezone,
  spendCurrency: spendCurrencyOf(f) ?? '',
  interest: String(f.settings.interest_pct_month ?? 0),
  saverBonus: String(f.settings.saver_bonus_points ?? 0),
  noSavingsPenalty: String(f.settings.no_savings_penalty_points ?? 0),
  lateGrace: String(f.settings.late_grace_minutes ?? 0),
  challengeCap: String(f.settings.challenge_points_cap ?? 0),
  catchup: String(f.settings.catchup_days ?? 0),
  gpMoney: !!f.settings.grandparents_see_money,
  managersAddAdults: !!f.settings.managers_add_adults,
  emergency: f.settings.emergency_visibility ?? 'family',
  evidence: f.settings.default_evidence ?? 'photo_or_note',
  spotRules: spotRulesOf(f),
});

/** Parses a number field; returns [value, error]. */
function parseNum(text: string, min: number, max: number, opts: { int?: boolean } = {}): [number, string | undefined] {
  const t = text.trim().replace(',', '.');
  const n = Number(t);
  if (t === '' || !Number.isFinite(n)) return [0, 'Please enter a number.'];
  if (opts.int && !Number.isInteger(n)) return [n, 'Whole numbers only.'];
  if (n < min || n > max) return [n, `Between ${min} and ${max}.`];
  return [opts.int ? n : Math.round(n * 100) / 100, undefined];
}

export default function Settings() {
  const { family, me, isManager, refresh, signOut } = useApp();
  if (!family || !me) return null;
  if (!isManager) {
    return (
      <>
        <PageHeader title="Family rules" back="/family" />
        <EmptyState
          emoji="🔒"
          title="Only parents can change the family rules."
          action={<LinkButton to="/family" variant="secondary">Back to family</LinkButton>}
        />
      </>
    );
  }
  return <SettingsForm key={family.id} family={family} isOwner={me.role === 'owner'} refresh={refresh} signOut={signOut} />;
}

function SettingsForm({ family, isOwner, refresh, signOut }: {
  family: Family; isOwner: boolean; refresh: () => Promise<unknown>; signOut: () => Promise<void>;
}) {
  const toast = useToast();
  const features = useFeatures();
  const base = useMemo(() => draftFrom(family), [family]);
  const [d, setD] = useState<Draft>(base);
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<Partial<Record<FieldKey, string>>>({});
  const [sheet, setSheet] = useState<'audit' | 'delete' | null>(null);
  const zones = useMemo(() => timeZones(family.timezone), [family.timezone]);
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setServerErr({}); };

  const [interest, interestErr] = parseNum(d.interest, 0, 20);
  const [saverBonus, saverErr] = parseNum(d.saverBonus, 0, 1000, { int: true });
  const [penalty, penaltyErr] = parseNum(d.noSavingsPenalty, 0, 1000, { int: true });
  const [cap, capErr] = parseNum(d.challengeCap, 0, 1000, { int: true });
  const [catchup, catchupErr] = parseNum(d.catchup, 0, 31, { int: true });
  const nameErr = !d.name.trim() ? 'The family needs a name.' : undefined;
  const hasErrors = !!(interestErr || saverErr || penaltyErr || capErr || catchupErr || nameErr);

  const patch = useMemo(() => {
    const p: Parameters<typeof api.updateFamily>[0] = {};
    if (d.name.trim() !== family.name) p.name = d.name.trim();
    if (d.currency !== family.currency) p.currency = d.currency;
    if (d.timezone !== family.timezone) p.timezone = d.timezone;
    const s: Partial<FamilySettings> = {};
    const fs = family.settings;
    if (interest !== fs.interest_pct_month && !interestErr) s.interest_pct_month = interest;
    if (saverBonus !== fs.saver_bonus_points && !saverErr) s.saver_bonus_points = saverBonus;
    if (penalty !== fs.no_savings_penalty_points && !penaltyErr) s.no_savings_penalty_points = penalty;
    if (Number(d.lateGrace) !== fs.late_grace_minutes) s.late_grace_minutes = Number(d.lateGrace);
    if (cap !== fs.challenge_points_cap && !capErr) s.challenge_points_cap = cap;
    if (catchup !== fs.catchup_days && !catchupErr) s.catchup_days = catchup;
    if (d.gpMoney !== !!fs.grandparents_see_money) s.grandparents_see_money = d.gpMoney;
    if (d.managersAddAdults !== !!fs.managers_add_adults) s.managers_add_adults = d.managersAddAdults;
    if (d.emergency !== fs.emergency_visibility) s.emergency_visibility = d.emergency;
    if (d.evidence !== fs.default_evidence) s.default_evidence = d.evidence;
    if (JSON.stringify(d.spotRules) !== JSON.stringify(spotRulesOf(family))) s.spot_rules = d.spotRules;
    // "Same as the family currency" (or the same code) = off
    const spend = d.spendCurrency && d.spendCurrency !== d.currency ? d.spendCurrency : null;
    if (spend !== (spendCurrencyOf(family) ?? null) || (spend === null && fs.spend_currency)) s.spend_currency = spend;
    if (Object.keys(s).length) p.settings = s;
    return p;
  }, [d, family, interest, saverBonus, penalty, cap, catchup, interestErr, saverErr, penaltyErr, capErr, catchupErr]);

  const dirty = JSON.stringify(d) !== JSON.stringify(base);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    if (hasErrors) return;
    if (Object.keys(patch).length === 0) { setD(base); return; }
    setBusy(true);
    try {
      await api.updateFamily(patch);
      await refresh();
      toast.show('Saved ✅', 'success');
    } catch (err) {
      const ae = toAppError(err);
      if (ae.code === 'invalid' && ae.detail) {
        const key = (ae.detail.startsWith('setting:') ? ae.detail.slice(8) : ae.detail) as FieldKey;
        setServerErr({ [key]: `Please check this (${key.replace(/_/g, ' ')}).` });
        toast.show('Please check the highlighted field.', 'error');
      } else {
        toast.show(friendlyError(err), 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const example = money(1000, d.currency);
  const exampleGain = money(Math.round(1000 * (interestErr ? 0 : interest) / 100), d.currency);
  // Rules for parts of the app that are switched off (Family → Features) are hidden.
  const showInterest = features.on('interest');
  const showSaverRules = features.on('saver_rules');
  const showChallengeCap = features.on('challenges');
  const showEmergency = features.on('emergency');
  const showSpotted = features.on('spotted');
  const setRule = (dir: keyof SpotRules, patch: Partial<SpotAmount>) =>
    set({ spotRules: { ...d.spotRules, [dir]: { ...d.spotRules[dir], ...patch } } });
  const someHidden = !(showInterest && showSaverRules && showChallengeCap && showEmergency);

  return (
    <>
      <PageHeader title="Family rules" subtitle={family.name} back="/family" />

      <div className="space-y-4">
        {someHidden && (
          <Card padded={false} className="overflow-hidden">
            <ListRow
              to="/family/features"
              left={<span className="grid size-10 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">🌱</span>}
              title="Some rules are hidden"
              subtitle="They belong to parts of the app that are switched off. Change that in Features."
            />
          </Card>
        )}

        <SettingsCard title="Family" emoji="🏠">
          <Input
            label="Family name"
            value={d.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value })}
            error={nameErr ?? serverErr.name}
          />
          <Select
            label="Currency"
            value={d.currency}
            onChange={(e) => set({ currency: e.target.value, ...(e.target.value === d.spendCurrency ? { spendCurrency: '' } : {}) })}
            options={[
              ...CURRENCIES.map((c) => ({ value: c.code, label: c.label })),
              ...(CURRENCIES.some((c) => c.code === family.currency) ? [] : [{ value: family.currency, label: family.currency }]),
            ]}
            hint={d.currency !== family.currency ? 'Existing amounts keep their numbers — only the symbol changes.' : undefined}
            error={serverErr.currency}
          />
          <Select
            label="Also show money in"
            value={d.spendCurrency && d.spendCurrency !== d.currency ? d.spendCurrency : ''}
            onChange={(e) => set({ spendCurrency: e.target.value })}
            options={[
              { value: '', label: 'Nothing else' },
              ...CURRENCIES.filter((c) => c.code !== d.currency).map((c) => ({ value: c.code, label: c.label })),
              ...(d.spendCurrency && d.spendCurrency !== d.currency && !CURRENCIES.some((c) => c.code === d.spendCurrency)
                ? [{ value: d.spendCurrency, label: d.spendCurrency }] : []),
            ]}
            hint={d.spendCurrency && d.spendCurrency !== d.currency
              ? `Money amounts also show what they’re worth in ${currencyWord(d.spendCurrency)} at today’s rate. The app keeps counting in ${currencyWord(d.currency)}.`
              : 'Pick a second currency, e.g. when you pay in euro and the kids buy things in rand. The app then shows today’s exchange rate.'}
            error={serverErr.spend_currency}
          />
          <Select
            label="Time zone"
            value={d.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
            hint="Task deadlines, the weekly pay-out and the calendar use this."
            error={serverErr.timezone}
          />
        </SettingsCard>

        {(showInterest || showSaverRules) && (
          <SettingsCard title="Money" emoji="💶">
            {showInterest && (
              <Input
                label="Savings interest per month (%)"
                type="number"
                inputMode="decimal"
                min={0}
                max={20}
                step={0.1}
                value={d.interest}
                onChange={(e) => set({ interest: e.target.value })}
                hint={`Savings grow by this much each month. Paid every week. ${example} saved at ${interestErr ? 0 : interest}% grows ${exampleGain} a month.`}
                error={interestErr ?? serverErr.interest_pct_month}
              />
            )}
            {showSaverRules && (
              <>
                <Input
                  label="Saver bonus (points)"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000}
                  step={1}
                  value={d.saverBonus}
                  onChange={(e) => set({ saverBonus: e.target.value })}
                  hint="Bonus points when savings grew this week."
                  error={saverErr ?? serverErr.saver_bonus_points}
                />
                <Input
                  label="No-savings penalty (points)"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1000}
                  step={1}
                  value={d.noSavingsPenalty}
                  onChange={(e) => set({ noSavingsPenalty: e.target.value })}
                  hint="Points lost if money was earned but none saved and none left (0 = off)."
                  error={penaltyErr ?? serverErr.no_savings_penalty_points}
                />
              </>
            )}
          </SettingsCard>
        )}

        {showSpotted && (
          <SettingsCard title="Spotted" emoji="📸">
            <p className="text-[15px] text-muted">
              Spotted is a quick report: who, reward or consequence, and what happened. These amounts are filled in for you.
              You can still change the amount in Spotted when something is bigger.
            </p>
            <SpotRuleFields
              title="➕ A reward gives" value={d.spotRules.reward} onChange={(v) => setRule('reward', v)}
              time={features.on('time')} points={features.on('points')}
            />
            <SpotRuleFields
              title="➖ A consequence costs" value={d.spotRules.consequence} onChange={(v) => setRule('consequence', v)}
              time={features.on('time')} points={features.on('points')}
            />
            {serverErr.spot_rules && <p role="alert" className="text-[15px] font-semibold text-bad">{serverErr.spot_rules}</p>}
          </SettingsCard>
        )}

        <SettingsCard title="Tasks" emoji="✅">
          <Select
            label="Late grace time"
            value={d.lateGrace}
            onChange={(e) => set({ lateGrace: e.target.value })}
            options={[...new Set([...GRACE_OPTIONS, family.settings.late_grace_minutes ?? 0])]
              .sort((a, b) => a - b)
              .map((n) => ({ value: String(n), label: n === 0 ? 'None' : `${n} minutes` }))}
            hint="Extra time before a missed task costs anything."
            error={serverErr.late_grace_minutes}
          />
          {showChallengeCap && (
            <Input
              label="Challenge points cap"
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              step={1}
              value={d.challengeCap}
              onChange={(e) => set({ challengeCap: e.target.value })}
              hint="Most points a kid or grandparent can promise in a challenge."
              error={capErr ?? serverErr.challenge_points_cap}
            />
          )}
          <div>
            <Segmented<Evidence>
              label="Proof for new tasks"
              value={d.evidence}
              onChange={(v) => set({ evidence: v })}
              options={[
                { value: 'photo', label: '📷 Photo' },
                { value: 'photo_or_note', label: 'Photo or note' },
                { value: 'none', label: 'Nothing' },
              ]}
            />
            <p className="mt-1 text-sm text-muted">What kids need to show when they hand in a task (you can change it per task).</p>
          </div>
          <details className="rounded-xl border border-line p-3">
            <summary className="min-h-11 cursor-pointer content-center font-semibold">Advanced</summary>
            <div className="pt-2">
              <Input
                label="Catch-up days"
                type="number"
                inputMode="numeric"
                min={0}
                max={31}
                step={1}
                value={d.catchup}
                onChange={(e) => set({ catchup: e.target.value })}
                hint="If nobody opens the app for a while, tasks are still made for this many past days."
                error={catchupErr ?? serverErr.catchup_days}
              />
            </div>
          </details>
        </SettingsCard>

        <SettingsCard title="Privacy" emoji="🔒">
          {isOwner && (
            <Toggle
              checked={d.managersAddAdults}
              onChange={(v) => set({ managersAddAdults: v })}
              label="Other parents can add adults"
              description="Off: only you (the owner) can add parents, bonus parents and guardians. Kids and grandparents can always be added by any parent."
            />
          )}
          <Toggle
            checked={d.gpMoney}
            onChange={(v) => set({ gpMoney: v })}
            label="Grandparents can see the kids’ money"
          />
          {showEmergency && (
            <div>
              <Segmented<FamilySettings['emergency_visibility']>
                label="Who sees the emergency card"
                value={d.emergency}
                onChange={(v) => set({ emergency: v })}
                options={[
                  { value: 'family', label: 'Family' },
                  { value: 'adults', label: 'Adults only' },
                ]}
              />
              <p className="mt-1 text-sm text-muted">Who can see blood type, allergies and medication.</p>
            </div>
          )}
        </SettingsCard>

        <Card padded={false} className="overflow-hidden">
          <ListRow
            onClick={() => setSheet('audit')}
            left={<span className="grid size-10 place-items-center rounded-full bg-accent-soft text-xl" aria-hidden="true">📜</span>}
            title="Activity log"
            subtitle="Who changed what, and when"
          />
        </Card>

        {isOwner && (
          <Card className="!border-2 !border-bad/40">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-bad">
              <span aria-hidden="true">⚠️</span> Danger zone
            </h2>
            <p className="mt-1 text-[15px] text-muted">Deleting the family can’t be undone.</p>
            <Button variant="secondary" icon="trash" className="mt-3 !text-bad" onClick={() => setSheet('delete')}>
              Delete this family
            </Button>
          </Card>
        )}
      </div>

      {dirty && (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+9rem)] z-20 mt-4">
          <Card className="flex items-center gap-2 shadow-lg" role="region" aria-label="Unsaved changes">
            <span className="min-w-0 flex-1 text-[15px] font-semibold">You have unsaved changes</span>
            <Button variant="ghost" onClick={() => { setD(base); setServerErr({}); }} disabled={busy}>Undo</Button>
            <Button loading={busy} disabled={hasErrors} onClick={() => void save()}>Save changes</Button>
          </Card>
        </div>
      )}

      {sheet === 'audit' && <AuditSheet onClose={() => setSheet(null)} />}
      {sheet === 'delete' && <DeleteFamilySheet family={family} signOut={signOut} onClose={() => setSheet(null)} />}
    </>
  );
}

/** The family's Spotted amounts (spot_rules), with the defaults filled in when the family never set them. */
function spotRulesOf(f: Pick<Family, 'settings'>): SpotRules {
  return familySpotRules(f.settings);
}

/** Money (+ time and points when those parts are on) for one Spotted direction. */
function SpotRuleFields({ title, value, onChange, time, points }: {
  title: string; value: SpotAmount; onChange: (v: Partial<SpotAmount>) => void; time: boolean; points: boolean;
}) {
  return (
    <fieldset className="space-y-3 rounded-2xl border border-line/70 p-3">
      <legend className="px-1 text-[15px] font-bold">{title}</legend>
      <AmountInput kind="money" label="Money" value={value.cents || null} onChange={(v) => onChange({ cents: v ?? 0 })} max={100_000} chips={[]} />
      {time && <AmountInput kind="time" label="Time" value={value.minutes || null} onChange={(v) => onChange({ minutes: v ?? 0 })} max={1440} chips={[15, 30]} />}
      {points && <AmountInput kind="points" label="Points" value={value.points || null} onChange={(v) => onChange({ points: v ?? 0 })} max={10_000} chips={[5, 10, 20]} />}
      {((!time && value.minutes > 0) || (!points && value.points > 0)) && (
        <p className="flex items-center justify-between gap-2 text-[14px] text-muted">
          <span>
            Also {[!time && value.minutes > 0 && minutesText(value.minutes), !points && value.points > 0 && `${value.points} points`].filter(Boolean).join(' and ')}
            {' '}once {!time && value.minutes > 0 && !points && value.points > 0 ? 'Time and Points are' : !time && value.minutes > 0 ? 'Time is' : 'Points are'} switched on.
          </span>
          <button
            type="button" className="min-h-11 shrink-0 font-semibold text-accent-ink underline underline-offset-2"
            onClick={() => onChange({ ...(!time ? { minutes: 0 } : {}), ...(!points ? { points: 0 } : {}) })}
          >
            Remove
          </button>
        </p>
      )}
    </fieldset>
  );
}

function SettingsCard({ title, emoji, children }: { title: string; emoji: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
        <span aria-hidden="true">{emoji}</span> {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function AuditSheet({ onClose }: { onClose: () => void }) {
  const { membersById, family, now } = useApp();
  const [limit, setLimit] = useState(50);
  const log = useLoad(() => api.listAudit(limit) as Promise<AuditEntry[]>, [limit]);
  const currency = family?.currency ?? 'EUR';
  const rows = log.data ?? [];

  return (
    <Sheet open onClose={onClose} title="Activity log" description="Who changed what, newest first.">
      {log.error && !log.data ? (
        <div className="py-6 text-center">
          <p className="font-semibold">We couldn’t load the log.</p>
          <p className="mt-1 text-muted">{log.error}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void log.reload()}>Try again</Button>
        </div>
      ) : !log.data ? (
        <div className="grid place-items-center py-10"><Spinner label="Loading the activity log" /></div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-muted">Nothing has happened yet.</p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {rows.map((e) => {
              const t = describeAudit(e, membersById, currency);
              const actor = e.actor ? membersById[e.actor]?.display_name ?? 'Someone who left' : 'Automatic';
              return (
                <li key={e.id} className="flex gap-3 py-3">
                  <span className="mt-0.5 w-7 shrink-0 text-center text-xl" aria-hidden="true">{t.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px]">
                      <span className="font-bold">{actor}</span>{' '}
                      {t.known ? t.text : <span className="font-mono text-[13px] text-muted">{t.text}</span>}
                    </div>
                    <div className="text-[13px] text-muted">
                      <time dateTime={e.created_at} title={new Date(e.created_at).toLocaleString()}>{timeAgo(e.created_at, now())}</time>
                    </div>
                    {!t.known && Object.keys(e.details ?? {}).length > 0 && (
                      <details className="mt-1 text-[13px]">
                        <summary className="cursor-pointer text-muted">Details</summary>
                        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-2 font-mono text-[12px]">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {limit < 200 && rows.length >= limit && (
            <Button
              variant="secondary"
              block
              className="mt-3"
              loading={log.loading}
              onClick={() => setLimit((l) => (l < 100 ? 100 : 200))}
            >
              Show more
            </Button>
          )}
        </>
      )}
    </Sheet>
  );
}

function DeleteFamilySheet({ family, signOut, onClose }: { family: Family; signOut: () => Promise<void>; onClose: () => void }) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const match = typed.trim() === family.name.trim();

  const del = async () => {
    if (!match) return;
    setBusy(true);
    try {
      // Photos first (Storage has no cascade); if this fails nothing is deleted yet and the owner can retry.
      await backend().deleteFamilyPhotos(family.id);
      await api.deleteFamily(family.name);
      try { await signOut(); } catch { /* the session is gone anyway */ }
      location.href = `${import.meta.env.BASE_URL}welcome`;
    } catch (err) {
      toast.show(friendlyError(err), 'error');
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Delete this family?"
      footer={
        <Button variant="danger" size="lg" block icon="trash" disabled={!match} loading={busy} onClick={() => void del()}>
          Delete everything
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <p className="flex items-start gap-2 rounded-xl bg-bad-soft p-3 text-bad">
          <Icon name="alert" size={20} className="mt-0.5 shrink-0" />
          This deletes everyone’s money, tasks, photos and calendar for good. Everyone is signed out.
        </p>
        <Input
          label={<>Type <strong>{family.name}</strong> to confirm</>}
          value={typed}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
    </Sheet>
  );
}
