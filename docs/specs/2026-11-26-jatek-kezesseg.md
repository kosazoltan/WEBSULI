# Játékok kezessége: a joystick ÉS a tűz / segédgombok a választott kézhez (2026-11-26)

## Kérés
Tulajdonos (2026-11-25, `JATEK-KEZESSEG`): „ellenőrizni, hogy a joystick és a tűz / segédgombok oldala követi-e a kezességet (bal kézzel
rossz az irányítás; a tűz és a segédgombok nem kerültek át)”.

## Felmérés (mérve a mainen, 2026-11-26)
Az öt joystickos játék érintővezérlője (`data-game-controls`):

| Játék | Joystick | Akciógombok | Kezesség-beállítás |
|---|---|---|---|
| Galaktikus Aszteroida (`SpaceAsteroidQuiz.tsx`) | bal | Bomba + TŰZ jobbra (`.sa-actions`) | **nincs** — balkezesnek a tűz a rossz kézben |
| Kockavadász (`BlockCraftQuiz.tsx`) | bal | Lerak / Bányász / Ugrás ív jobbra (`.bc-actions`) | **nincs**; a kérdés-sáv számítása (`belowBand`) a „tárcsa bal, ugrás jobb” elrendezést feltételezi |
| Cunami-futás (`TsunamiEscapeEnglish.tsx`) | bal | UGRÁS jobbra | **nincs** |
| Tornádóvadász (`TornadoHunter200.tsx`) | `leftHanded` szerint | Kamera + ⚓ a másik oldalon | van (saját haladás-beállítás) — tükröz |
| Brainrot-lopás (`BrainRotSteal.tsx`) | `websuli.brainrot.hand` szerint | oldalsáv (szünet, állapot) a másik oldalon | van (saját kulcs) — tükröz |

A beállítás tehát csak két játékban létezik, és játékonként külön: aki az egyikben balkezesre állít, a többiben jobbkezes elrendezést kap,
a három játékban pedig egyáltalán nem tud váltani.

## Cél
1. **Közös kezesség-preferencia** (`client/src/game-engine/handedness.ts`): `websuli.game.hand` = `left` | `right` (alap: `right`), tárolóhiba
   esetén alapérték; régi játékkulcs (Brainrot) olvasása tartalékként, írás mindkettőbe.
2. **Mindegyik joystickos játékban** a kezdőképernyő beállításai között ugyanaz a kétgombos választó (`HandednessPicker`,
   `data-testid="game-hand-left" / "game-hand-right"`, `aria-pressed`), a Brainrot meglévő gombjai a közös állapotot kapják.
3. **Tükrözés:** balkezesnél a joystick a JOBB, minden akció- / segédgomb (tűz, bomba, ugrás, bányász, lerak, kamera, ⚓, szünet-oldalsáv) a BAL
   oldalra kerül; az akciócsoporton belül a fő gomb (tűz / ugrás) a képernyő széléhez kerül (a hüvelykujj természetes helye).
4. A Kockavadász kérdés-sávja (`belowBand`) a két vezérlő TÉNYLEGES helyéből számol (bármelyik oldalon áll a tárcsa).
5. A Tornádóvadász kezesség-váltása a közös preferenciát is írja, friss haladásnál a közös preferenciából indul.

## Nem cél
- Billentyűzet / egér vezérlés (ott nincs oldalisság).
- Új vezérlőelemek, méretek — csak az oldal.

## Szeletek
- **JK-1:** közös modul + választó; Aszteroida és Cunami tükrözése; Brainrot és Tornádó a közös preferencián.
- **JK-2:** Kockavadász tükrözése (az akció-ív és a kérdés-sáv számítása).

## Elfogadás (mérve, érintős Pixel 7 profil, 390×844 és 844×390)
- [ ] Mind az öt játékban jobbkezesnél a joystick középpontja a bal, minden akciógombé a jobb képernyőfélen; balkezesnél fordítva
      (`tests/game-handedness.spec.ts`, a beállítás a kezdőképernyő választójával és tárolt preferenciával is).
- [ ] A preferencia játékok között közös: az egyik játékban választott bal kéz a másikban is érvényes.
- [ ] A Kockavadász kérdés-sávja balkezesnél is a tárcsa és az ugrás között, átfedés nélkül.
- [ ] A meglévő mobilminőségi (`game-mobile-quality.spec.ts`) és Brainrot-kezesség teszt változatlanul zöld.
