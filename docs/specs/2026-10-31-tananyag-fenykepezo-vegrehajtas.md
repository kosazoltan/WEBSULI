# Végrehajtási utasítás — Fényképezős forrásfelvétel a tananyagkészítésben

Terv: `docs/specs/2026-10-31-tananyag-fenykepezo.md`. Forrásminta: `D:\repo\bestpostplanner`
(`client/src/lib/camera/cameraSession.ts`, `captureStill.ts`) — PORT, nem import.

## 1. `source/client/src/lib/camera-capture.ts` (új, tiszta modul)
A Post Planner mintájából átvett részek, WebSuli-ra igazítva:
- Típusok: `CameraCapabilities`, `CapsLike` (egyszerűsítve, capsReport-telemetria nélkül), `VideoInputLike`,
  `TrackLike`, `StreamLike`, `MediaDevicesLike`, `CameraStartError`.
- `classifyCameraError(error)`: NotAllowed/Security → permission; NotFound/Overconstrained → no_camera;
  NotReadable/Abort → busy; TypeError/NotSupported → unsupported; egyéb → failed.
- `rearCameras`, `chooseCamera` (elmentett deviceId előnyben), `stopStream` (sosem dob).
- `startCamera(mediaDevices, preferredDeviceId)`: environment 3840×2160 ideal; engedély után váltás a választott
  hátsó kamerára; `getCapabilities()`-ből csak a támogatott: `focusMode: continuous`, `torch: false` (zoom-ot nem
  állítunk — tankönyvfotónál az alap látószög kell); `applyConstraints` hibája nem akadály. Hibánál a félig nyitott
  stream leáll, `{ cameraError }`-ral dob.
- `CAMERA_DEVICE_STORAGE_KEY = "websuli.cameraDeviceId"`; `readPreferredCamera()` / `savePreferredCamera(id)`
  try/catch-ben.
- `captureStill({ track, video, minLongSide = 1600 }, deps)`: takePhoto → mérés → ha ≥ minLongSide, kész;
  különben videókocka (canvas, JPEG 0.95) ha ≥ minLongSide; különben null. `browserCaptureDeps()` a DOM-os
  implementáció (ImageCapture-konstruktor, createImageBitmap, canvas) — a tiszta mag fake deps-szel tesztelhető.
- `blobToDataUrl(blob)` segéd (FileReader) a dialógusnak.

## 2. `source/client/src/components/studio/CameraCaptureDialog.tsx` (új)
- Props: `{ open: boolean; onClose(): void; onDone(photos: { name: string; dataUrl: string }[]): void; onFallback(error: CameraStartError): void }`.
- Nyitáskor `startCamera(navigator.mediaDevices, readPreferredCamera())`; siker → `video.srcObject = stream`,
  `savePreferredCamera`; hiba → `onFallback(cameraError)` és zárás.
- Teljes képernyős réteg (fixed inset-0, fekete), `<video playsInline muted autoPlay>`; alul: nagy exponáló gomb
  (`captureStill` → bélyeg a sorban), „Kész (N)” (→ `onDone`), „Mégse”. `captureStill` null → toast helyett
  `onFallback("unsupported")`.
- Cleanup: zárásnál és unmountnál `stopStream`; az elkészült képek dataURL-ként state-ben (a dialóguson belül
  nincs kicsinyítés — azt a hívó meglévő `downscaleImage`-e végzi).
- `data-testid`: `camera-dialog`, `camera-shutter`, `camera-done`, `camera-cancel`.

## 3. `SourceUploadForm.tsx` módosítás
- Új state: `cameraOpen`. Új rejtett input: `type="file" accept="image/*" capture="environment"`
  (`nativeCameraInput` ref), `onChange` → meglévő `addFiles`.
- A „Fájlok kiválasztása” gomb mellé kis gomb: `variant="outline"`, Camera ikon + „Fényképezés”,
  `disabled={busy}`, `data-testid="camera-open"`, `onClick={() => setCameraOpen(true)}`.
- `onDone(photos)`: minden fotóra `downscaleImage(dataUrl)` → `setFiles` `image` fajtával,
  név: `fenykep-<yyyyMMdd-HHmmss>-<i>.jpg`; majd zárás. `onFallback`: toast (magyar, ok szerint) +
  `nativeCameraInput.current?.click()`.

## 4. Tesztek — `source/tests/camera-capture.test.ts` (node:test, DOM nélkül)
- `classifyCameraError`: mind az 5 ág.
- `rearCameras`/`chooseCamera`: címke-szűrés, elmentett eszköz előnye, üres lista.
- `stopStream`: hibát nyelő leállítás, null-tűrés.
- `startCamera` fake MediaDevicesLike-kal: sikeres indítás + váltás a hátsó kamerára; constraint csak támogatott
  kulcsokra; engedélyhiba → permission + minden track leállítva.
- `captureStill` fake deps-szel: takePhoto-út; kicsi takePhoto → kocka-út; kicsi kocka → null; hibázó takePhoto
  → kocka-út.

## 5. Ellenőrzés
- `node --import tsx --test tests/camera-capture.test.ts` a `source`-ból; majd teljes `npm test`;
- `npm run lint` (max-warnings 0), `npm run check`, `npm run check:test`;
- UI-szabály (AGENTS): valódi böngészős render-próba — dev szerver + Browser pane: a gomb látszik a
  tananyagkészítés űrlapon, mobil nézetben nem csúszik szét; kamera a panelben nem elérhető → a fallback-út
  (natív input kattintás) ellenőrizhető.

## Tilos
- Szerver/séma/végpont változtatása; a Post Planner repo módosítása; teszt gyengítése;
- a Post Planner worker/minőségkapu/telemetria átemelése (nem-cél).
