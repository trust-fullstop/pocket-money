import { usePhotoUrl } from '../../lib/photos';
import { accentOf } from '../../lib/theme';
import type { Member } from '../../lib/types';
import { cx } from './styles';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
const PX: Record<AvatarSize, number> = { xs: 28, sm: 36, md: 44, lg: 64, xl: 96 };

export interface AvatarProps {
  /** Takes avatar emoji, photo, name and accent colour from the member. */
  member?: Pick<Member, 'avatar' | 'photo_path' | 'display_name' | 'theme'> | null;
  emoji?: string;
  photoPath?: string | null;
  /** Used for alt text. */
  name?: string;
  size?: AvatarSize;
  /** Coloured ring in the member's accent (or a given CSS colour). */
  ring?: boolean | string;
  className?: string;
}

/** Round avatar: photo when available, else the emoji on a soft background in the member's colour. */
export function Avatar({ member, emoji, photoPath, name, size = 'md', ring, className }: AvatarProps) {
  const path = photoPath !== undefined ? photoPath : member?.photo_path ?? null;
  const url = usePhotoUrl(path);
  const accent = accentOf(member?.theme);
  const px = PX[size];
  const label = name ?? member?.display_name ?? '';
  const ringColor = typeof ring === 'string' ? ring : accent[500];
  return (
    <span
      role="img" aria-label={label || undefined} aria-hidden={label ? undefined : true}
      className={cx('relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full', className)}
      style={{
        width: px, height: px, background: url ? undefined : accent[100],
        boxShadow: ring ? `0 0 0 ${size === 'xs' || size === 'sm' ? 2 : 3}px var(--surface), 0 0 0 ${size === 'xs' || size === 'sm' ? 4 : 6}px ${ringColor}` : undefined,
      }}
    >
      {url
        ? <img src={url} alt="" className="size-full object-cover" draggable={false} />
        : <span style={{ fontSize: Math.round(px * 0.56), lineHeight: 1 }} aria-hidden="true">{emoji ?? member?.avatar ?? '🙂'}</span>}
    </span>
  );
}
