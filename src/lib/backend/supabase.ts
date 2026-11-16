// Cloud backend: Supabase Auth (anonymous + Google), RPCs over PostgREST, private Storage bucket 'photos'.
import { createClient } from '@supabase/supabase-js';
import { toAppError } from '../errors';
import type { AuthIdentity, Backend } from './index';

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb = createClient(url, anonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const home = location.origin + import.meta.env.BASE_URL;
  const signed = new Map<string, { url: string; exp: number }>();
  const inflight = new Map<string, Promise<string>>();
  let sessionPromise: Promise<string> | null = null;

  return {
    mode: 'cloud',

    async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
      const { data, error } = await sb.rpc(fn, args);
      if (error) throw toAppError({ message: error.message, detail: error.details });
      return data as T;
    },

    async userId() {
      const { data } = await sb.auth.getSession();
      return data.session?.user.id ?? null;
    },

    ensureSession() {
      sessionPromise ??= (async () => {
        const { data } = await sb.auth.getSession();
        if (data.session) return data.session.user.id;
        const res = await sb.auth.signInAnonymously();
        if (res.error || !res.data.user) throw toAppError({ message: res.error?.message ?? 'not_signed_in' });
        return res.data.user.id;
      })().finally(() => { sessionPromise = null; });
      return sessionPromise;
    },

    async signOut() {
      // 'local': only this device. A global sign-out would also log out the person's other phones.
      await sb.auth.signOut({ scope: 'local' });
      signed.clear();
    },

    async signInWithGoogle() {
      const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: home } });
      if (error) throw toAppError(error);
    },

    async linkGoogle() {
      const { error } = await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo: home + 'me/secure?linked=1' } });
      if (error) throw toAppError(error);
    },

    async identities(): Promise<AuthIdentity[]> {
      const { data, error } = await sb.auth.getUserIdentities();
      if (error) return [];
      return (data?.identities ?? []).map((i) => ({
        provider: i.provider,
        email: (i.identity_data?.email as string | undefined) ?? null,
      }));
    },

    async uploadPhoto(path: string, blob: Blob) {
      const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw toAppError(error);
    },

    async photoUrl(path: string) {
      const hit = signed.get(path);
      if (hit && hit.exp > Date.now()) return hit.url;
      const pending = inflight.get(path);
      if (pending) return pending;
      const p = (async () => {
        const { data, error } = await sb.storage.from('photos').createSignedUrl(path, 3600);
        if (error || !data) throw toAppError(error ?? { message: 'not_found' });
        signed.set(path, { url: data.signedUrl, exp: Date.now() + 55 * 60_000 });
        return data.signedUrl;
      })().finally(() => inflight.delete(path));
      inflight.set(path, p);
      return p;
    },
  };
}
