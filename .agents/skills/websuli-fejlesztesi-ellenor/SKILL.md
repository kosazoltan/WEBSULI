---
name: websuli-fejlesztesi-ellenor
description: WEBSULI vak hibakereső független ellenőr (AGENTS.md „Vak hibakereső ellenőr — kötelező”, minden ügynök-környezetben). Töltsd be automatikusan MINDEN elkészült fejlesztésnél / javításnál (zöld helyi kapuk után), a PR megnyitása előtt és minden érdemi javító push előtt — kész, kitölthető megbízás-sablonnal egy friss, VAK (csak a követelményt és a diffet kapó) ellenőrnek, akinek a feladata HIBÁT TALÁLNI. A fejlesztő maga nem ellenőrizheti magát. Az ellenőrt KIZÁRÓLAG a gépi futtató végzi - npm run gate:blind-review (websuli-vak-ellenor skill, openai/gpt-6.2-sol, high).
---

# Fejlesztési ellenőr — független, vak ellenőrzés a PR előtt (a gépi futtató végzi)

Tulajdonosi utasítás (2026-11-17, kötelező): minden fejlesztés után automatikusan egy FÜGGETLEN alügynök ellenőrizze az elkészült
munkát, hogy a hibák ne utólag derüljenek ki. Mért ok: a 2026-11-16/17-i játékhullám öt PR-jából négynél a független review a zöld CI
UTÁN talált blokkoló hibát; minden ilyen kör 1–1,5 óra CI + egy újabb review-kör volt
(`docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`, `docs/agent-csapdak.md` C-61…C-72). Runbook: `docs/minosegkapuk.md`.

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

## 3. A megbízás — VAK, HIBAKERESŐ ellenőr (a futtató ezt kapja rendszerüzenetként; kézzel nem kell kiadni)

Tulajdonosi utasítás (2026-11-18): „mindig egy vak alügynök ellenőrizze az elvégzett munkádat, hogy biztosan megtalálja a hibákat …
Lehet Anthropic modell, de akkor azt nagyon úgy utasítsd, hogy mindenképpen hibát keressen.”

**VAK** = az ellenőr CSAK a követelményt (terv / tulajdonosi cél) és a diffet / fejet kapja. NEM kapja meg: a fejlesztő jelentését,
összefoglalóját, önértékelését, „zöld” állításait (kapu-eredmény, tesztszám, CI), a fejlesztő által „ismert kockázatnak” mondott
pontokat, sem az orkesztrátor várakozását („szerintem jó”, „csak gyorsan nézd meg”). Amit a fejlesztő állít, azt az ellenőrnek magának
kell mérnie.

### Ki az ellenőr

<!-- vak-ellenor:ki-az-ellenor:begin — EGYETLEN hely: ezt a bekezdést a gépi futtató ága (külön PR) cseréli -->
**Ki az ellenőr — KIZÁRÓLAG a gépi futtató** (tulajdonosi döntés 2026-11-19: „A teljes ökoszisztémában az ellenőr, független
ellenőr modellt cseréld le skillekben, Agent MD fájlokban, memóriákban, a GPT-6.2 SOL modellre high efforttal.”):
`npm run gate:blind-review -- --base <ref> --head <teljes fej-hash> --spec <terv.md> --goal <cél.md> --out <jelentés.md>` — a modell a
`scripts/qa/gates/gates.config.json` `blindReview.model` sora: `openai/gpt-6.2-sol` (OpenRouter, `reasoning.effort: high`; független,
nem Anthropic; modell-kapcsoló nincs). A `blindReview.exclusive` BE: a kötelező ítélet a futtatóé; Claude-alügynök, kézzel írt vagy
más forrású jelentés ítéletet nem ad — a `record-review` csak a futtató gépi bizonyítékával rögzít. A futtató minden futása
új, tiszta munkamenet, amely CSAK a tervet és a diffet kapja (a fejlesztő jelentését, „zöld” állításait nem — erre kapcsoló sincs),
eldobható munkafában olvas, futtat (böngésző és eldobható adatbázis is), és a leleteit géppel visszaellenőrzi. Ha a futtató nem tud lefutni
(kulcs, OpenRouter, költségplafon, NEM TELJES jelentés): a munka megáll, a tulajdonos dönt — csendes tartalék nincs. A fejlesztő saját
magát soha nem ellenőrizheti. A futtatás leírása: `websuli-vak-ellenor` skill.

#### Ha nincs alügynök-eszköz (pl. egyes Codex / Cursor / Gemini futások)

Nem kell alügynök-eszköz: a futtató minden ügynök-környezetben ugyanaz a parancs (fent). Alügynököt ellenőrként indítani nem kell, és az
ítélete nem is érvényes.
<!-- vak-ellenor:ki-az-ellenor:end -->

### A megbízás-sablon (egyetlen forrás)

A vak, hibakereső megbízás szövege EGY fájlban van: `scripts/qa/gates/vak-ellenor-megbizas.md` — ezt töltsd ki (a `<…>` helyeken) és add át változtatás nélkül; a
gépi futtató is ebből veszi az üzenetet. A sablon kötelező elemei: hibakereső keret („a feladatod hibát találni, nem megerősíteni”),
feladat-specifikus hibakereső pontok + „bármi más”, futtatás / ellenpróba saját munkafában, a mérce a tulajdonosi cél (felületnél a
képernyőképek), a jelentés kötelező szakaszai (`Fej:`, `Ítélet:`, „Mit próbáltam megtörni, és nem sikerült”, „Mit NEM vizsgáltam”).

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

- A javított fejre ÚJ futtató-futás (`npm run gate:blind-review -- … --head <új fej>`) — továbbra is VAKON: a fejlesztő javítási
  összefoglalóját / „javítva” állításait nem kapja, csak az új fejet és a diffet.
- A keret visszanézésnél is HIBAKERESÉS: nem a korábbi leletek kipipálása, hanem új hiba keresése a javításban és körülötte (a javítás
  gyakran új hibát hoz: C-68), és minden korábbi lelet lezárásának saját mérése.
- A jelentés végére új szakasz: `# Visszaellenőrzés — új fej <hash>`, benne új `Fej: <hash>` sor, saját ítélet, és újra a
  „Mit próbáltam megtörni, és nem sikerült” és a „Mit NEM vizsgáltam” fejléc (a `record-review.mjs` az utolsó `Fej:` sort nézi).

## 6. Az ítélet rögzítése (ezt olvassa a pre-pr-gate és a pre-merge-gate)

```bash
node scripts/qa/gates/record-review.mjs --head <fej-hash> --verdict IGEN --report <SCRATCHPAD>/review-<x>/jelentes.md
# --verdict: IGEN | "IGEN, FELTÉTELLEL" | NEM
```

- A `blindReview.exclusive` BE (tulajdonosi döntés 2026-11-19): csak a futtató (`npm run gate:blind-review`) bizonyítékával igazolt
  jelentés rögzíthető; alügynöktől vagy kézzel írt jelentést a szkript elutasít.
- A szkript csak teljes jelentést fogad el: `Fej:` sor a rögzítendő fejre, `Ítélet:` sor, és a „Mit próbáltam megtörni, és nem
  sikerült” és a „Mit NEM vizsgáltam” fejléc — különben hibával kilép, bizonyíték nélkül.
- A bizonyíték: `<git-common-dir>/websuli-qa-evidence/review-<fej>.json` (helyi, nem commitolható; munkafából is látszik).
- A szkript kiír egy sort: `Független ellenőr ítélete: IGEN (fej: <hash>)`. Ezt — és CSAK ezt — tedd a PR-leírásba (vagy kommentbe).
  A nyilvános repóra biztonsági részlet, leletlista, jelentés-útvonal nem kerül.
- `IGEN, FELTÉTELLEL`: a feltételek jegyre (kanban) és a PR-leírásba kerüljenek. `NEM`: javítás → helyi kapuk → visszaellenőrzés.
- Új commit után a régi ítélet nem érvényes (fej-hash szerint kulcsolt) — ezért a javításokat egy kötegben, egy pushban küldd.
