# Spec: korszerű üdvözlő kártya és játékkártyák; az admin (szülő) mindig az összes tananyagot látja

> Dátum: 2026-11-03 · Szerző: Claude (Kósa Zoltán kérésére: „Ezt a két régi, elavult kártyarendszert is modernizáld, illetve Kósa
> Zoltán admin nem egyenlő Kristóffal. Tehát én mindig az összes tananyagot lássam. Én szülő vagyok.”) · Állapot: JÓVÁHAGYVA

## Tények (forrásból)

- **A tulajdonos telefonja párosítva van Kristóf tanulói linkjével** (`websuli.learnerToken`, docs/specs/2026-10-18-tanuloi-profil.md):
  - a `LearnerProfileSync` a profil évfolyamát (9.) írja az eszköz évfolyamába (`websuli.classroomGrade`);
  - a `UserFileList` (docs/specs/2026-10-18-tanulo-evfolyam-szuro.md) erre az évfolyamra szűrve nyit → csak 10 anyag látszik;
  - a `WelcomeCard` (review #301) a párosított profil nevét mutatja bejelentkezett fiók mellett is → „Szia, Kristóf!”, Kristóf
    sorozatával.
- **Fiókok:** nincs nyilvános regisztráció; a fiók lehet tanulói is (a `tests/welcome-card.spec.ts` „bejelentkezett tanuló”
  esete, `isAdmin: false`). A szülő / tulajdonos fiókja admin (`isAdmin: true`).
- **A két régi kártyarendszer** a `.glass-card` stílust használja (fekete, narancs keret, cikcakk-mintás `::before`):
  - az üdvözlő kártya (`WelcomeCard.tsx`);
  - a „Gyakorló játékok” rács (`HomePracticeGames.tsx`): 10–12 px-es szöveg, 24 px-es nehézségi gombok.
- **Az új nyelv** (#388): sötétkék–ibolya üvegpanel (`.hero-bar`, `.sponsor-bar`), hajszálkeret, 20 px sarok, minta nélkül.

## 1. Cél

- **Admin = szülői nézet** (`isAdmin`):
  - a lista mindig „Mind” szűrővel nyílik, az eszköz / párosított tanuló évfolyamától függetlenül; a kézi évfolyamválasztás
    működik, és a lista frissítése nem írja felül;
  - az üdvözlő kártya a fiók keresztnevével köszön (vagy a fiókhoz kötött kézi felülírással), nem a párosított tanulóéval;
  - az ajánló az összes évfolyam legújabb anyagait mutatja („A legújabb tananyagok”);
  - a párosított tanuló sorozata nem jelenik meg „neked” szólóként;
  - a módosító űrlapon nincs évfolyamválasztó: az eszköz évfolyama a gyereké, a játékok azt használják.
- **Az üdvözlő kártya új kinézete** (`.home-panel`, a fejléc nyelvén):
  - balra monogram-jelvény (a név kezdőbetűje, borostyán színátmenet), mellette a „Szia, …!” cím és a motiváló mondat;
  - a sorozat lángos chip;
  - a „Nem te vagy? Módosítás” üveg pirulagomb (44 px);
  - az ajánlott anyagok mini-kártyák: 64×64-es borító-bélyegkép (a lista bélyegképe), „Új” jelvény, cím (legfeljebb 2 sor),
    évfolyam-chip, nyíl;
  - a névkérő űrlap ugyanebben a panelben, a mezők üvegstílusúak.
- **A játékkártyák új kinézete:**
  - **kártya:** közös `.game-card` osztály, játékonként saját kiemelőszín (`--gc`), sötét üvegpanel minta nélkül, finom
    színes felső fény, 48 px-es ikonlap, pirula-jelvény (MIX, HU↔EN…);
  - **szöveg:** 16 px-es cím, 13–14 px-es leírás, lábléc kiemelőszínű „Indítás →” felirattal;
  - **hover:** keret és emelés (csak `no-preference`-nél);
  - **Szökőár:** a három nehézségi gomb 40 px magas pirula;
  - **szakaszfej:** ikonlap + cím + leírás + „Játékok menü →” pirula-link;
  - **rács:** 2 / 3 / 4 oszlop (mobil / sm / xl), 12 px rés.

## 2. NEM cél

- **A tanulói (nem admin) működés változatlan:**
  - évfolyamra szűrt nyitás;
  - a párosított profil neve és sorozata;
  - az évfolyam nem törölhető.
- A tananyagkártyák (`material-card-cell`) nem változnak.
- A játékok útvonalai és a 7 játék listája nem változik.

## 3. Érintett fájlok

- `source/client/src/components/UserFileList.tsx` (admin → „Mind”)
- `source/client/src/components/WelcomeCard.tsx` (admin-nézet + új kinézet)
- `source/client/src/components/HomePracticeGames.tsx` (új kinézet)
- `source/client/src/index.css` (`.home-panel`, `.welcome-*`, `.game-*`)
- `source/tests/welcome-card.spec.ts` (új e2e eset: admin párosított eszközön)
- `source/tests/home-cards-modern.test.ts` (új forrásszintű teszt)

## 4. Edge case-ek

- **Az auth még töltődik:** az első renderben nem admin → a tanuló szűrője érvényesül; amint kiderül, hogy admin, egyszer
  „Mind”-re vált, utána a kézi választást nem írja felül.
- **Kijelentkezés után:** az eszköz évfolyama újra érvényes.
- **Adminnak nincs keresztneve a fiókban:** a névkérő űrlap jelenik meg (csak név, évfolyam nélkül).
  - Review #389: a böngészőben tárolt név sem tartalék (a párosításkor a gyerekére állítódik) — csak a fióknév vagy a fiókhoz
    kötött felülírás. Az ajánló bélyegképe sikeres újratöltéskor újra látszik (`onLoad`), mint a listán.
- **Nincs bélyegkép-URL** (régi szerver): a `/api/design-assets/<borító vagy sávhős>/thumb` tartalék, mint a listán.
- **Csökkentett mozgás:** nincs hover-emelés.

## 5. Elfogadás (EARS)

- WHEN admin fiók van bejelentkezve egy tanulóhoz párosított eszközön, THEN a lista „Mind” szűrővel SHALL nyílni, az üdvözlés a
  fiók nevét SHALL mutatni, és az ajánló az összes évfolyamból SHALL válogatni.
- WHEN nem admin a felhasználó, THEN a meglévő évfolyamszűrős és profilnév-viselkedés SHALL változatlan maradni (a meglévő
  `welcome-card.spec.ts` esetek zöldek).
- WHEN a főoldal betölt, THEN az üdvözlő kártya és a játékkártyák `.home-panel` / `.game-card` stílusúak SHALL lenni, cikcakk-minta
  (`.glass-card`) nélkül, és 320–1440 px között nem SHALL lenni vízszintes túlcsordulás.

## 6. Tesztterv

- **E2E, új eset** (`tests/welcome-card.spec.ts`): párosított token + `/api/learner/me` (Kristóf, 8.) + admin fiók → „Szia,
  Zoltán!”, `button-filter-all` aktív, az 5. osztályos anyag is látszik, nincs `welcome-streak`. Ugyanez nem admin fiókkal:
  szűrő a 8.-on, „Szia, Kristóf!”.
- **Forrásszintű teszt** (`tests/home-cards-modern.test.ts`): a `WelcomeCard` és a `HomePracticeGames` nem használ
  `glass-card`-ot; minden játékkártya `game-card`; a nehézségi gombok ≥ 40 px.
- **Futtatás:** `npx tsc --noEmit` (app + teszt), eslint, `npm test`; a módosított e2e fájl futtatása helyben.
- **Böngésző:** 320 / 375 / 768 / 1280 px, admin és névtelen állapot.

## 7. Kockázatok / visszavonás

- A tanulói viselkedést a meglévő e2e esetek őrzik. Visszavonás: a merge commit revertje.

## 8. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-03-udvozlo-jatekkartyak-szulo-vegrehajtas.md`
