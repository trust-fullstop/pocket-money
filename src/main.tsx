import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { api } from './lib/api';
import { backend } from './lib/backend';
import { initBackend } from './lib/backend/select';

const root = createRoot(document.getElementById('root')!);

function BootError({ error }: { error: unknown }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-5xl" aria-hidden="true">😵‍💫</div>
      <h1 className="text-xl font-bold">Sow & Grow couldn't start</h1>
      <p className="text-muted">{error instanceof Error ? error.message : String(error)}</p>
      <button type="button" className="min-h-12 rounded-2xl bg-accent-strong px-5 font-semibold text-white" onClick={() => location.reload()}>
        Try again
      </button>
    </div>
  );
}

initBackend()
  .then(() => {
    // Handy for testing from the browser console during development: await __pm.api.getState()
    if (import.meta.env.DEV) Object.assign(window, { __pm: { api, backend } });
    root.render(<StrictMode><App /></StrictMode>);
  })
  .catch((e: unknown) => root.render(<BootError error={e} />));
