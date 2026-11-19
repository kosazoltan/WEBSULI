# Hang-előmelegítés — a menet közbeni 1–2 mp-es megakadás megszüntetése minden játékban

Állapot: TERV (2026-11-19). Végrehajtási utasítás: `docs/specs/2026-11-19-hang-elomelegites-vegrehajtas.md`.
Előzmény: a Szökőár csiszoló köre (`fix/szokoar-tema-es-sebesseg`, a hangkontextus-megakadás csapda-bejegyzése ott kerül a `docs/agent-csapdak.md`-be).

## Tény (mérve, 2026-11-18)
- A Szökőár CPU-profiljában (long-animation-frame + CDP-mintavételezés, 1× CPU) egyetlen 2038 ms-os képkocka közvetlenül az első
  kérdés megjelenése előtt; ebből 1823 ms a közös `client/src/lib/audioEngine.ts` `getOrCreateAudioContext()`-jében.
- Lánc: a közös kérdés-director `onShow` → `sfxWhoosh()` → `beep()` → az ELSŐ `new AudioContext()`. A konstruktor közvetlenül
  mérve friss böngészőben 380–2018 ms (a hangeszköz megnyitása); az első hang lejátszása 1 ms.
- A hangmotort minden játék lustán használja: az első hang (kérdés-suhogás, első válasz, első kattintás-hang) viszi a költséget a
  menet közepére. A tulajdonos „lagg”-panasza (Kockavadász is) ezzel egybevág.

## Cél
A hangkontextus a játék menüje / betöltése alatt, tétlen időben jöjjön létre minden játékban, amely a közös hangmotort használja;
az első hang menet közben már ne hozzon létre kontextust.

## Nem-cél
- A hangok tartalma, hangereje, a némítás logikája.
- A Szökőár saját ágának egyéb változásai.

## Megoldás
1. `audioEngine.ts`: `prewarmAudio()` — a Szökőár-ágon írt változattal BÁJTRA azonos blokk (összefésülés ütközés nélkül).
2. `audioEngine.ts` végén: `useAudioPrewarm()` horog (tulajdonosi döntés „A”, 2026-11-19: kontextus CSAK felhasználói mozdulat
   után). Már aktivált lapon (`navigator.userActivation.hasBeenActive`) felcsatoláskor `requestIdleCallback`-kel (tartalék:
   `setTimeout`) hívja a `prewarmAudio()`-t; nem aktivált lapon az első VALÓDI aktiváló mozdulat (`touchend` / `click` / `keydown`,
   és ahol a böngésző megmondja, `navigator.userActivation.isActive` igaz) hozza létre. A `pointerdown` érintésnél nem aktiváló
   esemény, ezért nem figyeljük. A drága konstruktor nem a mozdulat figyelőjében, hanem utána (`setTimeout(…, 0)`, az átmeneti
   aktiválás ablakán belül) fut, így a játék bemenete nem vár rá; meglévő, felfüggesztett kontextus folytatása (olcsó) a
   figyelőben marad. A `userActivation` API nélküli böngészőben (régi Safari) a létrehozás a figyelőben marad (ott csak így indul).
   Némított felhasználónál a horog semmit nem hoz létre (a `beep()` is így tesz). Hangot nem ad; hibát nem dob.
3. Bekötés:
   - a közös `useQuestionDirector`-ba (lefedi: Brain Rot, Szólétra, Matek sprint, Szökőár, PlayLab);
   - közvetlenül hangot hívó lapok: Kockavadász (`BlockCraftQuiz`), Aszteroida (`SpaceAsteroidQuiz`), Viharvadász
     (`TornadoHunter200`);
   - párbaj: `components/duel/useDuelFeedback.ts`.
   A Szökőár-lapot nem kell módosítani (a director lefedi) — így a Szökőár-ággal (ahol a lap saját hívása is megvan) nincs ütközés.

## Autoplay-szabály (Chrome, iOS Safari)
- Felhasználói mozdulat nélkül a horog NEM hoz létre kontextust (tulajdonosi döntés „A”: a böngésző különben minden betöltéskor
  konzol-figyelmeztetést ad). Aktivált lapon a konstruktor költsége a menüre esik; nem aktivált lapon az indító koppintásra (az
  aktiváló esemény után, nem a figyelőben) — a menetre egyik esetben sem.
- Az első aktiváló mozdulat után a kontextus fut, így a játék első hangja megszólal; a figyelők a futó kontextusig maradnak.

## Edge case-ek
- WebGL / hang nélküli környezet (`AudioContext` nincs): a hívás csendben semmit nem tesz.
- Többszöri hívás (több horog egy lapon): egyetlen kontextus.
- SSR / teszt (`window` nincs): a horog nem fut, a függvény `null`-lal tér vissza.
- Némított felhasználó: nincs kontextus (sem tétlen időben, sem mozdulatra); feloldás után az első hang hozza létre (a régi út).
- Érintés: `pointerdown` (nem aktiváló) → `touchend` (aktiváló): a kontextus csak a `touchend` után jön létre.
- Leválasztás: a figyelők, a tétlen feladat és a halasztott létrehozás is törlődik.
- iOS „interrupted” állapot (háttérbe kerülés, hívás): meglévő viselkedés, nem e terv része — jegy.

## Elfogadás (EARS)
- AMIKOR egy játék menüje megjelent és a böngésző tétlen, a hangkontextus létrejön (egységteszt: egyszeri létrehozás).
- AMIKOR az első kérdés megjelenik / az első hang szól, a leghosszabb képkocka a kérdés körül mérhetően rövidebb, mint előtte
  (mérés legalább a Kockavadászon és egy másik játékon, előtte / utána).
- A közös mobil mérő érintett játékainak böngészős tesztjei zöldek; `gate:stage`, `gate:push` zöld.

## Tesztek
- `tests/audio-engine-prewarm.test.ts` (a Szökőár-ággal azonos fájl) + `tests/audio-engine-prewarm-hook.test.ts` (a horog: tétlen
  időben egyszer, az első mozdulatra is; hiba nélkül, ha nincs `AudioContext`; vak ellenőr 1. kör: `pointerdown` → `touchend`
  sorrend, halasztott létrehozás `isActive` mellett, némított felhasználó, leválasztás).
