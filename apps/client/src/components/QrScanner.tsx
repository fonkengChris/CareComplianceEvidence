import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/button';

/**
 * Live camera QR scanner, so the installed app can read a check-in screen's QR itself (a phone's
 * own camera app opens links in the browser, not the installed PWA — always on iPhone).
 * Uses the native BarcodeDetector where it exists (Chrome on Android) and falls back to jsQR
 * (lazy-loaded, e.g. Safari). Calls `onScan` with each decoded text until the parent closes it;
 * the camera is released on unmount.
 */
export function QrScanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Latest callback without restarting the camera when the parent re-renders.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    async function run() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This device cannot use its camera here — type the code instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        setError('Camera permission was refused — allow it, or type the code instead.');
        return;
      }
      const video = videoRef.current;
      if (stopped || !video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      const decode = await createDecoder();

      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= video.HAVE_ENOUGH_DATA) {
          const text = await decode(video);
          if (text && !stopped) onScanRef.current(text);
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    void run();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera view"
          className="aspect-square w-full max-w-72 rounded-md bg-black object-cover"
        />
      )}
      <Button type="button" variant="outline" className="self-start" onClick={onClose}>
        Cancel scan
      </Button>
    </div>
  );
}

type Decode = (video: HTMLVideoElement) => Promise<string | null>;

interface NativeBarcodeDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

/** Native detector when supported; otherwise draw frames to a canvas and run jsQR on them. */
async function createDecoder(): Promise<Decode> {
  const Native = (
    globalThis as {
      BarcodeDetector?: new (opts: { formats: string[] }) => NativeBarcodeDetector;
    }
  ).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ['qr_code'] });
    return async (video) => (await detector.detect(video).catch(() => []))[0]?.rawValue ?? null;
  }

  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height)?.data ?? null;
  };
}
