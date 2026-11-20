---
name: websuli-session-zaras
description: WEBSULI session-zárás - kérés-összevetés a higiénia ELŐTT (tulajdonosi utasítás 2026-11-20, kötelező). Töltsd be automatikusan MINDEN session / munkamenet / futás végén, mielőtt záró jelentést, összefoglalót írsz vagy higiéniába (memória, skill, kanban, mappa, ág, munkafa) kezdesz, és amikor a Stop hook a zárást visszafordítja. Parancsok - node scripts/qa/session-closeout.mjs collect | verify, majd npm run session:hygiene.
---

# Session-zárás — kérés-összevetés a higiénia előtt

> „…minden session végeztével, a higiénia előtt, végigveszed az ahhoz a sorhoz, utasítássorhoz, javítássorhoz, fejlesztéssorhoz
> beadott összes adatot, utasítást, képet, és újra retrospektív módon leellenőrzöd, hogy valóban minden kérés bekerült-e a
> fejlesztéssorba. Csak ezután végezheted el a higiéniát, és minden esetben felelősséggel kell nyilatkoznod róla…”
> — a tulajdonos, 2026-11-20

Gyökérok: a session végén nem készült összevetés a beadott utasítások és az elkészült munka között, ezért kérések elhullottak.
Terv: `docs/specs/2026-11-20-session-zaras.md`. Ügynöki állítás nem bizonyíték: a teljességet és a bizonyítékokat a szkript dönti el.

## Mikor (kötelező)

- Minden session / munkamenet / futás végén, **a záró jelentés és a higiénia ELŐTT**.
- Amikor a `Stop` hook a választ „[session-zárás] … feldolgozatlan tulajdonosi üzenet” üzenettel visszafordítja.
- Session elején (söprés): ha a bizonyíték-tárban `closeout-<session>.md` van `closeout-ok-<session>.json` nélkül, az előző session
  zárása elmaradt — a nyitott tételeit ebben a sessionben kell lezárni vagy jegyre tenni.
- Alügynök nem zár sessiont: a zárólistát az orkesztrátor (a tulajdonossal beszélő ügynök) készíti, a saját átiratából.

## A lépések (a „loop”)

1. **Gyűjtés (gép):** `node scripts/qa/session-closeout.mjs collect --transcript "<átirat.jsonl>"` (a Stop hook üzenete a pontos
   útvonalat megadja; vagy `--session <id>`). Codex-átirat: `--format codex`; Cursor / kézi szöveg: `--format plain` (üzenetek
   `---` sorral elválasztva). A kimenet: hány tulajdonosi üzenet, ebből képes / beillesztett blokkos / „nem önálló kérés gyanú”,
   és a kitöltendő lista útja: `<git-common-dir>/websuli-qa-evidence/closeout-<session>.md` (repón KÍVÜL — tulajdonosi szöveg a
   repóba nem kerülhet).
2. **Kitöltés (ügynök):** a lista minden `## U-xxx` tételéhez — az idézetet NE írd át — `Állapot:` és `Bizonyíték:`:

   | Állapot | Kötelező bizonyíték | Mit ellenőriz a gép |
   |---|---|---|
   | KÉSZ | `PR #n`, `commit <hash>` / `commit <hash>@ág`, `kanban #n`, `fájl <út>:<sor>` (legalább egy) | PR MERGED; commit az `origin/main`-en (vagy a megnevezett ágon); kanban `done`; fájl az `origin/main`-en, elég sorral |
   | RÉSZBEN / FOLYAMATBAN | nyitott `kanban #n` vagy nyitott `PR #n` | a jegy nem `done` / a PR OPEN |
   | DÖNTÉSRE VÁR | `Kérdés:` sor — a tulajdonosnak feltett kérdés, opciókkal és megjelölt javaslattal | nem üres |
   | ELVETVE | `döntés U-xxx` — a tulajdonos elvető döntését tartalmazó üzenet | létező, másik tétel |
   | NEM ÉRTELMEZHETŐ | `Kérdés:` sor — a rákérdezés szövege | nem üres |
   | NEM ÖNÁLLÓ KÉRÉS | `→ U-xxx` (amit folytat, pl. „folytasd”, „mehet”) vagy `Megjegyzés:` | létező tétel / nem üres |
   | MEGVÁLASZOLVA | `Válasz:` sor — a kérdésre adott válasz lényege | ≥ 20 karakter; NEM géppel igazolt → a nyilatkozatban felsorolandó |

   Összetett üzenet (több kérés egy üzenetben, kép + szöveg): bontsd altételekre — `### U-007a — rövid cím`, `### U-007b — …`,
   mindegyik saját `Állapot:` / `Bizonyíték:` sorral. A képet nézd meg újra (az átiratban van), és a képen látható minden kérés
   külön altétel legyen.
3. **Hiány esetén: pótolni, nem elkenni.** Ha egy kérés elmaradt, ELŐBB végezd el (a háromfázisú rend és a kapuk szerint). Amit
   ebben a sessionben objektíven nem lehet befejezni: kanban-jegy (`node "$HERMES_KANBAN_CLI" add …`) + RÉSZBEN / FOLYAMATBAN,
   vagy tulajdonosi kérdés (opciók + megjelölt, indokolt javaslat) + DÖNTÉSRE VÁR. A „jegyre tettem” csak valódi akadálynál
   elfogadható (befejezési mandátum, AGENTS.md).
4. **Felelős nyilatkozat:** a lista végén a `Nyilatkozat:` sorba, saját szavaiddal, de ezekkel az elemekkel: „A(z) N tulajdonosi
   üzenet alapján a szakaszt elvégeztem és ellenőriztem; a nyitott tételek és okaik: U-…”. A gép ellenőrzi: benne van az
   „elvégeztem és ellenőriztem”, a pontos tételszám, és MINDEN nem lezárt tétel azonosítója (RÉSZBEN, FOLYAMATBAN, DÖNTÉSRE VÁR,
   NEM ÉRTELMEZHETŐ, MEGVÁLASZOLVA). A nyilatkozat felelősségvállalás: csak azt írd le, amit kód, teszt, PR és éles állapot alapján
   most újra megnéztél — emlékezetből nem.
5. **Ellenőrzés (gép):** `node scripts/qa/session-closeout.mjs verify --transcript "<átirat.jsonl>"`. Bukik, ha bármely tétel
   kitöltetlen; ha a bizonyíték nem igazolható (nem létező / nem mainen lévő commit, nem MERGED PR, nem `done` jegy, hiányzó
   fájlsor); ha nyitott tételhez nincs nyitott jegy / PR; ha hiányzik a nyilatkozat vagy hiányos; ha az átiratban újabb
   tulajdonosi üzenet van a listánál; ha egy idézet megváltozott. **Amíg nem zöld: pótolj, javítsd a listát, futtasd újra a
   collect-et (ha új üzenet jött — a kitöltés megmarad), majd a verify-t.** Zöldnél: `closeout-ok-<session>.json` (átirat-bájtméret,
   tételszám, utolsó uuid, SHA-256-ok).
6. **Csak ezután: higiénia.** `npm run session:hygiene -- --transcript "<átirat.jsonl>"` — friss zöld összevetés nélkül megáll;
   zöldnél csak olvasó leltárt ad (munkafák, beolvadt helyi ágak, a fő munkakönyvtár állapota). Utána a globális szabály szerinti
   higiénia: memória (MEMORY.md + fájlok), skill (csapdák + runbook), kanban (a tábla a valósággal együtt), mappafa; a beolvadt
   helyi ágak és lezárt munkafák eltávolítása, távoli ág csak jóváhagyással, felesleges fájl archiválva. A záró jelentés a
   nyilatkozatot és a nyitott tételeket tartalmazza.

## A Stop hook (miért és mikor fordít vissza)

`scripts/qa/hooks/check-session-closeout.mjs` (bekötése a `.claude/settings.json`-ban tulajdonosi lépés — a terv „Tulajdonosi
lépés” szakasza). CSAK akkor fordítja vissza a választ, ha: a válasz zárásra utal (záró jelentés, összefoglaló, higiénia,
session vége, lezárás, „befejeztem”, „minden kész”, felelős nyilatkozat; vagy hosszú, „kész / elkészült” jelentés), ÉS a legutóbbi
zöld összevetés óta van tulajdonosi üzenet, ÉS nem fut háttérfeladat / ütemezett ébresztés, ÉS nem ő maga fordította már vissza
ugyanezt a zárást (második körben a tulajdonosnak látható figyelmeztetést ad). Rövid, közbenső válasz (kérdés, állapot) nem
akad meg. Ha visszafordít: a fenti lépések 1–5., nem vita. A hook hibájánál a szabály ugyanaz, mint a többi hooknál
(`docs/minosegkapuk.md` — „A kapu-hook hibája”): a hookot csak javítani szabad, a tulajdonost értesítve.

## Tiltott

- A lista idézeteinek átírása, tétel törlése, a lista kézi bővítése (csak a collect bővíthet), kitalált bizonyíték.
- KÉSZ jelölés nyitott PR-re, nem mainen lévő commitra, nem `done` jegyre — ez FOLYAMATBAN.
- A higiénia (vagy a záró jelentés) zöld verify előtt.
- Tulajdonosi szöveg / kép / személyes adat a repóba (fixture, doksi, commit-üzenet): a lista a bizonyíték-tárban él.
