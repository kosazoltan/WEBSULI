# Fényképezős forrásfelvétel a tananyagkészítésben (Post Planner élő kamera technika átvétele)

Állapot: tulajdonosi kérés 2026-10-31 — „építsd be a benne lévő, már kidolgozott fényképezési technikát a websuliba,
hogy tananyagkészítéskor meg lehessen nyitni a telefon saját fényképezőjét … legyen egy kis gomb, amely elindítja ezt a
fényképező- és beolvasórendszert.”

## Cél
A tananyagkészítő űrlapon (`SourceUploadForm` — ezt használja a „Tananyag készítése” fül és a tudás-térkép szerkesztő
is) legyen egy „Fényképezés” gomb: megnyitja a telefon hátsó kameráját az oldalon belül, az admin lefényképezi a
tankönyvoldalakat (akár többet egymás után), és a képek ugyanazon az úton mennek tovább, mint a feltöltött fájlok
(kicsinyítés → `SourceFile(image, dataURL)` → OCR/kivonatolás). Külön fényképezgetés + galériából feltöltés nem kell.

## A Post Plannerből átvett technika (D:\repo\bestpostplanner, 2026-10-31-i main, e57137c5)
A forrás: `client/src/lib/camera/cameraSession.ts` és `captureStill.ts` (spec:
`docs/specs/2026-10-22-elo-kamera-eszkozprofil.md`). Az átvett, bizonyított elemek:
1. **Kamera-munkamenet:** indítás felhasználói gesztusra, `getUserMedia({ video: { facingMode: environment,
   3840×2160 ideal } })`; engedély után a hátsó kamerák közül választás (címke: back/rear/environment/hátsó), az
   elmentett eszköz (localStorage, kényelmi) előnyben; `getCapabilities()`-ből CSAK a támogatott constraint-ek:
   folyamatos fókusz, torch ki; hiba-besorolás (permission / no_camera / busy / unsupported / failed).
2. **Exponálási lánc:** `ImageCapture.takePhoto()` (teljes felbontás, Android Chrome) → ha nincs/kicsi, a videó
   aktuális kockája canvasról JPEG-ként (ha a hosszabb él ≥ 1600) → különben natív kamera-fallback.
3. **Natív fallback:** ha a kamera nem indul (engedély megtagadva, nincs kamera, asztali gép), rejtett
   `<input type="file" accept="image/*" capture="environment">` nyílik — telefonon ez a rendszer-kamera.

NEM vesszük át: élő elemzés (worker, liveFrameGate), minőségkapu (photoQualityGate), telemetria, kameraprofil-admin —
ezek a Post Planner ékszerfotós munkafolyamatához kötöttek; a tankönyv-OCR-hez a meglévő szerveroldali OCR a kapu.

## Nem-cél
- Szerveroldali változás: a képek a meglévő `/api/studio/maps/extract` és `/api/studio/lessons/one-step` útvonalon
  mennek, `image` fajtájú `SourceFile`-ként. Új végpont, séma, migráció nincs.
- Minőségkapu/élességmérés a kliensen; több-oldalas dokumentumszkennelés (perspektíva-korrekció).
- A Post Planner kódjának függőségként való behúzása: a technika kerül át, önálló, WebSuli-beli modulként.

## Működés
1. Új tiszta modul: `source/client/src/lib/camera-capture.ts` — a Post Planner `cameraSession` + `captureStill`
   portja, injektálható függőségekkel (MediaDevicesLike, CaptureStillDeps), hogy node:test alatt DOM nélkül
   tesztelhető legyen. A kicsinyítési küszöb a meglévő `DOWNSCALE_MAX_EDGE`-hez (1600) igazodik: a kocka-út
   minimuma is 1600 (a 2048-as Post Planner-minimum az ő nagyfelbontású igényük volt).
2. Új komponens: `source/client/src/components/studio/CameraCaptureDialog.tsx` — teljes képernyős dialógus: élő
   előnézet (`<video playsInline muted>`), exponáló gomb, az elkészült képek bélyegsora, „Kész” és „Mégse”.
   Több kép készíthető egy munkamenetben (tankönyv-oldalanként egy). Bezáráskor/elnavigáláskor a stream leáll.
3. `SourceUploadForm`: a „Fájlok kiválasztása” mellett kis „Fényképezés” gomb (Camera ikon). Kameraindítási hibánál
   a dialógus bezár, és a rejtett natív capture-input nyílik meg; az onnan érkező fájl a meglévő `addFiles` úton
   megy. A dialógus képei dataURL-ként a meglévő `downscaleImage`-en át kerülnek a `files` listába
   (`fenykep-<időbélyeg>-<sorszám>.jpg`).
4. A gomb mindkét beágyazásban (LessonStudioPanel, KnowledgeMapEditor) automatikusan megjelenik, mert a közös
   űrlapba kerül.

## Biztonság és adatvédelem
- A kamerakép CSAK a böngészőben él; a szerverre a meglévő úton, kicsinyített JPEG dataURL megy (mint a feltöltésnél).
- Kameraengedélyt csak a gombnyomás (felhasználói gesztus) kér; a stream a dialógus zárásakor azonnal leáll.
- Az elmentett kamera-eszközazonosító (localStorage) kényelmi adat, try/catch mögött; hiánya nem hiba.
- getUserMedia csak biztonságos kontextusban (https / localhost) él — a WebSuli https-en fut; nem támogatott
  környezetben a natív fallback jön.

## Edge case-ek
- Engedély megtagadva / nincs kamera / a kamerát más app fogja → besorolt hiba, toast + natív capture-input.
- Asztali gép webkamera nélkül → ugyanez a fallback (fájlválasztó nyílik).
- `ImageCapture` nem támogatott (iOS Safari) → canvas-kocka út; ha a videófelbontás < 1600, natív fallback.
- A dialógus nyitva, a felhasználó elnavigál / bezárja a fület → a cleanup leállítja a trackeket.
- Több kép azonos másodpercben → a fájlnévben sorszám is van (a `files` név-egyediségre szűr).
- A gyártás futása alatt (`busy`) a gomb tiltva, mint a többi beviteli elem.

## Elfogadás (EARS)
- HA az admin a „Fényképezés” gombra nyom ÉS a kamera elindul, AKKOR élő előnézetet lát, és az exponálás után a kép
  bekerül a forrásfájl-listába `image` fajtaként (badge látszik), kicsinyítve (leghosszabb él ≤ 1600).
- HA a kameraindítás hibával jár, AKKOR a natív `capture="environment"` fájlbekérő nyílik meg, és az onnan választott
  kép ugyanúgy a listába kerül (teszt: hiba-besorolás; kézi próba: fallback-út).
- HA a dialógus bezárul (Kész/Mégse/unmount), AKKOR minden médiatrack leáll (teszt: stopStream fake trackekkel).
- HA a videókocka hosszabb éle < 1600 ÉS takePhoto nincs/kicsi, AKKOR az exponálás null-t ad és a natív út jön (teszt).
- A tiszta modul (kamera-választás, hiba-besorolás, exponálási lánc) node:test alatt, DOM nélkül tesztelt.
