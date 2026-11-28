---
name: websuli-fejlesztesi-ellenor
description: WEBSULI fejlesztési ellenőr - a PR előtt és minden javító push után a HELYI GPU-modell (Ollama, angol megbízás) nézi át a diffet: node scripts/qa/gates/local-review.mjs. A felhős vak kör (friss alügynök minden fejre) 2026-11-23 óta kivezetve. Töltsd be minden fejlesztés / javítás elkészültekor, zöld helyi kapuk után.
---

> Felejthető lépés = szkript, automatikusan: ismétlődő kézi lépést szkriptbe + hookba/kapuba kötni; a futás végét a Stop hook (`loop.mjs auto` + `check`) zárja — lásd ~/.claude/CLAUDE.md.

# Fejlesztési ellenőr — helyi GPU-ellenőr a PR előtt

Tulajdonosi döntés (2026-11-23): a felhős „vak kör” kivezetve — 45 PR-ra 342 felhős ellenőr-kör jutott (≈ 7,6 / PR), a 2.–4. kör
jellemzően csak az előző javítás apróságait kereste. Mérés és döntés: `docs/specs/2026-11-23-vak-kor-kivezetes.md`. Runbook:
`docs/minosegkapuk.md`.

## 1. Mikor

- PR megnyitása előtt és minden javító push után, az új fejre (helyi, ingyenes — nincs „egy kötegben küldd” kényszer).
- Előbb zöld `npm run gate:stage` és `npm run gate:push`: a determinisztikus kapu fogja az olcsó hibát.

## 2. Futtatás

```bash
node scripts/qa/gates/local-review.mjs                 # base origin/main, head HEAD; jelentés + review-<fej>.json
node scripts/qa/gates/local-review.mjs --refuted a1b2c3d4 --refuted-reason "a guard a 42. sorban megvan"
```

- A helyi modellel (alap: `hf.co/ornith-ai/Ornith-1.5-9B-GGUF:Q8_0`, felülírás `--model` / `WEBSULI_LOCAL_REVIEW_MODEL`)
  **kizárólag angolul** kommunikálunk — a prompt a scriptben angol; magyar megbízást ne adj neki.
- Ítélet: high → NEM (1-es kilépés), csak medium/low → IGEN, FELTÉTELLEL, nincs lelet → IGEN.
- A `high` leletet a KÓDBÓL ellenőrizd (9B modell, lehet hamis pozitív): valódi → javítás + újrafuttatás; hamis → `--refuted`.
- 3-as kilépés (nincs Ollama): indítsd az Ollamát; tartalékként egyetlen felhős alügynök-kör + `record-review.mjs` (lásd 5.).

## 3. Felhős második vélemény — csak kockázatos fájlnál, egyszer

A jelentés „Kockázatos fájlok” szakasza (migráció / séma, auth / token, fizetés, e-mail, CI-workflow) esetén EGY felhős vélemény
ajánlott (Gemini `external-review.mjs`, vagy egy Claude-alügynök a 4. pont listájával). Visszaellenőrző / újra-vak kör nincs; nem kapu.

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

## 4/b. Második, más rendszerű vélemény — külső (Gemini) ellenőr

A Claude-alügynökös ellenőr MELLETT (nem helyette) fut, ugyanarra a fejre (tulajdonosi kiegészítés 2026-11-17). A döntő ítélet
továbbra is a Claude-alügynökös ellenőré + az orkesztrátoré; a külső jelentés hiánya nem bukás.

```bash
# kulcs: KIZÁRÓLAG a GEMINI_API_KEY környezeti változó, vagy --env-file <helyi .env> (útvonalat a repóba írni tilos)
node scripts/qa/gates/external-review.mjs --repo . --base origin/main --head <fej> --cim "<PR / szelet>" \
  --spec docs/specs/<terv>.md#<fejezet-regex> --lista scripts/qa/gates/external-review/checklist-game.md \
  --ki <SCRATCHPAD>/review-<x>/kulso-jelentes.md --record          # általános szeletnél: checklist-general.md
# előtte ingyenes próba: --dry-run (csak countTokens)
```

- Modell: `gemini-4-carbon`, gondolkodási szint `high` (tulajdonosi döntés; nem max / xhigh). Alapból az Interactions API háttér-módja
  (`background: true`, `max_output_tokens` 131 072 — ez a hívásonkénti költségfék, ~1,3 USD kimenet); az interakció-azonosító azonnal
  `<jelentés>.interaction-id`-be kerül, megszakadt kliens után `--resume-id`-vel lekérdezhető. `--api stream`: 65 536-os keret, a
  gondolkodás is ebbe számít (~100 ezer token bemenet fölött MAX_TOKENS → hiányos). Időtúllépést / megszakadt kapcsolatot NEM
  ismétel (már számlázott hívás), csak 429 / 5xx-et. A nyers szó- / évfolyam-bank adatfájlok alapból kimaradnak
  (`--include-bank-data`).
- Siker CSAK: nem üres válasz + `finishReason` STOP + ítélet-fejezet; különben `<jelentés>.hianyos.md`, 3-as kilépés, és a
  bizonyíték `incomplete` / `blocked` — a második vélemény HIÁNYZIK (a kapu így jelzi, nem „megvan”).
- A küldés ELŐTT titok-szűrés (találatnál 4-gyel megáll, érték nélkül; minden kapcsolati URL külön, fail-closed); a kulcs
  soha nem kerül kimenetbe, jelentésbe, bizonyítékba. Kilépés: 0 lefutott / KIHAGYVA (nincs kulcs, kvóta), 2 nincs kulcs `--strict`
  mellett, 3 API-hiba, 4 titok-szűrés, 5 túl nagy bemenet (bontsd `--paths`-szal), 1 egyéb hiba (pl. hiányzó argumentum). A `--save-input <fájl>` a pontosan
  elküldött szöveget menti (a scratchpadba, ne a repóba). Költség ~0,4–1,5 USD / PR.
- Az orkesztrátor beolvassa a jelentést második véleményként, és minden kritikus / magas lelet állítását a KÓDBÓL visszaellenőrzi
  (MEGERŐSÍTVE / CÁFOLVA / NEM ELDÖNTHETŐ) — a külső modell nem lát a repóba, csak a kapott diffet / fájlokat, és hallucinálhat.
  A megerősített leletet a Claude-ellenőr visszaellenőrző körébe is add be.
- Nincs kulcs vagy elfogyott a keret: „KIHAGYVA” — nem bukás (kivéve `--strict`). A `pre-pr-gate` / `pre-merge-gate` a
  `external-<fej>.json` (`--record`) hiányát csak `WARN`-ként jelzi.

## 5. Tartalék: felhős ellenőr ítéletének rögzítése

```bash
node scripts/qa/gates/record-review.mjs --head <fej-hash> --verdict IGEN --report <SCRATCHPAD>/review-<x>/jelentes.md
```

- A bizonyíték mindkét úton: `<git-common-dir>/websuli-qa-evidence/review-<fej>.json`. A kiírt `Független ellenőr ítélete: …
  (fej: <hash>)` sort — és csak azt — tedd a PR-leírásba.
