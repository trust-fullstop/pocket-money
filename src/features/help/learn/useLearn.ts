// Money school hooks: the reader's lesson context and the lessons they've finished.
import { useMemo } from 'react';
import { useFeatures } from '../../../lib/features';
import { useApp } from '../../../lib/session';
import { lessonCtx } from './lessons';

export { useLessonsDone } from './useProgress';

export function useLessonCtx() {
  const { family, me } = useApp();
  const { on } = useFeatures();
  return useMemo(() => lessonCtx({ family, me, on }), [family, me, on]);
}