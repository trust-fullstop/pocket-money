import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError } from '../../lib/errors';
import { useToast } from './context';

export interface UseActionOptions {
  /** Toast shown on success. */
  success?: string;
  /** Show a toast with the friendly error (default true). */
  errorToast?: boolean;
}

/**
 * Wrap an async action (button handler): tracks busy, shows friendly error toasts.
 * `const save = useAction(() => api.updateMember(id, patch), { success: 'Saved' });`
 * `<Button loading={save.busy} onClick={() => save.run()}>`. run() resolves to the result, or undefined on error.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: UseActionOptions = {}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  const optsRef = useRef(opts);
  useEffect(() => { fnRef.current = fn; optsRef.current = opts; });

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      const r = await fnRef.current(...args);
      if (optsRef.current.success) toast.show(optsRef.current.success, 'success');
      return r;
    } catch (e) {
      const msg = friendlyError(e);
      setError(msg);
      if (optsRef.current.errorToast !== false) toast.show(msg, 'error');
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [toast]);

  return { run, busy, error, setError };
}
