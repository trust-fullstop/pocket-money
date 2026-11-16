import { createContext, useContext, type ReactNode } from 'react';

export type ToastTone = 'success' | 'error' | 'info';
export interface ToastApi {
  /** Show a short message at the bottom of the screen (auto-hides after ~3.5 s; errors ~6 s). */
  show: (message: string, tone?: ToastTone) => void;
}
export const ToastContext = createContext<ToastApi | null>(null);

/** `const toast = useToast(); toast.show('Saved', 'success')` */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() outside <UIProvider>');
  return ctx;
}

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. */
  danger?: boolean;
}
export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
export const ConfirmContext = createContext<ConfirmFn | null>(null);

/** `const confirm = useConfirm(); if (await confirm({ title: 'Remove?', danger: true })) …` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm() outside <UIProvider>');
  return ctx;
}
