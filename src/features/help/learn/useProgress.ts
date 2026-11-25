// Light on purpose (no lesson texts), so Home can show Money school progress.
import { useMemo } from 'react';
import { api } from '../../../lib/api';
import { useFeatures } from '../../../lib/features';
import { todayISO } from '../../../lib/format';
import { useApp, useLoad } from '../../../lib/session';
import { coreProgress, seriesProgress } from './catalog';

/** The family-local date (YYYY-MM-DD) on the app clock (respects the demo's fake clock); null before the family loads. */
export function useFamilyToday(): string | null {
  const { family, now } = useApp();
  return family ? todayISO(family.timezone, now()) : null;
}

/** Finished lessons (managers get the whole family) and the reader's own progress: core, and each lesson series. */
export function useLessonsDone() {
  const { me, state } = useApp();
  const { on } = useFeatures();
  const today = useFamilyToday();
  const learn = on('learn');
  const load = useLoad(() => (learn ? api.listLessonsDone() : Promise.resolve([])), [learn, me?.id, state?.now]);
  const progress = useMemo(() => coreProgress(on, load.data ?? undefined, me?.id), [on, load.data, me?.id]);
  const series = useMemo(() => seriesProgress(on, load.data ?? undefined, me?.id, today), [on, load.data, me?.id, today]);
  return { ...load, progress, series, today };
}
