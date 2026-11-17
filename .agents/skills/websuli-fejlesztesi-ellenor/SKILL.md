---
name: websuli-fejlesztesi-ellenor
description: WEBSULI független fejlesztési ellenőr - friss kontextusú, csak olvasó alügynök hibát keres az elkészült fejlesztésben a PR megnyitása ELŐTT. Töltsd be automatikusan minden fejlesztés / javítás elkészültekor (zöld helyi kapuk után), a PR megnyitása előtt, és minden érdemi javító push előtt (visszaellenőrzés). A fejlesztő maga nem ellenőrizheti magát.
---

# Fejlesztési ellenőr — független alügynökös ellenőrzés a PR előtt

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

Játék- / UI-szeletnél a CI-azonos böngészős utat is futtasd le előbb (a `pre-pr-gate` futtatja; a pontos parancsot kiírja), hogy az
ellenőr a futott e2e-eredményre hivatkozhasson.

## 3. A megbízás (másold, töltsd ki, add egy FRISS kontextusú alügynöknek)

```text
Független fejlesztési ellenőr vagy a kosazoltan/WEBSULI repóban (NYILVÁNOS repó). Magyarul dolgozz és jelents.
CSAK OLVASÓ: a repóban semmit nem módosítasz, nem commitolsz, nem pusholsz, GitHubra (PR, komment, review) semmit nem írsz.
Saját mérőszkriptet csak a scratchpadodba írhatsz: <SCRATCHPAD>/review-<PR-vagy-ág>/ — a D:\ és a D:\repo gyökerébe semmit.

Cél: HIBÁT keress, ne összefoglalót írj. A munkát a SPECIFIKÁCIÓHOZ mérd, ne a tesztek szűk bemenetéhez.
- Ág / fej: <ág> @ <fej-hash>; munkafa: <út> (csak olvasd; ha futtatsz, ott futtass, de ne módosíts)
- Terv: <docs/specs/…md>; végrehajtási utasítás: <docs/specs/…-vegrehajtas.md>, a szelet fejezete: <sorok>
- Diff: git diff origin/main...<fej>
- A helyi kapuk eredménye (zöld): <a gate:push / gate:pr összesítő táblája>
- Kifejezetten nézd meg: <a fejlesztő által ismert kockázatok, ha vannak>

Kötelező ellenőrzőlista: a websuli-fejlesztesi-ellenor skill 4. szakasza (.agents/skills/websuli-fejlesztesi-ellenor/SKILL.md) —
minden pontra írj ítéletet (teljesül / részben / nem / nem alkalmazható) bizonyítékkal.

Szabályok:
- Minden lelet fájl:sor hivatkozással és konkrét hibaforgatókönyvvel (ki, milyen eszközön, mit csinál, mi történik).
- Kritikus / magas leletnél előbb próbáld MEGCÁFOLNI (keresd a védelmet a kódban, futtass próbát); csak megerősítés után jelentsd.
  A megcáfolt gyanúkat külön szakaszban sorold fel.
- Számszerű állítást (fér-e a szöveg, hány kérdés jön, mennyi idő) mérj vagy számolj, és írd le, hogyan.
- Ne találj ki fájlt, függvényt, eredményt; a bizonytalant jelöld UNVERIFIED-nek.
- A jelentést ide írd: <SCRATCHPAD>/review-<PR-vagy-ág>/jelentes.md

A jelentés formája:
# Független review — <ág / PR>, fej `<hash>`
## Ítélet: IGEN | IGEN, FELTÉTELLEL | NEM
(NEM, ha van blokkoló; FELTÉTELLEL, ha a nem blokkoló leletek jegyre mennek)
## Blokkoló leletek (fájl:sor, forgatókönyv, javítási javaslat)
## Jegyre menő leletek (közepes / alacsony)
## Az ellenőrzőlista pontjai (ítélet + bizonyíték)
## Megcáfolt gyanúk
## Mit futtattam (parancs + eredmény) / Mit NEM futtattam (ok + kockázat)
```

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

- A javított fejet UGYANAZ az ellenőr kapja (SendMessage a meglévő alügynöknek), a `git diff <régi-fej> <új-fej>` kiindulással:
  minden korábbi lelet lezárása / állapota, és új hiba a javításban (a javítás gyakran új hibát hoz: C-68).
- A jelentés végére új szakasz: `# Visszaellenőrzés — új fej <hash>` saját ítélettel.

## 6. Az ítélet rögzítése (ezt olvassa a pre-pr-gate és a pre-merge-gate)

```bash
node scripts/qa/gates/record-review.mjs --head <fej-hash> --verdict IGEN --report <SCRATCHPAD>/review-<x>/jelentes.md
# --verdict: IGEN | "IGEN, FELTÉTELLEL" | NEM
```

- A bizonyíték: `<git-common-dir>/websuli-qa-evidence/review-<fej>.json` (helyi, nem commitolható; munkafából is látszik).
- A szkript kiír egy sort: `Független ellenőr ítélete: IGEN (fej: <hash>)`. Ezt — és CSAK ezt — tedd a PR-leírásba (vagy kommentbe).
  A nyilvános repóra biztonsági részlet, leletlista, jelentés-útvonal nem kerül.
- `IGEN, FELTÉTELLEL`: a feltételek jegyre (kanban) és a PR-leírásba kerüljenek. `NEM`: javítás → helyi kapuk → visszaellenőrzés.
- Új commit után a régi ítélet nem érvényes (fej-hash szerint kulcsolt) — ezért a javításokat egy kötegben, egy pushban küldd.
