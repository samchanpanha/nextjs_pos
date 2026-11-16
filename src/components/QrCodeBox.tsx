import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeBoxProps {
  value: string;
  size?: number;
  label?: string;
  className?: string;
}

export function QrCodeBox({ value, size = 160, label, className = '' }: QrCodeBoxProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {dataUrl ? (
        <img
          src={dataUrl}
          alt={label || 'QR code'}
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          className="rounded-lg border border-slate-200 bg-white p-1.5"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="flex items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-xs text-slate-500"
          style={{ width: size, height: size }}
        >
          QR
        </div>
      )}
    </div>
  );
}
