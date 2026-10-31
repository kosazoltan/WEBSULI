import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  blobToDataUrl,
  browserMediaDevices,
  captureStill,
  readPreferredCamera,
  savePreferredCamera,
  startCamera,
  stopStream,
  type CameraStartError,
  type StartedCamera,
} from "@/lib/camera-capture";

/**
 * Fényképezős forrásfelvétel (docs/specs/2026-10-31-tananyag-fenykepezo.md): teljes képernyős élő előnézet a
 * telefon hátsó kamerájával, oldalanként egy exponálás, a képek dataURL-ként mennek vissza a hívónak (az a
 * meglévő kicsinyítés + forrásfájl-úton adja tovább). Kameraindítási hibánál a hívó a natív kamerára esik.
 */
export type CameraPhoto = { name: string; dataUrl: string };

const stamp = (now: Date) =>
  `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

export function CameraCaptureDialog({
  open,
  onClose,
  onDone,
  onFallback,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (photos: CameraPhoto[]) => void;
  /** A kamera nem indul / az exponálás nem ad képet → a hívó a natív `capture` inputot nyitja. */
  onFallback: (error: CameraStartError) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<StartedCamera | null>(null);
  const [ready, setReady] = useState(false);
  // Az exponálás csak az első dekódolt képkocka után engedett: a play() feloldása még nem jelent képet,
  // és a 0×0-s videóból az exponálási lánc üres kézzel (natív fallback) térne vissza.
  const [videoReady, setVideoReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [photos, setPhotos] = useState<CameraPhoto[]>([]);

  const stop = useCallback(() => {
    stopStream(cameraRef.current?.stream);
    cameraRef.current = null;
    setReady(false);
    setVideoReady(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhotos([]);
    void (async () => {
      try {
        const camera = await startCamera(browserMediaDevices(), readPreferredCamera());
        if (cancelled) {
          stopStream(camera.stream);
          return;
        }
        cameraRef.current = camera;
        savePreferredCamera(camera.deviceId);
        const video = videoRef.current;
        if (video) {
          video.srcObject = camera.stream as unknown as MediaStream;
          // Az autoPlay nem mindenhol indít el némított streamet is — a kifejezett play() hibája nem akadály.
          void video.play().catch(() => undefined);
          if (video.videoWidth > 0) setVideoReady(true);
        }
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        const kind = (error as { cameraError?: CameraStartError }).cameraError ?? "failed";
        onClose();
        onFallback(kind);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
    // Az onClose/onFallback referencia-váltása szándékosan nem indít új kamerát: csak a nyitás számít.
  }, [open, stop]);

  const shoot = async () => {
    const video = videoRef.current;
    const camera = cameraRef.current;
    if (!video || !camera || shooting) return;
    setShooting(true);
    try {
      const still = await captureStill({ track: camera.track, video });
      if (!still) {
        // Se takePhoto, se elég nagy videókocka: itt nem születik használható kép — natív kamera.
        stop();
        onClose();
        onFallback("unsupported");
        return;
      }
      const dataUrl = await blobToDataUrl(still.blob);
      setPhotos((prev) => [
        ...prev,
        { name: `fenykep-${stamp(new Date())}-${prev.length + 1}.jpg`, dataUrl },
      ]);
    } finally {
      setShooting(false);
    }
  };

  const finish = () => {
    const taken = photos;
    stop();
    onClose();
    if (taken.length > 0) onDone(taken);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Fényképezés a tananyaghoz"
      data-testid="camera-dialog"
    >
      <div className="relative flex-1 min-h-0">
        {/* playsInline: iOS-en nem ugrik teljes képernyős lejátszóba; muted: autoplay-hez kell. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onLoadedData={() => setVideoReady(true)}
          className="h-full w-full object-contain"
        />
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin" aria-label="A kamera indul" />
          </div>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="absolute top-3 right-3 rounded-full"
          onClick={() => {
            stop();
            onClose();
          }}
          aria-label="Mégse"
          data-testid="camera-cancel"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>
      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto bg-black/90 px-3 py-2" data-testid="camera-photo-strip">
          {photos.map((p) => (
            <div key={p.name} className="relative shrink-0">
              <img src={p.dataUrl} alt={p.name} className="h-16 w-12 rounded object-cover" />
              <button
                onClick={() => setPhotos((prev) => prev.filter((x) => x.name !== p.name))}
                aria-label={`${p.name} törlése`}
                className="absolute -top-1 -right-1 rounded-full bg-black/80 p-0.5 text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-center gap-6 bg-black px-4 py-4">
        <p className="w-24 text-xs text-white/70">
          {photos.length > 0 ? `${photos.length} kép` : "Oldalanként egy kép"}
        </p>
        <Button
          size="icon"
          className="h-16 w-16 rounded-full bg-white text-black hover:bg-white/90"
          onClick={() => void shoot()}
          disabled={!ready || !videoReady || shooting}
          aria-label="Fénykép készítése"
          data-testid="camera-shutter"
        >
          {shooting ? <Loader2 className="w-7 h-7 animate-spin" /> : <Camera className="w-7 h-7" />}
        </Button>
        <Button
          variant="secondary"
          className="w-24 min-h-11 gap-1"
          onClick={finish}
          disabled={photos.length === 0}
          data-testid="camera-done"
        >
          <Check className="w-4 h-4" />
          Kész{photos.length > 0 ? ` (${photos.length})` : ""}
        </Button>
      </div>
    </div>
  );
}
