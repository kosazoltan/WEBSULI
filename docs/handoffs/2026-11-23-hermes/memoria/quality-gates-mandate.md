---
name: quality-gates-mandate
description: "Kötelező minőségkapuk (tulajdonos, 2026-11-17): lint kapu minden kibocsátás előtt, szakaszonkénti helyi gyors ellenőrzés, független alügynökös ellenőrzés a PR ELŐTT"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-17T13:00:00.000Z
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** a független ellenőr a GPT-6.2 Sol gépi vak futtató (lásd [[blind-review-runner]]); Claude-alügynök nem ad kötelező ítéletet. A lentebb leírt „külső, más rendszerű (Gemini) ellenőr” ELAVULT (tulajdonosi döntés 2026-11-18/19): Gemini-sor nincs a kapukban — a repóban még megmaradt WARN-lépés kivezetése a hibajegyzék H-22 tétele.

A kapuk EGYETLEN memória-belépője. A szabály forrása a repóban: `AGENTS.md` „Minőségkapuk” + a kapu-regiszter / runbook
`docs/minosegkapuk.md` (minden kapu, idő, kivétel, hook-szabály ott; új kapu CSAK ott kerül felvételre).

**A mandátum (Kósa Zoltán, 2026-11-17, saját szavaival):** „bármilyen kibocsátás előtt végig futtasd a saját lint kaput”;
„minden fejlesztés után automatikusan egy független alügynök ellenőrizze az elkészült fejlesztést, hogy ne utólag
derüljenek ki a hibák és kelljen az egészet újraírni”; „ne az API-költséget növeld az állandó hibával, hanem minden egyes
szakasz után a helyi gyors szkript-ellenőrzések és tesztek fussanak le, és csak utána lépj tovább, ha ezeket javítottad”.
Skilleket kért helyi szkriptekkel — megvan (#489, 2026-11-17): `websuli-lint-ellenor`, `websuli-fejlesztesi-ellenor`,
`websuli-push-elotti-kapu`, `websuli-pr-elotti-kapu`, `websuli-merge-elotti-kapu`.
Kiterjesztés (délután): „a teljes repóban, a teljes működésben mindenütt legyenek szkript-ellenőrző kapuk minden fázisra”
— mert a szkript nem hazudik, nem gondol félre / túl, nincs lost-in-the-middle; és a skillek, memóriák, futtatókörnyezetek,
AGENTS.md, SOUL.md-k is tudjanak róluk.

**Why:** az első játékhullám öt PR-jából négynél a független review a ZÖLD CI UTÁN talált blokkoló hibát (véletlen válasz,
kupon-kimerülés, levágott válasz, a szimuláció nem a lapot méri); minden ilyen kör 1–1,5 óra CI + újabb review, és az
alügynökök nagy részt újraírtak.

**How to apply — parancsok (a munkafa gyökeréből, `npm run …`):**
- Minden szerkesztési szakasz után `gate:stage`; csak zöld után tovább. Kibocsátás előtt lint: `gate:lint` (a push-kapu is futtatja).
- Push előtt `gate:push`, utána a push önálló, egyszerű parancsként (a `check-quality-gates` hook bizonyíték nélkül DENY).
- PR előtt: független ellenőr (skill `websuli-fejlesztesi-ellenor`; friss kontextusú, csak olvasó, a fejlesztő nem ellenőrizheti
  magát; csak ZÖLD helyi kapuk után indul) → ítélet rögzítése `node scripts/qa/gates/record-review.mjs --head <hash> --verdict
  IGEN|NEM --report <jelentés.md>` → `gate:pr -- --body-file <leírás.md>` → `gh pr create`. Minden érdemi javító push után
  ugyanaz az ellenőr kapja vissza a fejet.
- Merge előtt, közvetlenül: `gate:merge -- <PR>` (benne a futásőr is; [[no-deploy-during-active-runs]]).
- Minden alügynök-megbízásba beleírandó. Kapu megkerülése tilos, vészkijárat nincs; hibás kapunál a kaput kell javítani (teszttel).
- Elv: ügynök ÁLLÍTÁSA nem bizonyíték; bizonyíték csak gép által előállított és ellenőrzött műtermék (napló, hash, számláló).
  Amit szkript el tud dönteni, azt ne ügynök (API-hívás) döntse el. A kapuk nem törhetik / lassíthatják a programot
  (fejlesztésidejű eszközök; új kapu előbb figyelmeztet, aztán tilt). Kiterjesztés terve:
  `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` (készül).

**Pazarlás elleni push-fegyelem** (mérésből; a repóban: `docs/minosegkapuk.md` „Push-fegyelem”): csak-merge push nincs (csak
ütközésnél vagy orkesztrátori kérésre); lecserélt fej CI-bukására nincs új push; push után EGY hosszú figyelő, közbenső „még fut”
jelentés nélkül; zöld CI-jú fejre csak blokkoló javítás, egy pushban; ingadozás-gyanúnál nincs találgatós termékjavítás.

**Külső, más rendszerű ellenőr (tulajdonos, 2026-11-17):** Google Gemini `gemini-4-carbon`, SIMA `high` szint (nem max / xhigh),
kulcs: `GEMINI_API_KEY` a hermes `.env`-ben. A tulajdonos aggálya az „azonos gyártó vaksága”: ha Claude válogatja, mit lát a
Gemini, a vizsgálat nem pártatlan. Ezért: a Gemini gépi manifesztből MAGA választja ki, mit kér (kétfázisú protokoll), nem kap
semmit a Claude-reviewk ítéleteiből, az utasítás prózamentes technikai specifikáció, a kimenet JSON, és a jelentésben a Gemini
minden lelete szerepel a cáfoltakkal együtt. Tapasztalat: nem-streamelt hívás 5 perc után megszakad (a szerver közben számláz);
`high`-on ~55–60 k bemenet fölött a gondolkodás megeszi a kimeneti keretet; a háttér-mód ~5×-ös bemenetet számláz. Keret a
háromnapos elemzésre: 20–25 USD. (Repó-beépítés: #490 `chore/kulso-ellenor`.)

Kapcsolódó: [[orchestration-lessons-games]], [[completion-mandate]], [[lint-max-warnings]], [[check-chain-and-secret-output]], [[websuli-push-audit-hook]]
