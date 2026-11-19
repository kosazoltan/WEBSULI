---
name: websuli-vak-ellenor
description: WEBSULI vak hibakereső ellenőr gépi FUTTATÓJA (AGENTS.md „Vak hibakereső ellenőr — kötelező”). Töltsd be automatikusan MINDEN elkészült fejlesztés / javítás után (zöld helyi kapuk után), a PR megnyitása ELŐTT és minden javító feltöltés előtt, minden ügynök-környezetben. A vak ellenőr KIZÁRÓLAG ez a futtató - npm run gate:blind-review - a gates.config.json blindReview.model modelljével (openai/gpt-6.2-sol, high; független, nem Anthropic), böngészővel és eldobható adatbázissal; blindReview.exclusive BE, alügynök vagy kézzel írt jelentés NEM érvényes ítélet. A fejlesztő / orkesztrátor a saját jelentését nem adhatja át.
---

# Vak ellenőr — a futtató (`npm run gate:blind-review`)

Tulajdonosi utasítások (2026-11-18): a független vak ellenőr „valóban teljesen független és olcsó modell” legyen; a cél egy „autonóm
módon is megbízhatóan működő ellenőr”, amelynek a jelentését nem kell sorról sorra visszaellenőrizni. 2026-11-19: „A teljes
ökoszisztémában az ellenőr, független ellenőr modellt cseréld le […] a GPT-6.2 SOL modellre high efforttal.” Terv: `docs/specs/2026-11-18-vak-ellenor-deepseek.md`. Runbook: `docs/minosegkapuk.md`.

## 1. Mikor kötelező

- Minden elkészült fejlesztés / javítás után, a PR megnyitása ELŐTT (a `pre-pr-gate` és a hook ítélet nélkül nem enged).
- Minden javító feltöltés előtt, az ÚJ fejre (az ítélet fej-hash szerint kulcsolt).
- A merge előtt az ítéletnek a PR JELENLEGI fejére kell szólnia (`pre-merge-gate`).
- Előfeltétel (API-költség elve): előbb zöld `npm run gate:stage` és `npm run gate:push` — az ellenőr ne olcsó hibára költsön.

## 2. Ki az ellenőr — KIZÁRÓLAG a futtató (`blindReview.exclusive` BE)

- **A `blindReview.exclusive` BE** (tulajdonosi döntés 2026-11-19): a kötelező ítélet a futtatóé; Claude-alügynök ítéletet nem ad.
  Visszakapcsolás csak tulajdonosi döntéssel (követett konfigváltozás + a `rules-guard` őr-teszt módosítása).

- A modell egyetlen helyen áll: `scripts/qa/gates/gates.config.json` → `blindReview.model` (most: `openai/gpt-6.2-sol`, OpenRouter, `reasoning.effort: high`).
  A futtatónak NINCS modell-kapcsolója; a modell cseréje követett konfigváltozás, tulajdonosi döntés.
- A futtató gép által írt bizonyítéka: `<git-common-dir>/websuli-qa-evidence/blind-review-<fej>.json` (a válaszból visszaolvasott
  modell, a jelentés sha256-a, az eszközhívások, a géppel ellenőrzött leletek). A `record-review.mjs` és a kapuk mást NEM fogadnak
  el (alügynök, kézzel írt vagy utólag szerkesztett jelentés, más modell → érvénytelen).
- A megbízás-sablon (a hibakereső keret) egy forrásból jön: `scripts/qa/gates/vak-ellenor-megbizas.md` — a futtató ezt olvassa be
  rendszerüzenetnek (a saját eszköz-leírásával kiegészítve). Aki a sablont módosítja, a futtató rendszerüzenetét módosítja.

## 3. A parancs (bármely ügynök-környezetből ugyanaz, a repó gyökeréből)

```bash
npm run gate:blind-review -- \
  --base origin/main \
  --head <TELJES 40 jegyű fej-hash> \
  --spec docs/specs/<terv>.md[,docs/specs/<másik>.md] \
  --goal <SCRATCHPAD>/review-<x>/cel.md \
  --out  <SCRATCHPAD>/review-<x>/jelentes.md
# opcionális: --max-usd 2 (alap; legfeljebb 6) --max-rounds 60 --max-minutes 40 --dry-run
```

- A futtató EGY eldobható munkafát készít a fejről (a te munkafádhoz nem nyúl), abban az ellenőr olvas, keres, a fej követett
  tesztjeit futtatja és saját ellenpróbát ír (homokozóban: hálózat, gyerekfolyamat, munkafán kívüli fájl nélkül); a végén takarít.
- A futtató kódja abból a checkoutból fut, ahonnan indítod; bármely ág bármely fejére futtatható (a `--head` a közös git-tár
  bármely commitja). A `--out` a repón KÍVÜL legyen (scratchpad) — a jelentés nem kerülhet a nyilvános repóba.
- A kulcs: `OPENROUTER_API_KEY` környezeti változó; vagy a `WEBSULI_SECRETS_ENV` változó / a `<git-common-dir>/websuli-qa-local.json`
  (`{"secretsEnv": "<.env útvonala>"}`) mutat egy .env fájlra. A kulcsot soha ne írd ki, ne add át argumentumként.
- Kilépési kód: `0` teljes jelentés · `3` NEM TELJES (plafon / megszakítás) · `2` a vak ellenőr nem futott · `1` hibás hívás.

## 4. A `--goal` fájl — CSAK a cél és a hibakereső pontok (sablon)

```markdown
Tulajdonosi kérés / hibajelentés (szó szerint, dátummal): „…”

A változás célja a terv szerint (2–4 mondat; mi a mérce a FELHASZNÁLÓ szemével):
…

Feladat-specifikus hibakereső pontok (a megbízás-sablon 8. pontja — a diff TERÜLETÉHEZ igazítva, kérdésként):
8a. <adat- és állapotút: hol veszhet el / duplázódhat / ragadhat be? ismételt, megszakadt, egyidejű futás>
8b. <a terv elfogadási pontjai és edge case-ei egyenként: …>
8c. <biztonság / adatvédelem ezen a területen: bemenet-ellenőrzés, escape, jogosultság, titok / személyes adat>
8d. <szerződés a rétegek között: mezőnevek, formátumok, hibakódok, régi kliens>
8e. <regresszió: a közös modul többi hívója, a „nem cél” pontok>
8f. <tesztminőség: a tesztek a viselkedést mérik-e; időfüggés; valódi külső hívás nem indulhat>
```

TILOS a `--goal` fájlba (és bárhová) írni: a fejlesztő jelentését, összefoglalóját, önértékelését, „zöld” állításait (kapu-eredmény,
tesztszám, CI), a fejlesztő által „ismert kockázatnak” mondott pontokat, korábbi review-leleteket, vagy a saját várakozásodat
(„szerintem jó”). A futtatónak erre NINCS kapcsolója — ne csempészd be a cél-fájlon át. Visszaellenőrzésnél (javított fej) is
ugyanez: új futás az új fejre, a korábbi jelentés és a „javítva” állítások nélkül.

## 5. Az eredmény olvasása — csak az összegzést és a blokkoló / közepes leleteket

A jelentés végén a futtató **Gépi összegzése** áll: leletek súlyosság szerint; hány hivatkozást ellenőrzött a gép (a fájl:sor
létezik, és az idézett kód ott van); hány leletet igazol a futtató saját parancsnaplója; az érvénytelen (nem visszaellenőrizhető —
csak „kicsi” lehet) leletek külön jelölve; a gyorsítótár-találati arány és a költség. Elfogadott jelentésben minden blokkoló és
közepes lelet hivatkozása géppel igazolt. A gép a hivatkozást igazolja, nem a következtetést: a blokkoló / közepes leleteket
olvasd el, és a kódból döntsd el, valódi-e — a jelentés többi részét nem kell sorról sorra ellenőrizned.

Rögzítés (a futtató kiírja a pontos parancsot):

```bash
node scripts/qa/gates/record-review.mjs --head <fej> --verdict "<ítélet>" --report <SCRATCHPAD>/review-<x>/jelentes.md
```

A PR-leírásba CSAK a `record-review` által kiírt sor kerül (`Független ellenőr ítélete: … (fej: <hash>)`).

## 6. Mit tegyél az ítélet szerint

- **IGEN:** rögzítsd, mehet a `gate:pr`.
- **IGEN, FELTÉTELLEL:** rögzítsd; a közepes / kicsi leletek jegyre (kanban) és a PR-leírásba kerülnek; amelyik valós és olcsó,
  javítsd még a PR előtt (új fej → új futás).
- **NEM:** ne rögzíts megkerülő ítéletet. Minden blokkoló leletet ellenőrizz a kódból: ha valós → javítás → helyi kapuk → ÚJ futás
  az új fejre. Ha a lelet bizonyíthatóan téves (a hivatkozott kód nem azt csinálja, amit a lelet állít): ezt NE te döntsd el
  csendben — írd le a cáfolatot evidenciával (fájl:sor, futtatott próba), és kérj tulajdonosi döntést; a kapu addig áll.
- Vita esetén a `--goal` fájlt nem írhatod át úgy, hogy „ezt ne nézd” — a hibakereső pontok szűkítése megkerülés.

## 7. Ha a futtató megáll

| Üzenet | Teendő |
| --- | --- |
| `NEM TELJES — USD-plafon / körszám-plafon / falióra / kimenet-plafon` | Új futás nagyobb kerettel (`--max-usd` legfeljebb 6, `--max-rounds`, `--max-minutes`). Nagy diffnél bontsd a munkát kisebb PR-okra. Ha a kemény plafon sem elég: tulajdonosi döntés. |
| `NEM TELJES — a modell nem adott le jelentést` | Egy új futás. Ha ismétlődik: tulajdonosi döntés. |
| `MEGÁLLT: nincs OpenRouter-kulcs` | A kulcs beállítása a 3. szakasz szerint (a kulcsot ne írd ki). |
| `OpenRouter-hiba` (hálózat, 401 / 402 / 429 / 5xx, megszűnt modell) | Várj és ismételd egyszer. Ha marad: **a vak ellenőr nem futott; a tulajdonos dönt.** |

Nincs csendes tartalék: NE indíts helyette alügynököt, NE írj kézzel jelentést, NE rögzíts ítéletet más úton; a kapu áll, amíg a
futtató teljes jelentést nem ad, vagy a tulajdonos a konfigot (követett változással) át nem állítja.
Megszakítás futás közben: `<git-common-dir>/websuli-qa-evidence/blind-review.stop` fájl létrehozása (utána töröld).

## 8. Korlátok (ismerd, és jelezd, ha érintik a munkát)

- Böngésző és adatbázis (nehéz futás, legfeljebb `maxHeavyRuns` = 4 futásonként, egyenként legfeljebb 15 perc): `run_db_tests` (a repó
  eldobható adatbázisos futtatója), `run_e2e` (a fej követett Playwright-specjei, `--workers=1`), `run_browser_scenario` (az ellenőr saját,
  deklaratív forgatókönyve: oldal, kattintás, kitöltés, API-mock, offline, mérés, képernyőkép — a képeket a modell meg is nézi). Valódi
  e-mail nem mehet ki: a gyerek-környezetben nincs küldő kulcs és adatbázis-URL (gépi ellenőrzés); saját konténer, a végén leállítva;
  a Node-folyamatok kifelé halott proxyn át; a saját forgatókönyvben a böngésző nem helyi kérése megszakítva. Gépi sorompó: legalább
  2 friss idegen `websuli-*` konténernél várakozás (legfeljebb 10 perc), utána elutasítás.
- **Gépi zár (egy sáv a nehéz köröknek, tulajdonosi utasítás 2026-11-19):** ha a `WEBSULI_MACHINE_LOCK_DIR` környezeti változó a gép
  zár-mappájára mutat, a három nehéz eszköz futás előtt megszerzi a zárat (atomi `mkdir`, `gazda.txt`: „blind-review <fej12> <eszköz>
  <UTC>”), legfeljebb 20 percig vár (a falióra-kereten belül), és a futás után — hibánál is — elengedi. Foglalt gépen az eszköz
  „NEM FUTOTT: gép foglalt” eredményt ad (nem bukás), a futás a többi eszközzel folytatódik, és a jelentés „Mit NEM vizsgáltam”
  szakaszának kötelezően meg kell neveznie a nem futott eszközt (gépi ellenőrzés). A zárra várt idő NEM számít a falióra-keretbe:
  saját összkorlátja van (`machineLockWaitTotalSec` = 30 perc / futás), és a Gépi összegzés kiírja. A változó nélkül (CI) nincs
  zárolás. Idegen zárat a futtató soha nem bont.
- A futtatással igazolt lelet „részben igazolt”, ha a próba elszigetelt volt (saját homokozós fájl, egységteszt, típusellenőrzés —
  a valódi hívási lánc helyett); „teljes úton igazolt” csak böngészős vagy adatbázisos futás lehet.
- Az eldobható munkafa `source/node_modules`-a a futtató checkoutjának telepítésére csatol; eltérő `package-lock.json` esetén az
  ellenőr figyelmeztetést kap.
- A modell (GPT-6.2 Sol, high) a 272 000 bemeneti token fölötti hívásokat drágábban számolja; nagy diffnél a 2 USD-os alap kevés
  lehet — `--max-usd` legfeljebb 6. A gyorsítótárat a szolgáltató maga kezeli (töréspont nincs); a hívások előtagja csak bővül.
