# Spec: időfüggetlen tesztek — KB #205, #206, #212

Forrás: a régi kanban (`.hermes/kanban.db`) #205, #206 (+ 303. megjegyzés) és #212 jegye; a hiányleltár (2026-11-23) H3 hulláma;
SQL feladat-nyilvántartás #275, #276, #277.

- **#205** — „Összefésült próba (merged-probe): a teljes egységkörben az időérzékeny teszt (vocab-distractor-overlap bank-invariáns,
  60 s-os belső korlát) gépterhelés alatt hamis FAIL-t ad.”
- **#206** — „`source/tests/parallel-bank.test.ts` (setTimeout 30/5 ms sorrend) — gate:push teljes körben hamis FAIL; egyedül 5/5
  zöld. Javítás: hamis óra / determinisztikus várakozás.” 303. megjegyzés (harmadik eset):
  `source/tests/claude-stream-thinking-liveness.test.ts` `Date.now() - t0 < 250` falióra-korlát.
- **#212** — „OAuth-bizonyíték órafüggetlen (befagyasztott now), admin-access state-próba” (a 92d77a98 vak ellenőri köréből).

## 1. Cél

A felsorolt tesztek eredménye ne függjön a falióra állásától, ugrásától és a gép terhelésétől: ugyanaz a kód ugyanazt az
ítéletet adja egyedül, teljes körben (`gate:push`) és terhelés alatt is.

## 2. NEM cél (out of scope)

- Termékkód (`source/server`, `source/client`, `source/shared`) viselkedésének változtatása — csak tesztkód változik.
- Egyetlen elvárás gyengítése vagy törlése (AGENTS.md „Teszt-integritás”): minden állítás megmarad vagy szigorodik.
- A #212 harmadik pontja („második OAuth-DB-teszt”): nem időfüggés, és a hozzá tartozó vak ellenőri jelentés nem érhető el a
  repóban — külön feladat marad (SQL-sorban jelölve).

## 3. Érintett területek

- `source/tests/vocab-distractor-overlap.test.ts:205-227` — `Date.now()` falióra-korlát (60 000 ms).
- `source/tests/parallel-bank.test.ts:38, 60, 82` — valódi `setTimeout` 5/30/20 ms, a befejezési sorrendre épülő állítások.
- `source/tests/claude-stream-thinking-liveness.test.ts:79-81` — `Date.now() - t0 < 250`.
- `source/tests/support-tamper.test.ts` (OAuth state bizonyíték) — a munkamenet-rekord `t: Date.now()`, a `PlayerStateStore.verify`
  saját `Date.now()`-t olvas (`source/server/player/google.ts:78`).
- `source/tests/admin-access.test.ts` — „kizárás elleni őr” (5 s / 60 s-os gyorsítótár, `server/lib/admin-access.ts:126-143`) és
  „AdminStateStore” (15 perces élettartam, `server/lib/admin-oauth-state.ts:34, 53`) blokkok valódi órán futnak.

## 4. Rögzített döntések és kényszerek

1. **#205:** a futásidő-korlát (60 000 ms) MARAD, de a folyamat saját CPU-idejével mérve (`process.cpuUsage()`, user + system),
   nem falióra-különbséggel. Indok: a CPU-idő nem nő attól, hogy a gép más folyamatokat is futtat (a teljes kör párhuzamos
   tesztfájljai), és nem ugrik órakorrekciótól; egy valódi algoritmikus lassulást viszont ugyanúgy jelez. Mért egyedüli
   futásidő: ~6 s.
2. **#206:** a `parallel-bank` tesztek a node:test hamis órájával (`t.mock.timers`, csak `setTimeout`) futnak; egy segéd a
   folyamatban lévő munkát teljesen lefuttatja (valódi `setImmediate`-ekkel), és csak utána lépteti az órát 1 ms-onként. Így a
   befejezési sorrendet kizárólag a késleltetések értéke dönti el, nem az ütemező.
3. **#206 / 303. megjegyzés:** a liveness-teszt falióra-állítása helyett eseményszámlálás: ha az üres szövegblokk-vég életjel
   volna, a tétlenségi hiba csak mind a 10 blokk elküldése után jöhetne; helyesen előbb jön (az 80 ms-os időzítő a 3. blokk
   30 ms-os láncolt várakozása előtt jár le, ami terhelés alatt csak tovább csúszik).
4. **#212:** az OAuth-state bizonyíték és az admin-access blokkok befagyasztott órán futnak (`mock.timers`, `Date` API, rögzített
   `NOW`); a munkamenet-rekord időbélyege a rögzített `NOW`. Termékkódot nem módosítunk: a tárak a globális `Date.now()`-t olvassák,
   amit a hamis óra lecserél.
5. A hamis óra minden tesztnél visszaáll (`t.mock` automatikusan; a `describe`-szintű `mock.timers` `afterEach`-ben `reset`).

## 5. Edge case-ek

- A 15 perces élettartam határa befagyasztott órával pontosan mérhető: 15 perc − 1 ms → érvényes, 15 perc → lejárt (új állítás).
- A hamis `setTimeout` mellett a `setImmediate` valódi marad (különben a segéd nem tudná kiüríteni a függő munkát).
- A `parallel-bank` hibaág-tesztje (3.) elutasítással zárul: a segéd a rejected ígéretet is továbbadja.

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- [x] A1 WHEN a falióra minden olvasáskor 16 percet ugrik (bizonyító előtöltő) THEN SHALL a bank-invariáns teszt zöld maradjon
  (javítás előtt: `a bank-szintű invariáns futásideje 966416 ms` bukás).
- [x] A2 WHEN az 5 ms-os időzítők 50 ms-mal később futnak (ütemezési csúszás előtöltő) THEN SHALL a `parallel-bank.test.ts`
  minden tesztje zöld legyen (javítás előtt: a „review #265 … befejezési sorrend” teszt bukik).
- [x] A3 WHEN a teszt közben 300 ms-os CPU-akadás történik THEN SHALL a liveness „üres blokk” teszt zöld maradjon (javítás
  előtt: „eltelt: 373 ms” bukás).
- [x] A4 WHEN a falióra minden olvasáskor 16 percet ugrik THEN SHALL a `support-tamper.test.ts` OAuth-bizonyítéka és az
  `admin-access.test.ts` őr- és state-blokkjai zöldek legyenek (javítás előtt 1 + 4 bukás).
- [x] A5 WHEN az órát a teszt befagyasztja THEN SHALL a 15 perces state-élettartam határa (−1 ms érvényes, 0 lejárt) mindkét
  tárnál bizonyított legyen.
- [ ] A6 WHEN `npm run gate:stage` és `npm run gate:push` fut THEN SHALL mindkettő zöld legyen.

## 7. Tesztterv

- A javítás előtt és után ugyanazokkal a bizonyító előtöltőkkel (`--import`): (a) 16 perces óraugrás minden `Date.now()`-nál,
  (b) az 5 ms-os `setTimeout` +50 ms. A javítás előtti bukás és a javítás utáni zöld a PR leírásában szó szerint.
- Normál futás: az érintett öt tesztfájl, majd `gate:stage`, `gate:push`.

## 8. Kockázatok / visszavonási terv

- Csak tesztkód; visszavonás: a commitok revertje. Kockázat: a CPU-idő mérése többszálú (GC-szálak) — ezért a korlát változatlan,
  bőséges (60 s a mért ~6 s-hoz).

## 9. Végrehajtási utasítás

`docs/specs/2026-11-23-idofuggetlen-tesztek-vegrehajtas.md`.
