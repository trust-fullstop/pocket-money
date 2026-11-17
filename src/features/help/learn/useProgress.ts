// Light on purpose (no lesson texts), so Home can show Money school progress.
import { useMemo } from 'react';
import { api } from '../../../lib/api';
import { useFeatures } from '../../../lib/features';
import { useApp, useLoad } from '../../../lib/session';
import { coreProgress } from './catalog';

/** Finished lessons (managers get the whole family) and the reader's own core progress. */
export function useLessonsDone() {
  const { me, state } = useApp();
  const { on } = useFeatures();
  const learn = on('learn');
  const load = useLoad(() => (learn ? api.listLessonsDone() : Promise.resolve([])), [learn, me?.id, state?.now]);
  const progress = useMemo(() => coreProgress(on, load.data ?? undefined, me?.id), [on, load.data, me?.id]);
  return { ...load, progress };
}
