// Light on purpose (no lesson texts), so Home can show Money school progress.
import { useMemo } from 'react';
import { api } from '../../../lib/api';
import { useFeatures } from '../../../lib/features';
import { todayISO } from '../../../lib/format';
import { useApp, useLoad } from '../../../lib/session';
import { planOf, type LessonPlan } from './bank';
import { moneySchool } from './progress';

/** The family-local date (YYYY-MM-DD) on the app clock (respects the demo's fake clock); null before the family loads. */
export function useFamilyToday(): string | null {
  const { family, now } = useApp();
  return family ? todayISO(family.timezone, now()) : null;
}

/** The family's Money school lesson plan (family setting lesson_plan). */
export function useLessonPlan(): LessonPlan {
  const { family } = useApp();
  const raw = family?.settings?.lesson_plan;
  return useMemo(() => planOf({ lesson_plan: raw }), [raw]);
}

/**
 * Finished lessons (managers get the whole family) and the reader's own Money school (./progress): core lessons, the
 * planned themes and what's up next, on the family-local today and the family's lesson plan.
 */
export function useLessonsDone() {
  const { me, state } = useApp();
  const { on } = useFeatures();
  const today = useFamilyToday();
  const plan = useLessonPlan();
  const learn = on('learn');
  const load = useLoad(() => (learn ? api.listLessonsDone() : Promise.resolve([])), [learn, me?.id, state?.now]);
  const school = useMemo(
    () => moneySchool({ on, rows: load.data ?? undefined, memberId: me?.id, plan, today }),
    [on, load.data, me?.id, plan, today],
  );
  return { ...load, school, plan, today };
}