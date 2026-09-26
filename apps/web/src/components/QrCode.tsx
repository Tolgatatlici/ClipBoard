import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((result) => !cancelled && setSvg(result))
      .catch(() => !cancelled && setSvg(null));
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!svg) return <div style={{ width: size, height: size }} aria-hidden="true" />;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      width={size}
      height={size}
      alt="Paylaşım linkinin QR kodu"
      className="rounded-lg bg-white p-2"
    />
  );
}
