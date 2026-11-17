// Who sees Bible verses (feature 'faith'): the family switch, plus each person's own "Show Bible verses" in Me.
// Kept apart from the verse data so Me can use it without loading the verses.
import { useFeatures } from '../../lib/features';
import { useMaybeApp } from '../../lib/session';
import type { Theme } from '../../lib/types';

/** id of the "Show Bible verses" part of the Me page. */
export const VERSES_SECTION_ID = 'verses';
/** Where "Hide verses" goes: Me, scrolled to the toggle. */
export const VERSES_SETTING_PATH = `/me#${VERSES_SECTION_ID}`;

/** A person shows verses unless they switched them off (`theme.verses === false`). */
export function showsVerses(theme: Theme | null | undefined): boolean {
  return theme?.verses !== false;
}

/** True when 'faith' is on for the family and I haven't hidden verses for myself. */
export function useVersesShown(): boolean {
  const app = useMaybeApp();
  const { on } = useFeatures();
  return !!app?.me && on('faith') && showsVerses(app.me.theme);
}
