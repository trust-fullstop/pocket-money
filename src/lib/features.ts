// Feature switches (parent admin → Family → Features). UI code asks `useFeatures().on('savings')`
// to decide what to show. The server enforces the same switches and answers `feature_off`.
import { useMemo } from 'react';
import { featureOn, type FeatureKey, type Features } from './types';
import { useMaybeApp } from './session';

export interface FeatureApi {
  /** Is this part of the app switched on for the family (respects dependencies, e.g. interest needs savings)? */
  on: (key: FeatureKey) => boolean;
  /** Raw switches as stored (missing keys = on). */
  raw: Partial<Features>;
}

export function useFeatures(): FeatureApi {
  const app = useMaybeApp();
  const raw = (app?.family?.settings?.features ?? {}) as Partial<Features>;
  return useMemo(() => ({ on: (key: FeatureKey) => featureOn(raw, key), raw }), [raw]);
}
