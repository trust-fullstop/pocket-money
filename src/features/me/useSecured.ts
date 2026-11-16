import { useLoad } from '../../lib/session';
import { backend } from '../../lib/backend';
import type { Member } from '../../lib/types';

/** Whether `me` can get back in on a new phone (password or Google), plus the linked identities. */
export function useSecured(me: Member | null) {
  const ids = useLoad(() => backend().identities(), [me?.id]);
  const google = (ids.data ?? []).find((i) => i.provider === 'google') ?? null;
  return {
    secured: !!me?.has_password || !!google,
    google,
    loading: ids.loading,
    reload: ids.reload,
  };
}
