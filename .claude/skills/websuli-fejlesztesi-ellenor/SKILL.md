---
name: websuli-fejlesztesi-ellenor
description: WEBSULI vak hibakereső független ellenőr (AGENTS.md „Vak hibakereső ellenőr — kötelező”, minden ügynök-környezetben). Töltsd be automatikusan MINDEN elkészült fejlesztésnél / javításnál (zöld helyi kapuk után), a PR megnyitása előtt és minden érdemi javító push előtt — kész, kitölthető megbízás-sablonnal egy friss, VAK (csak a követelményt és a diffet kapó) ellenőrnek, akinek a feladata HIBÁT TALÁLNI. A fejlesztő maga nem ellenőrizheti magát.
---

# Fejlesztési ellenőr — független alügynökös ellenőrzés a PR előtt

Tulajdonosi utasítás (2026-11-17, kötelező): minden fejlesztés után automatikusan egy FÜGGETLEN alügynök ellenőrizze az elkészült
munkát, hogy a hibák ne utólag derüljenek ki. Mért ok: a 2026-11-16/17-i játékhullám öt PR-jából négynél a független review a zöld CI
UTÁN talált blokkoló hibát; minden ilyen kör 1–1,5 óra CI + egy újabb review-kör volt
(`docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`, `docs/agent-csapdak.md` C-61…C-72). Runbook: `docs/minosegkapuk.md`.

## 0. Ki az ellenőr — KIZÁRÓLAG a futtató (tulajdonosi utasítás 2026-11-18)

A vak ellenőrt nem alügynök és nem új munkamenet végzi, hanem a futtató: `npm run gate:blind-review` (skill: `websuli-vak-ellenor`
— a parancs, a `--goal` fájl sablonja, teendők az ítélet szerint és ha a futtató megáll). A futtató a `gates.config.json`
`blindReview.model` modelljével dolgozik (független, nem Anthropic), és ENNEK a skillnek a 3. szakaszában álló megbízás-sablont
olvassa be rendszerüzenetnek — a sablon egyetlen forrása ez a fájl. Más úton készült jelentést a `record-review.mjs` nem rögzít.

## 1. Mikor kötelező

- Minden fejlesztés / javítás elkészültekor, a PR megnyitása ELŐTT (a `pre-pr-gate` és a `gh pr create` hook ítélet nélkül nem enged).
- Minden érdemi javító push előtt (review-lelet, CI-hiba javítása): visszaellenőrzés ugyanattól az ellenőrtől, az új fejre.
- A merge előtt az ítéletnek a PR JELENLEGI fejére kell szólnia (`pre-merge-gate`).
- A fejlesztő (vagy az az ügynök, amelyik a kódot írta) nem lehet a saját ellenőre.

## 2. Előfeltétel — az olcsó helyi kapuk előbb (API-költség elve)

Az ellenőr NE olcsó hibákra pazarolja a keretet. Indítás előtt zöldnek kell lennie:

```bash
npm run gate:stage          # szakasz-kapu (gyors)
npm run gate:push           # teljes helyi kapu: lint, tsc, teljes unit, háromfázisú rend, friss main
```

Játék- / UI-szeletnél a CI-azonos böngészős utat is futtasd le előbb (a `pre-pr-gate` futtatja; a pontos parancsot kiírja). Ezek az
eredmények a FEJLESZTŐ előfeltételei — az ellenőrnek NEM adod át (vak ellenőr, 3. szakasz): amit állítani akar, azt maga futtatja.

## 3. A megbízás — VAK, HIBAKERESŐ ellenőr (másold, töltsd ki, add egy FRISS kontextusú alügynöknek)

Tulajdonosi utasítás (2026-11-18): „mindig egy vak alügynök ellenőrizze az elvégzett munkádat, hogy biztosan megtalálja a hibákat …
Lehet Anthropic modell, de akkor azt nagyon úgy utasítsd, hogy mindenképpen hibát keressen.”

**VAK** = az ellenőr CSAK a követelményt (terv / tulajdonosi cél) és a diffet / fejet kapja. NEM kapja meg: a fejlesztő jelentését,
összefoglalóját, önértékelését, „zöld” állításait (kapu-eredmény, tesztszám, CI), a fejlesztő által „ismert kockázatnak” mondott
pontokat, sem az orkesztrátor várakozását („szerintem jó”, „csak gyorsan nézd meg”). Amit a fejlesztő állít, azt az ellenőrnek magának
kell mérnie. Mindig friss kontextusú alügynök (nem az, amelyik a kódot írta, és nem a fejlesztő folytatása).

```text
Független, VAK, HIBAKERESŐ ellenőr vagy a kosazoltan/WEBSULI repóban (NYILVÁNOS repó). Magyarul dolgozz és jelents.

A FELADATOD HIBÁT TALÁLNI, NEM MEGERŐSÍTENI. Abból indulj ki, hogy a munkában van hiba, és a te dolgod megtalálni. A „rendben van”
csak akkor elfogadható, ha felsorolod, mit próbáltál megtörni, és az miért nem sikerült. Udvariasság, a fejlesztő szándéka vagy a
„biztos jó” nem szempont.

CSAK OLVASÓ a fejlesztő munkafájára és a GitHubra: ott semmit nem módosítasz, nem commitolsz, nem pusholsz, nem kommentelsz.
Futtatni és ellenpróbázni SAJÁT ideiglenes munkafában / klónban szabad és kell: <SCRATCHPAD>/review-<PR-vagy-ág>/ (a D:\ és a
D:\repo gyökerébe semmit).

Amit kapsz (más nem jár):
- Követelmény: <docs/specs/…md> (+ végrehajtás: <…-vegrehajtas.md>), tulajdonosi cél szó szerint: „<idézet>”
- Ág / fej: <ág> @ <teljes fej-hash>; a diff: git diff origin/main...<fej>

Hibakereső pontok — mindegyikre írj ítéletet (talált hiba / próbáltam, nem sikerült megtörni / nem alkalmazható) bizonyítékkal:
1. Adatszerződés a lépések között (mezőnevek, formátumok, típusok; kliens ↔ szerver ↔ DB, szkript ↔ konfig).
2. Biztonság és adatvédelem (token / titok / személyes adat URL-ben, naplóban, linkben, nyilvános repóban; CSRF / origin; GET-mellékhatás).
3. Regresszió a meglévő folyamatokban (névtelen / bejelentkezett felhasználó, régi anyag, Stúdió-lecke, a közös modul többi hívója).
4. Időzóna és dátumhatár (Europe/Budapest).
5. Migráció ↔ Drizzle-séma; indítás / cron / leállítás; e2e-mód.
6. Versenyhelyzet, párhuzamosság, ismételt / megszakadt futás, időtúllépés.
7. Tesztminőség: a teszt a viselkedést méri-e (mutációval próbáld: ha kiveszed a védő sort, bukik-e?); gyengítettek-e tesztet; a
   spec-változás dokumentált-e.
8. <a diffhez igazított, feladat-specifikus pontok — pl. játéknál a skill 4/A pontjai; hooknál a valódi héj; felületnél a képernyő>
9. Bármi más, amit a fenti lista nem fed — keress aktívan olyan hibát is, amire a lista nem gondolt.

Szabályok:
- Minden lelet fájl:sor hivatkozással és konkrét hibaforgatókönyvvel (ki, milyen eszközön, mit csinál, mi történik).
- Kritikus / magas leletnél előbb próbáld MEGCÁFOLNI (keresd a védelmet, futtass próbát); csak megerősítés után jelentsd.
- Számszerű állítást mérj vagy számolj, és írd le, hogyan. A mérce a tulajdonosi cél / terv; felületi változásnál nézd meg a
  képernyőképeket (álló és fekvő nézet), ne csak a tesztet.
- Ne találj ki fájlt, függvényt, eredményt; a bizonytalant jelöld UNVERIFIED-nek.
- A jelentést ide írd: <SCRATCHPAD>/review-<PR-vagy-ág>/jelentes.md

A jelentés formája (a record-review.mjs a „Fej:” sort, az „Ítélet:” sort és a két „Mit …” fejlécet gépileg ellenőrzi):
# Független review — <ág / PR>
Fej: <teljes fej-hash>
## Ítélet: IGEN | IGEN, FELTÉTELLEL | NEM
(NEM, ha van blokkoló; FELTÉTELLEL, ha a nem blokkoló leletek jegyre mennek)
## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)
## A hibakereső pontok (ítélet + bizonyíték)
## Mit próbáltam megtörni, és nem sikerült
## Mit NEM vizsgáltam
(ok + kockázat)
## Megcáfolt gyanúk
## Mit futtattam (parancs + eredmény)
```

### 3/b. Ha nincs alügynök-eszköz (pl. egyes Codex / Cursor / Gemini futások)

**FELÜLÍRVA (2026-11-18):** alügynök-eszközre nincs szükség — minden környezetben a futtató az ellenőr (`npm run gate:blind-review`,
0. szakasz). Az alábbi lépések csak a történeti leírás; ítéletet a futtató bizonyítéka nélkül a `record-review.mjs` nem rögzít.

1. Nyiss új, tiszta munkamenetet / feladatot (vagy másik eszközt) — NE a fejlesztés beszélgetését folytasd.
2. Add át CSAK: a fenti sablont kitöltve, a terv útvonalát (vagy a tulajdonosi cél idézetét), az ágat és a teljes fej-hash-t. A
   fejlesztés összefoglalóját, a „zöld” állításokat és a saját véleményedet NE.
3. Az ellenőr a saját ideiglenes munkafájában / klónjában futtat; a jelentését a sablon formájában adja.
4. Az ítéletet a fejlesztő-oldal rögzíti: `node scripts/qa/gates/record-review.mjs --head <fej> --verdict … --report <jelentés.md>`
   (a szkript a hiányos jelentést elutasítja). Ha egyik út sem érhető el, a munka nem nyitható PR-ra — kérj segítséget a
   tulajdonostól.

## 4. Kötelező ellenőrzőlista (a mért hibatípusokból)

### A) Játékszeletnél (a 2026-11-16/17-i review-k blokkoló leletei)

1. **Véletlen válasz** — a játék nem vesz válasznak olvasás / szándék nélküli bemenetet: van élesítési idő a kérdés / célpont
   megjelenése után (≥ 400 ms előjelzés, KSZ-11); a kérdés ELŐTT indított bemenet (tartott tűz, már repülő lövedék, folyamatban lévő
   bányászás, mozgás alatt nyíló ketrec) nem számít; a húzás nem koppintás (`pointerTap`: `inside && notMoved`, nem `||`); passzív
   átfutás nem válasz. (#483 M1, #484 B1, #485 B1, #486 M2)
2. **Kupon (lecke-jutalom) mód** — a kérdések nem fogynak el a menet közben: kimerüléskor ismétlés (a legrégebben látott), menetközi
   ismétlés a lecke-tételekből; a sim is kupon-módban mérjen. (#483 M2, #484 M5)
3. **Levágott / takart válasz** — a beférés-ellenőrzés a VALÓDI elem szélességével számol (kapu-tábla, ketrec, rúnagomb — nem a közös
   kérdés-sáv gombjával), álló 360×640 / 390×844 és fekvő 844×390 nézetben; a bank LEGHOSSZABB válaszaival mérve (évfolyam-bank,
   tananyag); `line-clamp` nem vághat le olvashatatlanul; a kérdéskártya nem takarja a válaszokat. (#483 M3, #485 B2)
4. **A szimuláció a lapot méri** — ugyanaz a mag / seed-kulcs, ugyanazok a szabályok (pickupok, bányászás, ütközés, vereség,
   időkeret) a sim-ben és a lapon; a sim-szám csak akkor bizonyíték, ha a modell a lap viselkedését követi. (#484 H1, #486 M3)
5. **Győzelem → vereség ugyanabban a lépésben** — a menet vége után (győzelmi animáció, `finishRunAfter`) semmilyen találat / életvesztés
   nem írhatja át az eredményt (`runOverRef` őr minden eseménykezelőben). (#486 M1)
6. **Megállítási okok** — szünet, magyarázat, kibontott kérdés, lejárt kupon, háttérbe kerülés egymást nem oldják fel (egy ok
   megszűnése nem indítja el a játékot, amíg más ok fennáll); közös `GAME_HALT_EVENT` / `requestGameFrame` út; a szünet a 3D-rajzolást
   is megállítja. (C-66)
7. **CI-azonos böngészős út** — a változott játék mobil mérő esetei + meta-mérő + lejárt-kupon spec szoftveres WebGL-lel (SwiftShader),
   buildelt szerveren, `--workers=1` zöld (a `pre-pr-gate` futtatja); időtartam-állítás a lapon belül, képkockánként (C-65); a lassú
   CI-hibát CPU-lassítással (4–6×) reprodukálva.

### B) Általános (`AGENTS.md` „Review guidelines”)

8. **Adatszerződés** a lépések között: mezőnevek, formátumok, típusok (kliens ↔ szerver ↔ DB).
9. **Biztonság és adatvédelem**: token / titok / személyes adat URL-ben, naplóban, linkben; CSRF / origin; mellékhatás GET-en;
   valódi e-mail-cím a nyilvános repóban.
10. **Regresszió**: névtelen látogató, bejelentkezett felhasználó, régi anyag, Stúdió-lecke; a közös modul (game-engine, director)
    többi felhasználója.
11. **Időzóna és dátumhatár** (Europe/Budapest).
12. **Migráció ↔ Drizzle-séma** összhang; eldobható DB-n futtatott integrációs teszt.
13. **Indítás / cron / leállítás és e2e-mód** (`WEBSULI_E2E=1`), graceful shutdown.
14. **Repó-szintű őr-tesztek** (`*-guard.test.ts`): a friss mainnel összefésült állapoton is zöldek (C-61) — a `pre-push-gate` méri.
15. **Tesztek ereje**: a teszt a viselkedést méri, nem tautológia; tesztet nem gyengítettek; a SPEC-VÁLTOZÁS indokolt és dokumentált.
16. **Hatókör**: a diff nem nyúl közös / más szelet fájljához indokolatlanul; nem írt a D:\ gyökerébe; mutációs ellenpróba nem
    `git checkout`-tal (C-70).

## 5. Visszaellenőrzés

- A javított fejet UGYANAZ az ellenőr kapja (SendMessage a meglévő alügynöknek), a `git diff <régi-fej> <új-fej>` kiindulással —
  továbbra is VAKON: a fejlesztő javítási összefoglalóját / „javítva” állításait nem kapja, csak az új fejet és a diffet.
- A keret visszanézésnél is HIBAKERESÉS: nem a korábbi leletek kipipálása, hanem új hiba keresése a javításban és körülötte (a javítás
  gyakran új hibát hoz: C-68), és minden korábbi lelet lezárásának saját mérése.
- A jelentés végére új szakasz: `# Visszaellenőrzés — új fej <hash>`, benne új `Fej: <hash>` sor, saját ítélet, és újra a
  „Mit próbáltam megtörni, és nem sikerült” és a „Mit NEM vizsgáltam” fejléc (a `record-review.mjs` az utolsó `Fej:` sort nézi).

## 6. Az ítélet rögzítése (ezt olvassa a pre-pr-gate és a pre-merge-gate)

```bash
node scripts/qa/gates/record-review.mjs --head <fej-hash> --verdict IGEN --report <SCRATCHPAD>/review-<x>/jelentes.md
# --verdict: IGEN | "IGEN, FELTÉTELLEL" | NEM
```

- A szkript csak a futtató (`npm run gate:blind-review`) bizonyítékával igazolt jelentést rögzít (a konfigurált modell készítette, a
  jelentés nem változott, az ellenőr valóban vizsgált) — kézzel írt vagy alügynöktől származó jelentést nem.
- A szkript csak teljes jelentést fogad el: `Fej:` sor a rögzítendő fejre, `Ítélet:` sor, és a „Mit próbáltam megtörni, és nem
  sikerült” és a „Mit NEM vizsgáltam” fejléc — különben hibával kilép, bizonyíték nélkül.
- A bizonyíték: `<git-common-dir>/websuli-qa-evidence/review-<fej>.json` (helyi, nem commitolható; munkafából is látszik).
- A szkript kiír egy sort: `Független ellenőr ítélete: IGEN (fej: <hash>)`. Ezt — és CSAK ezt — tedd a PR-leírásba (vagy kommentbe).
  A nyilvános repóra biztonsági részlet, leletlista, jelentés-útvonal nem kerül.
- `IGEN, FELTÉTELLEL`: a feltételek jegyre (kanban) és a PR-leírásba kerüljenek. `NEM`: javítás → helyi kapuk → visszaellenőrzés.
- Új commit után a régi ítélet nem érvényes (fej-hash szerint kulcsolt) — ezért a javításokat egy kötegben, egy pushban küldd.
