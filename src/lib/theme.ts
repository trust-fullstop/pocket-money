// Personal look: accent colour, light/dark, character (levels up with points), "Classic" plain look.
import type { Theme } from './types';

export interface Accent { name: string; 500: string; 600: string; 100: string; 900: string }

// "600" is used behind white text, so it is picked dark enough for good contrast.
export const ACCENTS = {
  classic: { name: 'Classic', 500: '#64748b', 600: '#475569', 100: '#f1f5f9', 900: '#0f172a' },
  teal: { name: 'Teal', 500: '#14b8a6', 600: '#0f766e', 100: '#ccfbf1', 900: '#134e4a' },
  green: { name: 'Green', 500: '#22c55e', 600: '#15803d', 100: '#dcfce7', 900: '#14532d' },
  sky: { name: 'Sky', 500: '#0ea5e9', 600: '#0369a1', 100: '#e0f2fe', 900: '#0c4a6e' },
  blue: { name: 'Blue', 500: '#3b82f6', 600: '#2563eb', 100: '#dbeafe', 900: '#1e3a8a' },
  indigo: { name: 'Indigo', 500: '#6366f1', 600: '#4f46e5', 100: '#e0e7ff', 900: '#312e81' },
  violet: { name: 'Violet', 500: '#8b5cf6', 600: '#7c3aed', 100: '#ede9fe', 900: '#4c1d95' },
  pink: { name: 'Pink', 500: '#ec4899', 600: '#be185d', 100: '#fce7f3', 900: '#831843' },
  red: { name: 'Red', 500: '#ef4444', 600: '#b91c1c', 100: '#fee2e2', 900: '#7f1d1d' },
  orange: { name: 'Orange', 500: '#f97316', 600: '#c2410c', 100: '#ffedd5', 900: '#7c2d12' },
  amber: { name: 'Amber', 500: '#f59e0b', 600: '#b45309', 100: '#fef3c7', 900: '#78350f' },
} satisfies Record<string, Accent>;

export type AccentKey = keyof typeof ACCENTS;
export const DEFAULT_ACCENT: AccentKey = 'teal';

export function accentOf(theme?: Theme | null): Accent {
  if (theme?.classic) return ACCENTS.classic;
  return (ACCENTS as Record<string, Accent>)[theme?.accent ?? ''] ?? ACCENTS[DEFAULT_ACCENT];
}

export interface Character { emoji: string; name: string; titles: string[] }

export const CHARACTERS: Record<string, Character> = {
  fox: { emoji: '🦊', name: 'Fox', titles: ['Fox Cub', 'Curious Fox', 'Quick Fox', 'Clever Fox', 'Sly Fox', 'Silver Fox', 'Fox Captain', 'Fox Legend'] },
  dragon: { emoji: '🐉', name: 'Dragon', titles: ['Dragon Egg', 'Hatchling', 'Little Dragon', 'Fire Breather', 'Sky Dragon', 'Storm Dragon', 'Elder Dragon', 'Dragon King'] },
  robot: { emoji: '🤖', name: 'Robot', titles: ['Prototype', 'Helper Bot', 'Busy Bot', 'Smart Bot', 'Turbo Bot', 'Mega Bot', 'Robo Chief', 'Super Robot'] },
  unicorn: { emoji: '🦄', name: 'Unicorn', titles: ['Foal', 'Sparkle Pony', 'Little Unicorn', 'Rainbow Runner', 'Star Unicorn', 'Moon Unicorn', 'Magic Unicorn', 'Unicorn Royal'] },
  panda: { emoji: '🐼', name: 'Panda', titles: ['Panda Cub', 'Bamboo Muncher', 'Happy Panda', 'Kung Fu Panda', 'Brave Panda', 'Wise Panda', 'Panda Master', 'Legendary Panda'] },
  dino: { emoji: '🦖', name: 'Dino', titles: ['Dino Egg', 'Baby Dino', 'Stomper', 'Roarer', 'Big Dino', 'Mighty Rex', 'Dino Boss', 'Dino Legend'] },
  rocket: { emoji: '🚀', name: 'Rocket', titles: ['Launch Pad', 'Lift Off', 'Sky Rocket', 'Orbiter', 'Moon Lander', 'Star Ship', 'Galaxy Cruiser', 'Space Legend'] },
  cat: { emoji: '🐱', name: 'Cat', titles: ['Kitten', 'Curious Cat', 'Clever Cat', 'Cool Cat', 'Ninja Cat', 'Top Cat', 'Lion Heart', 'Cat Legend'] },
  owl: { emoji: '🦉', name: 'Owl', titles: ['Owlet', 'Night Watcher', 'Smart Owl', 'Wise Owl', 'Book Owl', 'Professor Owl', 'Owl Sage', 'Owl Legend'] },
  shark: { emoji: '🦈', name: 'Shark', titles: ['Pup', 'Reef Swimmer', 'Fast Fin', 'Wave Rider', 'Deep Diver', 'Great Shark', 'Ocean Boss', 'Shark Legend'] },
};

const GENERIC_TITLES = ['Starter', 'Helper', 'Go-getter', 'Rising Star', 'Star', 'Champion', 'Hero', 'Legend'];

export function characterOf(theme?: Theme | null): (Character & { key: string }) | null {
  if (!theme || theme.classic || !theme.character) return null;
  const c = CHARACTERS[theme.character];
  return c ? { ...c, key: theme.character } : null;
}

/** Points needed to reach each level (index 0 = level 1). After the list, each level costs 1000 more. */
export const LEVEL_THRESHOLDS = [0, 50, 120, 220, 350, 520, 750, 1000, 1300, 1700, 2200, 2800, 3500, 4300, 5200];

function thresholdFor(levelIndex: number): number {
  if (levelIndex < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[levelIndex];
  const last = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  const extra = levelIndex - (LEVEL_THRESHOLDS.length - 1);
  return last + extra * 1000;
}

export interface LevelInfo { level: number; title: string; progressPct: number; nextAt: number; currentAt: number; toNext: number }

/** Level, title (per character), % progress to the next level and the points needed for it. */
export function levelFromPoints(pointsTotal: number, characterKey?: string | null): LevelInfo {
  const p = Math.max(0, Math.floor(pointsTotal || 0));
  let i = 0;
  while (thresholdFor(i + 1) <= p) i++;
  const currentAt = thresholdFor(i);
  const nextAt = thresholdFor(i + 1);
  const titles = (characterKey && CHARACTERS[characterKey]?.titles) || GENERIC_TITLES;
  const title = i < titles.length ? titles[i] : `${titles[titles.length - 1]} ${i - titles.length + 2}`;
  return {
    level: i + 1, title, currentAt, nextAt, toNext: nextAt - p,
    progressPct: Math.min(100, Math.round(((p - currentAt) / (nextAt - currentAt)) * 100)),
  };
}

export type ColorMode = NonNullable<Theme['mode']>;

/** Apply a member's theme to the whole document (CSS variables + data-mode). Pass null for the default look. */
export function applyTheme(theme?: Theme | null): void {
  const root = document.documentElement;
  const a = accentOf(theme);
  root.style.setProperty('--accent', a[500]);
  root.style.setProperty('--accent-strong', a[600]);
  root.style.setProperty('--accent-soft', a[100]);
  root.style.setProperty('--accent-ink', a[900]);
  const mode: ColorMode = theme?.mode ?? 'system';
  root.dataset.mode = mode;
  const dark = mode === 'dark' || (mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0f14' : '#f4f5f7');
}
