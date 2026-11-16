import { useEffect, useState } from 'react';
import { toString as qrToSvg } from 'qrcode';
import { groupCode } from '../../lib/format';
import { cx } from './styles';

export interface QRCodeProps {
  /** What the QR encodes (usually joinUrl(code)). */
  value: string;
  /** Short code printed under the QR in big letters ("ABCD EFGH"). */
  code?: string;
  /** Pixel size of the QR square (default 260). */
  size?: number;
  /** Accessible description (default "QR code"). */
  label?: string;
  className?: string;
}

/** Large, high-contrast QR (always black on white, also in dark mode) with the short code below it. */
export function QRCode({ value, code, size = 260, label = 'QR code', className }: QRCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    qrToSvg(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => { if (alive) { setSvg(s); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [value]);

  return (
    <div className={cx('flex flex-col items-center gap-3', className)}>
      {svg ? (
        <div
          role="img" aria-label={label}
          className="rounded-3xl bg-white p-3 shadow-md ring-1 ring-black/10 [&>svg]:block [&>svg]:size-full"
          style={{ width: size, height: size }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="grid place-items-center rounded-3xl bg-white p-3 shadow-md ring-1 ring-black/10" style={{ width: size, height: size }}>
          <span className="text-sm text-neutral-500">{failed ? 'QR unavailable – use the code below' : 'Making QR…'}</span>
        </div>
      )}
      {code && (
        <div className="text-center">
          <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">or type the code</div>
          <div className="font-mono text-[2rem] font-bold tracking-[0.12em] tabular-nums" aria-label={`Code ${code.split('').join(' ')}`}>
            {groupCode(code)}
          </div>
        </div>
      )}
    </div>
  );
}
