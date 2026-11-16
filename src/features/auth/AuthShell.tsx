import type { ReactNode } from 'react';

/** Full-height, centered column for the signed-out screens (welcome, join, login). */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      {children}
    </div>
  );
}
