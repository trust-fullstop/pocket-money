// Backend abstraction: 'demo' runs the real SQL in the browser (PGlite), 'cloud' talks to Supabase.
// Implementations: ./demo.ts and ./supabase.ts. Chosen at startup by ./select.ts.

export interface AuthIdentity { provider: string; email?: string | null }

export interface Backend {
  mode: 'demo' | 'cloud';
  /** Call a public SQL function with named params (p_*). Throws AppError (src/lib/errors.ts) on failure. */
  rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T>;
  /** Current auth user id (auth.uid()) or null when signed out. */
  userId(): Promise<string | null>;
  /** Ensure there is a session; creates an anonymous one if needed. Returns the user id. */
  ensureSession(): Promise<string>;
  signOut(): Promise<void>;
  /** Google: sign in (existing account) — redirects. Cloud only; demo throws AppError('not_in_demo'). */
  signInWithGoogle(): Promise<void>;
  /** Google: attach to the current (anonymous) user — redirects. */
  linkGoogle(): Promise<void>;
  identities(): Promise<AuthIdentity[]>;
  /** Upload a compressed image; path = `${familyId}/${folder}/${uuid}.jpg`. */
  uploadPhoto(path: string, blob: Blob): Promise<void>;
  /** Short-lived URL (cloud: signed URL 1h; demo: object URL). */
  photoUrl(path: string): Promise<string>;
  /** Demo only: seeded people to "switch to", switch, reset and time-travel. */
  demo?: {
    people(): Promise<{ user_id: string; member_id: string; display_name: string; avatar: string; role: string }[]>;
    switchTo(userId: string): Promise<void>;
    reset(): Promise<void>;
    advance(hours: number): Promise<string>;   // returns new fake-now ISO
  };
}

let current: Backend | null = null;
export function setBackend(b: Backend) { current = b; }
export function backend(): Backend {
  if (!current) throw new Error('Backend not initialised');
  return current;
}
