import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Keyboard, ScanLine, X } from 'lucide-react';

interface DetectedBarcode {
  rawValue?: string;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<DetectedBarcode[]>;
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

interface LoyaltyQrScannerProps {
  onDetected: (payload: string) => void;
  onClose: () => void;
}

/**
 * Scans a customer loyalty QR code at checkout. Uses the browser's built-in
 * BarcodeDetector camera pipeline where available, and always offers a manual
 * entry box so USB/Bluetooth wedge scanners (which type the code and press
 * Enter) and hand-keyed codes keep working.
 */
export function LoyaltyQrScanner({ onDetected, onClose }: LoyaltyQrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);

  const detectorCtor =
    typeof window !== 'undefined'
      ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
      : undefined;
  const cameraSupported = Boolean(detectorCtor);

  const stopCamera = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const handleDetected = useCallback(
    (raw: string) => {
      if (detectedRef.current) return;
      const value = (raw || '').trim();
      if (!value) return;
      detectedRef.current = true;
      stopCamera();
      onDetectedRef.current(value);
    },
    [stopCamera]
  );

  useEffect(() => {
    const Ctor = detectorCtor;
    if (!Ctor) return;
    let cancelled = false;
    const detector = new Ctor({ formats: ['qr_code'] });

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraActive(true);
        timerRef.current = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2) return;
          detector
            .detect(video)
            .then((codes) => {
              const hit = codes.find(
                (code) => code && typeof code.rawValue === 'string' && code.rawValue.trim()
              );
              if (hit?.rawValue) handleDetected(hit.rawValue);
            })
            .catch(() => undefined);
        }, 300);
      } catch (err) {
        if (!cancelled) {
          setCameraError(
            err instanceof Error ? err.message : 'Camera unavailable or permission denied.'
          );
          setCameraActive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [detectorCtor, handleDetected, stopCamera]);

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manual.trim()) return;
    handleDetected(manual);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Scan customer loyalty QR code"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
              <ScanLine className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Scan loyalty QR</h3>
              <p className="text-[11px] text-slate-500">
                Points are added automatically when the bill is paid
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR scanner"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          {cameraSupported ? (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
              <video
                ref={videoRef}
                muted
                playsInline
                className="block aspect-[4/3] w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-emerald-400/80" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-semibold text-white">
                {cameraActive ? 'Point at the customer QR code' : 'Starting camera…'}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600">
              <CameraOff className="h-4 w-4 shrink-0 text-slate-400" />
              Live camera scanning is not supported in this browser. Use the code
              entry below or a USB QR scanner.
            </div>
          )}

          {cameraError && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <Camera className="h-4 w-4 shrink-0 text-amber-700" />
              {cameraError}
            </div>
          )}

          <form onSubmit={submitManual} className="space-y-2">
            <label className="block text-[11px] font-semibold text-slate-600">
              <Keyboard className="mr-1 inline h-3.5 w-3.5" />
              Or type / paste the code from the loyalty card
            </label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="XAIWORK-POS-LOYALTY|v1|…  or phone"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
              />
              <button
                type="submit"
                disabled={!manual.trim()}
                className="rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
              >
                Attach
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
