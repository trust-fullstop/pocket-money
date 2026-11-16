import { useEffect, useId, useRef, useState } from 'react';
import { compressImage } from '../../lib/photos';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { cx } from './styles';

export interface PhotoCaptureProps {
  /** e.g. "Before photo". */
  label: string;
  /** The compressed JPEG (or null). */
  value: Blob | null;
  onChange: (photo: Blob | null) => void;
  /** 'environment' (back camera, default), 'user' (selfie) or false (let the user choose camera or gallery). */
  capture?: 'environment' | 'user' | false;
  hint?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Take/choose a photo → compressed JPEG (max 1280px, EXIF stripped) with preview and remove.
 * Upload it yourself with uploadPhoto(familyId, folder, blob) from src/lib/photos.ts.
 */
export function PhotoCapture({ label, value, onChange, capture = 'environment', hint, error, disabled, className }: PhotoCaptureProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) { setPreview(null); return; }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } catch {
      setProblem("That photo couldn't be read. Try another one.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const err = error ?? problem;
  return (
    <div className={cx('space-y-1.5', className)}>
      <input
        ref={input} id={id} type="file" accept="image/*" className="sr-only" disabled={disabled || busy}
        {...(capture ? { capture } : {})}
        onChange={(e) => pick(e.target.files?.[0])}
        aria-describedby={err ? `${id}-err` : hint ? `${id}-hint` : undefined}
      />
      {preview ? (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2">
          <img src={preview} alt={label} className="size-20 shrink-0 rounded-xl object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 font-semibold"><Icon name="check" size={18} className="text-good" />{label}</div>
            <div className="mt-1 flex gap-1">
              <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center rounded-xl px-3 text-[15px] font-semibold text-accent-ink hover:bg-accent-soft">Retake</label>
              <button type="button" onClick={() => onChange(null)} disabled={disabled} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-[15px] font-semibold text-bad hover:bg-bad-soft">
                <Icon name="trash" size={18} />Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cx(
            'flex min-h-20 cursor-pointer items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed border-line bg-surface px-4 text-[16px] font-semibold text-ink transition hover:border-accent hover:bg-accent-soft',
            (disabled || busy) && 'pointer-events-none opacity-60',
            err && 'border-bad',
          )}
        >
          {busy ? <Spinner /> : <Icon name="camera" size={26} className="text-accent-ink" />}
          {busy ? 'Preparing photo…' : label}
        </label>
      )}
      {err && <p id={`${id}-err`} className="flex items-center gap-1.5 text-sm font-semibold text-bad"><Icon name="alert" size={16} />{err}</p>}
      {hint && !err && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
    </div>
  );
}
