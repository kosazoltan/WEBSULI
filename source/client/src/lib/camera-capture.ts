/**
 * Fényképezős forrásfelvétel — kamera-munkamenet és exponálás (docs/specs/2026-10-31-tananyag-fenykepezo.md).
 * A Post Planner kipróbált élő-kamera technikájának portja (bestpostplanner
 * client/src/lib/camera/{cameraSession,captureStill}.ts, spec: 2026-10-22-elo-kamera-eszkozprofil.md):
 * - indítás felhasználói gesztusra, hátsó kamera, 3840×2160 ideal, folyamatos fókusz, torch ki;
 * - exponálás: ImageCapture.takePhoto() → videókocka canvasról → null (a hívó a natív kamerára esik);
 * - hiba-besorolás, hogy a hívó tudja, mi történt (engedély / nincs kamera / foglalt / nem támogatott).
 * A függőségek injektálhatók, így a mag node:test alatt, DOM nélkül tesztelhető.
 */

export const CAMERA_DEVICE_STORAGE_KEY = "websuli.cameraDeviceId";
/** A kocka-út minimuma a meglévő kicsinyítési célhoz (shared/studio-ui DOWNSCALE_MAX_EDGE) igazodik. */
export const MIN_CAPTURE_LONG_SIDE = 1600;
const FRAME_JPEG_QUALITY = 0.95;

export type CameraStartError = "permission" | "no_camera" | "busy" | "unsupported" | "failed";

export function classifyCameraError(error: unknown): CameraStartError {
  const name = (error as { name?: unknown })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_camera";
  // A kamera létezik, de nem olvasható (másik alkalmazás használja, vagy hardverhiba).
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  if (name === "TypeError" || name === "NotSupportedError") return "unsupported";
  return "failed";
}

export interface VideoInputLike {
  deviceId: string;
  kind: string;
  label: string;
}

/** Hátsó kamerák: címke szerint ("back"/"rear"/"environment"/"hátsó"), különben minden videóbemenet. */
export function rearCameras(devices: readonly VideoInputLike[]): VideoInputLike[] {
  const videos = devices.filter((d) => d.kind === "videoinput");
  const rear = videos.filter((d) => /back|rear|environment|hátsó/i.test(d.label));
  return rear.length > 0 ? rear : videos;
}

/** Az elmentett kamera, ha még megvan; különben az első hátsó. */
export function chooseCamera(
  devices: readonly VideoInputLike[],
  preferredDeviceId: string | null,
): VideoInputLike | null {
  const candidates = rearCameras(devices);
  return candidates.find((d) => d.deviceId === preferredDeviceId) ?? candidates[0] ?? null;
}

/** Az elmentett kamera-azonosító kényelmi adat: a tároló hiánya nem hiba. */
export function readPreferredCamera(): string | null {
  try {
    return localStorage.getItem(CAMERA_DEVICE_STORAGE_KEY);
  } catch {
    return null;
  }
}
export function savePreferredCamera(deviceId: string | null): void {
  try {
    if (deviceId) localStorage.setItem(CAMERA_DEVICE_STORAGE_KEY, deviceId);
  } catch {
    // privát mód / letiltott tároló: a választás csak erre a munkamenetre szól
  }
}

/** A track-képességek általunk használt része (W3C mediacapture-image). */
export interface CameraCapabilities {
  focusMode?: string[];
  torch?: boolean;
}

export interface TrackLike {
  getCapabilities?: () => CameraCapabilities;
  getSettings: () => Record<string, unknown>;
  applyConstraints: (constraints: MediaTrackConstraints) => Promise<void>;
  stop: () => void;
  label?: string;
}

export interface StreamLike {
  getVideoTracks: () => TrackLike[];
  getTracks: () => Array<{ stop: () => void }>;
}

export interface MediaDevicesLike {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<StreamLike>;
  enumerateDevices: () => Promise<VideoInputLike[]>;
}

/**
 * A böngésző `navigator.mediaDevices`-e a mi szűkített alakunkra: a DOM `MediaTrackCapabilities` típusa nem
 * tartalmazza a mediacapture-image mezőket (focusMode, torch), ezért a strukturális illesztéshez átminősítés kell.
 */
export function browserMediaDevices(): MediaDevicesLike | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator.mediaDevices as unknown as MediaDevicesLike | undefined);
}

export function stopStream(stream: StreamLike | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      // a leállítás nem hibázhat el a hívónál
    }
  }
}

function readSetting(settings: Record<string, unknown>, key: string): number | string | null {
  const value = settings[key];
  return typeof value === "number" || typeof value === "string" ? value : null;
}

export interface StartedCamera {
  stream: StreamLike;
  track: TrackLike;
  deviceId: string | null;
}

/**
 * Kamera indítása: hátsó kamera nagy felbontással; engedély után váltás az elmentett / első hátsó eszközre;
 * folyamatos fókusz és torch ki, de CSAK ha a track támogatja. Hibánál a félig megnyitott streamet leállítja,
 * és `{ cameraError: CameraStartError }`-ral dob — a hívó a natív fájlbekérésre esik.
 */
export async function startCamera(
  mediaDevices: MediaDevicesLike | undefined,
  preferredDeviceId: string | null,
): Promise<StartedCamera> {
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    throw Object.assign(new Error("getUserMedia not supported"), {
      cameraError: "unsupported" as const,
    });
  }
  const base = { width: { ideal: 3840 }, height: { ideal: 2160 } };
  let stream: StreamLike | null = null;
  try {
    stream = await mediaDevices.getUserMedia({
      video: { ...base, facingMode: { ideal: "environment" } },
      audio: false,
    });
    // Engedély után a címkék ismertek: ha van elmentett / pontosabb hátsó kamera, arra váltunk.
    const chosen = chooseCamera(await mediaDevices.enumerateDevices(), preferredDeviceId);
    const current = stream.getVideoTracks()[0];
    const currentId = readSetting(current?.getSettings() ?? {}, "deviceId");
    if (chosen && chosen.deviceId !== currentId) {
      stopStream(stream);
      stream = await mediaDevices.getUserMedia({
        video: { ...base, deviceId: { exact: chosen.deviceId } },
        audio: false,
      });
    }
    const track = stream.getVideoTracks()[0];
    if (!track) {
      throw Object.assign(new Error("no video track"), { name: "NotFoundError" });
    }
    const capabilities = track.getCapabilities?.() ?? {};
    const constraints: Record<string, unknown> = {};
    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes("continuous")) {
      constraints.focusMode = "continuous";
    }
    if (capabilities.torch === true) {
      constraints.torch = false;
    }
    if (Object.keys(constraints).length > 0) {
      try {
        await track.applyConstraints({ advanced: [constraints as MediaTrackConstraintSet] });
      } catch {
        // a nem alkalmazható beállítás nem akadályozza az élő képet
      }
    }
    return {
      stream,
      track,
      deviceId:
        (readSetting(track.getSettings(), "deviceId") as string | null) ?? chosen?.deviceId ?? null,
    };
  } catch (error) {
    stopStream(stream);
    const cameraError =
      (error as { cameraError?: CameraStartError }).cameraError ?? classifyCameraError(error);
    throw Object.assign(new Error(`camera start failed: ${cameraError}`), { cameraError });
  }
}

/* ------------------------------------------------------------------ *
 * Exponálás: takePhoto → videókocka → null (Post Planner R7 lánca)
 * ------------------------------------------------------------------ */

export interface StillCapture {
  blob: Blob;
  path: "takePhoto" | "frame";
  width: number;
  height: number;
}

interface ImageCaptureLike {
  takePhoto(): Promise<Blob>;
}

export interface CaptureStillDeps {
  /** A böngésző `ImageCapture` konstruktora (hiányzik → nincs takePhoto-út). */
  createImageCapture?: ((track: unknown) => ImageCaptureLike) | null;
  /** Egy kép-blob mérete (px). */
  measure: (blob: Blob) => Promise<{ width: number; height: number }>;
  /** A videó aktuális kockája JPEG-ként, teljes videófelbontáson. */
  frameToBlob: (video: HTMLVideoElement) => Promise<Blob | null>;
}

async function measureWithBitmap(blob: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(blob);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function frameToJpeg(video: HTMLVideoElement): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || !canvas.width || !canvas.height) {
    return Promise.resolve(null);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", FRAME_JPEG_QUALITY));
}

export function browserCaptureDeps(): CaptureStillDeps {
  const Ctor = (globalThis as { ImageCapture?: new (track: unknown) => ImageCaptureLike })
    .ImageCapture;
  return {
    createImageCapture: Ctor ? (track) => new Ctor(track) : null,
    measure: measureWithBitmap,
    frameToBlob: frameToJpeg,
  };
}

/** Az exponálás: takePhoto → kocka (≥ minLongSide) → null (a hívó a natív kamerát nyitja). Sosem dob. */
export async function captureStill(
  options: { track: unknown; video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight">; minLongSide?: number },
  deps: CaptureStillDeps = browserCaptureDeps(),
): Promise<StillCapture | null> {
  const minLongSide = Math.max(1, options.minLongSide ?? MIN_CAPTURE_LONG_SIDE);
  if (options.track && deps.createImageCapture) {
    try {
      const blob = await deps.createImageCapture(options.track).takePhoto();
      const size = await deps.measure(blob);
      if (Math.max(size.width, size.height) >= minLongSide) {
        return { blob, path: "takePhoto", ...size };
      }
    } catch {
      // takePhoto nem támogatott / hibázott → a következő út
    }
  }
  const width = options.video.videoWidth;
  const height = options.video.videoHeight;
  if (Math.max(width, height) >= minLongSide) {
    try {
      const blob = await deps.frameToBlob(options.video as HTMLVideoElement);
      if (blob) {
        return { blob, path: "frame", width, height };
      }
    } catch {
      // a kocka rögzítése hibázott → natív kamera
    }
  }
  return null;
}

/** Blob → dataURL (a meglévő forrásfájl-út a dataURL-t várja). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("A kép beolvasása nem sikerült."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}
