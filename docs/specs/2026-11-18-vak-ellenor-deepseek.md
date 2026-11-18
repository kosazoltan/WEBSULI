# A vak hibakereső ellenőr futtató gépe — független, olcsó modell (DeepSeek, OpenRouter)

- Dátum: 2026-11-18
- Végrehajtás: `docs/specs/2026-11-18-vak-ellenor-deepseek-vegrehajtas.md`
- Ág: `chore/vak-ellenor-deepseek` (a `chore/vak-hibakereso-ellenor` tetejéről — annak a szabályára épül:
  `docs/specs/2026-11-18-vak-hibakereso-ellenor.md`)
- Jelleg: rendszerfejlesztés (ügynök-eszköz), nem alkalmazásfejlesztés. Az alkalmazás (`source/`) kódja nem változik.

## Tulajdonosi utasítás (2026-11-18, szó szerint)

> „Ez most rendszerfejlesztés, nem alkalmazásfejlesztés. Olvasd be a Hermes Agent repóból az OpenRouter API kulcsot, majd építsd meg
> azt, hogy a független vak ellenőr minden esetben a DeepSeek V4.1 Flash … modell legyen, hogy valóban teljesen független és olcsó
> modell ellenőrizze a munkádat. Ezáltal csökkentjük a drága Anthropic modellek költségét is.”

A pontos modell (tulajdonosi választás kérdőíven): `deepseek/deepseek-v4.1-flash-1017` (OpenRouter).

## Háttér

- A vak, hibakereső ellenőr szabálya (AGENTS.md „Vak hibakereső ellenőr — kötelező”, `websuli-fejlesztesi-ellenor` skill) ma egy
  Anthropic-alügynökkel teljesül: ugyanaz a modellcsalád ellenőrzi a saját munkáját, és drága.
- Az ítéletet a `scripts/qa/gates/record-review.mjs` rögzíti (`<git-common-dir>/websuli-qa-evidence/review-<fej>.json`); ma bármely
  kézzel írt, formailag teljes jelentést elfogad — az ügynök állítása a bizonyíték, nem gép által előállított műtermék.
- A tulajdonos a puszta egylövéses diff-véleményezést (a Gemini-szkriptet) „egyszerű ellenőrzésnek” nevezte és kivette a kapukból:
  az ellenőrnek olvasnia, keresnie és FUTTATNIA kell.

## Cél

1. **Ügynök-futtató** (`scripts/qa/gates/blind-review/blind-review.mjs`, `npm run gate:blind-review`): az OpenRouter
   chat-completions végpontját hívja eszközhívással, ciklusban, a konfigurált modellel. Bemenet: `--base`, `--head` (teljes hash),
   `--spec` (egy vagy több, vesszővel), `--goal` (tulajdonosi cél + hibakereső pontok), `--out` (jelentés). EGY eldobható munkafát
   készít a fejről, az ellenőr csak abban dolgozik; a végén a munkafa megszűnik. A fejlesztő jelentésének átadására NINCS kapcsoló
   (ismeretlen kapcsoló = hiba) — ez a „vakság” gépi garanciája.
2. **A rendszerüzenet egy forrásból:** a `websuli-fejlesztesi-ellenor` skill 3. szakaszának megbízás-sablonja (futásidőben
   kiolvasva) + egy rövid futtató-kiegészítés (az eszközök leírása). Sablon-másolat nincs.
3. **Eszközök** (mind a munkafára korlátozva): fájlolvasás sortartománnyal, mappa-listázás, keresés (ripgrep, különben saját),
   `git diff / log / show` a base…head tartományra, parancsfuttatás engedélylistával, ideiglenes fájl írása csak a
   `.blind-review-tmp/` mappába, jelentés leadása.
4. **Futáskorlátok:** USD-plafon (alap 0,50; `--max-usd`; kemény felső határ 3), körszám, falióra, kimenet-méret, megszakító fájl /
   jelzés. Plafonnál a futás megáll, a jelentés „NEM TELJES” (nem érvényes ítélet).
5. **Gép által előállított bizonyíték:** `blind-review-<fej>.json` a bizonyíték-tárban; a `record-review.mjs` csak ilyen, egyező
   bizonyítékkal rögzít ítéletet (vagy kifejezett, naplózott tulajdonosi felmentéssel).
6. **Konfig** a `gates.config.json` `blindReview` szakaszában; őr-teszt: a modell nem Anthropic-modell.
7. **Dokumentáció:** runbook- és skill-kiegészítés, `package.json` szkript.
8. **Mért alapvonal** két olyan fejen, ahol aznap egy Anthropic vak ellenőr valódi hibákat talált (lásd „Mérési terv”).

## Nem cél

- CI-bekötés (workflow-módosítás) — külön szelet; a feltételei lent („CI-szelet”).
- A `pre-pr-gate` / `pre-merge-gate` / `check-quality-gates` hook módosítása: azok továbbra is a `review-<fej>.json`-t olvassák.
- A PR-szövegből olvasott ítélet-sor (`Független ellenőr ítélete: …`) útjának szigorítása — ismert rés, lásd „Ismert korlátok”.
- A külső (Gemini) szkript (`external-review.mjs`) módosítása.
- Konténeres / virtuális gépes homokozó. A védelem rétegei lent; a maradék kockázat megnevezve.
- Böngészős (Playwright) futtatás alapból: az e2e-harness adatbázist és buildet igényel; a szabály megvan az engedélylistában, de a
  konfigban kikapcsolva (`allowPlaywright: false`) — bekapcsolása külön tulajdonosi döntés (e-mail- és DB-biztonság igazolása után).

## Terv (döntések)

### D1 — Fájlok

Új mappa: `scripts/qa/gates/blind-review/`

| Fájl | Szerep |
| --- | --- |
| `blind-review.mjs` | belépő: argumentumok, munkafa, ügynök-ciklus, korlátok, jelentés, bizonyíték |
| `openrouter.mjs` | kulcs betöltése, HTTP-hívás, hibák maszkolása, költség a `usage`-ből |
| `tools.mjs` | az ellenőr eszközei: útvonal-őr, engedélylista, tiszta környezet, futtatás |
| `evidence.mjs` | a bizonyíték összeállítása és ellenőrzése (ezt hívja a `record-review.mjs`) |
| `ts-sandbox-loader.mjs` | a homokozóban futó ellenpróbákhoz: TypeScript-fájlok betöltése folyamaton belül (gyerekfolyamat nélkül) |
| `futtato-kiegeszites.md` | a rendszerüzenet futtató-specifikus kiegészítése (eszközök, határok) |
| `*.test.mjs` | egységtesztek hamis OpenRouter-válaszokkal |

Közös fájlokban csak célzott kiegészítés: `gates.config.json` (`blindReview` szakasz), `record-review.mjs` (a bizonyíték
ellenőrzése), `package.json` (szkript), `docs/minosegkapuk.md`, a skill (forrás + tükör), `AGENTS.md` (egy sor).

### D2 — Titokkezelés

- A kulcs CSAK az `OPENROUTER_API_KEY` környezeti változóból jön. Ha nincs beállítva: a `WEBSULI_SECRETS_ENV` környezeti változó,
  vagy a `<git-common-dir>/websuli-qa-local.json` (`{"secretsEnv": "<útvonal>"}` — a `.git` mappában van, nem követhető, minden
  munkafából látszik) mutathat egy `.env` fájlra; a folyamat abból CSAK az `OPENROUTER_API_KEY` sort olvassa. Gépfüggő útvonal nem
  kerül követett fájlba.
- A kulcs nem parancssori argumentum, nem kerül fájlba, naplóba, bizonyítékba, hibaüzenetbe, a modellnek küldött szövegbe, sem a
  gyerekfolyamatok környezetébe. Minden szöveg, amely a folyamatból kimegy (konzol, jelentés, átirat, eszköz-eredmény), átmegy a
  maszkoláson (a kulcs pontos értéke + `Bearer …` + `sk-or-…` minta + a `lib.mjs` `redact`).
- A HTTP-hibák törzséből csak a maszkolt, csonkolt szöveg kerül ki; a kérés fejlécei soha.

### D3 — Az eszközök védelme (promptinjektálás: a repó tartalma adat, nem utasítás)

Kiindulás: a modell bármit kérhet — az eszközök akkor se tudjanak kárt okozni.

1. **Útvonal-őr:** minden útvonal a munkafa gyökeréhez képest oldódik fel; a legmélyebb létező ős `realpath`-ja a munkafán belül
   kell legyen (`..`, abszolút útvonal, meghajtóbetű, UNC, szimbolikus link / junction kifelé → elutasítva); a `.git` és a `.env*`
   nevű fájl tiltott.
2. **Git:** csak strukturált `git_diff` / `git_log` / `git_show` (nincs szabad argumentum); a `git_show` csak a `head`, a `base` vagy
   a fej őse; `--no-ext-diff --no-textconv`; a fájlútvonal az útvonal-őrön megy át.
3. **Parancsfuttatás — két bizalmi szint:**
   - **A fej KÖVETETT fájljai** (a fejlesztő kódja; ugyanaz a bizalom, mint amikor a fejlesztő / a CI futtatja): `node --test
     <követett .test.mjs>`, `npx tsx --test <követett source/tests/*.test.ts>`, `npx tsc --noEmit` (és `-p tsconfig.test.json`),
     `npm run <konfigban engedélyezett szkript>`, és — csak ha a konfig engedi — `npx playwright test <követett spec> --workers=1`.
     Integrációs teszt (`*.integration.ts`) nincs a listán (adatbázist igényelne). A „követett” gépi feltétel (`git ls-files`).
   - **Az ellenőr SAJÁT fájljai** (`.blind-review-tmp/` — a modell írta, tehát nem megbízható kód): CSAK a Node jogosultsági
     modelljében futnak: `node --permission --allow-fs-read=<munkafa> --allow-fs-write=<munkafa>/.blind-review-tmp` — fájlolvasás
     csak a munkafán (és a csatolt `node_modules`-on) belül, írás csak az ideiglenes mappába, gyerekfolyamat / worker / hálózat /
     natív bővítmény TILTVA (mérve Node 26-on: `ERR_ACCESS_DENIED`). TypeScript-forrást a `ts-sandbox-loader.mjs` tölt be folyamaton
     belül (a `typescript` csomag `transpileModule` hívásával; `@shared/` és `@/` álnevek, kiterjesztés nélküli importok).
   - Minden más parancs elutasítva (`git push`, `gh`, `curl`, `rm`, héj-operátorok: nincs héj — a futtató argumentumtömbbel,
     közvetlenül a `node` binárist indítja, az `npx` / `npm` shimet nem).
4. **Tiszta környezet:** a gyerekfolyamat környezete engedélylistás (PATH, rendszer- és ideiglenes mappa-változók, `NODE_ENV=test`,
   `CI=1`); kulcs, token, adatbázis-URL nem öröklődik. Éles e-mail-küldő és éles adatbázis így nem érhető el (nincs hozzá kulcs /
   URL), a friss munkafában `source/.env` sincs.
5. **Időkorlát és csonkolás:** parancsonként időkorlát (a folyamatfa leállításával), az eszköz-eredmény csonkolva és maszkolva.
6. **`node_modules`:** az eldobható munkafa `source/node_modules`-a junction / symlink egy meglévő, ugyanazon a gépen települt
   példányra (alap: a futtatót indító checkout `source/node_modules`-a; `--node-modules`-szal állítható). Nem másolás (C-01: gépek
   között másolni tilos — itt ugyanaz a gép). A takarítás ELŐSZÖR a csatolást bontja, csak utána törli a munkafát (teszttel: a cél
   tartalma megmarad). Ha a fej `package-lock.json`-ja eltér a csatolt példányétól, az ellenőr figyelmeztetést kap.

### D4 — Futáskorlátok

| Korlát | Alap | Viselkedés |
| --- | --- | --- |
| USD-plafon | 0,50 (`--max-usd`, legfeljebb 3) | minden hívás ELŐTT: eddigi költség + a következő hívás becsült felső határa ≤ plafon; az újrapróba külön hívásnak számít; `usage` nélküli válasz a becsléssel terhelődik |
| körszám | 60 | modellhívások száma |
| falióra | 25 perc | a ciklus elején és minden eszköz előtt |
| kimenet | 8 000 token / hívás, 200 000 token összesen; jelentés ≤ 80 kB | |
| megszakítás | `<bizonyíték-tár>/blind-review.stop` fájl vagy SIGINT | a következő ellenőrzési ponton megáll |

A költség a válasz `usage.cost` mezőjéből jön (tényleges), ha nincs, a `usage` tokenszámaiból a konfig tartalék-áraival; a
bizonyíték rögzíti, melyik forrásból. Plafonnál: a jelentés első sora „NEM TELJES — <ok>”, `Ítélet:` sor nélkül; a bizonyíték
`complete: false`; a kilépési kód 3. Ez nem érvényes ítélet — a `record-review.mjs` elutasítja.

### D5 — Bizonyíték és rögzítés

`<git-common-dir>/websuli-qa-evidence/blind-review-<fej>.json`: `kind`, `head`, `base`, `modelRequested`, `modelReported` (a
VÁLASZBÓL visszaolvasva), `generationIds` (az OpenRouter válasz-azonosítói — a tulajdonos az OpenRouter felületén visszakeresheti),
`reportSha256`, `verdict`, `complete`, `stopReason`, `calls`, `retries`, `tokens`, `costUsd`, `costSource`, `toolCalls` (fajtánként),
`startedAt`, `endedAt`, `limits`.

A `record-review.mjs` az ítéletet akkor rögzíti „vak ellenőr” ítéletként (`reviewer: "blind-review"`), ha: van ilyen bizonyíték a
fejre; `complete: true`; a jelentés sha256-a egyezik; a `modelReported` a konfigurált modell; az ellenőr legalább `minToolCalls`
(alap 5) vizsgáló eszközhívást végzett (a jelentés leadása nem számít), és ezek között van olvasó / kereső / git-hívás; a
bizonyíték ítélete egyezik a `--verdict`-tel.

### D6 — Átállás, és ha az OpenRouter nem elérhető

- **Átállás:** a `gates.config.json` `blindReview.mode` értéke `required`; az ág összevonásának pillanatától él (a kapuk a
  munkafában lévő konfigot olvassák, tehát egy ág a főág beolvasztásakor áll át). A már rögzített `review-<fej>.json` ítéletek
  érvényesek maradnak (a kapuk a rögzített bizonyítékot olvassák, nem ellenőrzik újra).
- **Ha a vak ellenőr nem futtatható** (nincs kulcs, az OpenRouter nem elérhető, elfogyott a keret, a modell megszűnt): a futtató
  érthető üzenettel, nem nulla kóddal megáll; bizonyíték nem keletkezik; a `record-review.mjs` nem rögzít — a kapu tehát ÁLL.
  Csendes megkerülés nincs. A tulajdonos dönthet: a `record-review.mjs --tulajdonosi-felmentes "<indok>"` kapcsolóval egy más úton
  (pl. Anthropic vak alügynökkel) készült, formailag teljes jelentés rögzíthető; a bizonyítékba `reviewer: "tulajdonosi felmentés"`
  és az indok kerül, a szkript hangos figyelmeztetést ír. A kapcsolót ügynök csak a tulajdonos kifejezett, az adott fejre szóló
  engedélyével használhatja (AGENTS.md); a `mode: "off"` a teljes visszaállás (tulajdonosi döntés, egy sor a konfigban).

### D7 — CI-szelet (nem ennek a PR-nek a része)

Kell hozzá: (1) `OPENROUTER_API_KEY` GitHub-titok felvétele — tulajdonosi teendő; (2) költési keret a kulcson az OpenRouter
felületén — tulajdonosi teendő; (3) workflow-job, amely a PR fejére futtatja a `gate:blind-review`-t (fork-PR-ra NEM, a titok
miatt), és az eredményt műtermékként / ítélet-sorként teszi közzé; (4) a `pr-verdict-check.mjs` összekötése a géppel előállított
bizonyítékkal (ez zárná a PR-szöveg rését).

## Kockázatelemzés

| Kockázat | Védelem | Maradék |
| --- | --- | --- |
| **Titokszivárgás** (kulcs a naplóban, hibában, gyerekfolyamatban, a modellnél) | D2; engedélylistás gyerek-környezet; maszkolás minden kimeneten; tesztek: hibaválasz, kivétel, eszköz-eredmény, gyerek-környezet | a fej követett tesztjei a felhasználó jogaival futnak (mint a fejlesztőnél); a lemezen lévő fájlokat olvashatnák — ezt a fejlesztő kódja tenné, nem a modellé |
| **Promptinjektálás** (a repó szövege utasítja a modellt) | D3: nincs héj, nincs szabad parancs; a modell saját kódja csak jogosultsági homokozóban fut (nincs hálózat, gyerekfolyamat, munkafán kívüli fájl); a jelentést a futtató írja ki, nem a modell | a modell hamis „IGEN”-t írhat — ez minőségi kockázat (lent), nem kár |
| **Költség** | USD-plafon a hívás előtt, kemény 3 USD felső határ, körszám, falióra; a költség a tényleges `usage`-ből | az OpenRouter utólagos számlázási eltérése; ezért kell költési keret a kulcson (tulajdonosi teendő) |
| **A modell gyengébb képessége** (kevesebb hibát talál, mint az Anthropic ellenőr) | mért alapvonal két fejen; a találati arány számmal a jelentésben; a tulajdonos dönt | az olcsó ellenőr nem helyettesíti teljesen a drágát — a mérés mutatja meg, mire elég |
| **Hamis „IGEN”** (üres vagy felületes jóváhagyás) | minimum eszközhívás-szám; kötelező szakaszok; `complete`; modell- és hash-egyezés | a formailag teljes, de tartalmilag gyenge jelentés gépileg nem szűrhető |
| **Bizonyíték-hamisítás** (kézzel írt JSON) | `generationIds` — az OpenRouter oldalán visszakereshető | helyi fájl aláírás nélkül; a CI-szelet zárná |
| **A fő checkout sérülése** (junction törlése a cél tartalmával) | a takarítás előbb a csatolást bontja; teszt | megszakadt futás után maradó munkafa: a futtató a következő induláskor kiírja, mit kell kézzel eltávolítani |

## Edge case-ek

- A `--head` nem teljes (40 jegyű) hash, vagy nem létezik → hiba a hívás előtt.
- A terv nincs meg a fejen → helyi fájlként olvassa; ha úgy sincs → hiba.
- A modell szöveggel válaszol eszközhívás nélkül → emlékeztető (legfeljebb 2), utána NEM TELJES.
- A leadott jelentés hiányos (nincs `Ítélet:` / `Fej:` / kötelező szakasz, vagy a `Fej:` más fejre szól) → az eszköz hibát ad vissza,
  a modell javíthat; a körszám-plafon véd.
- Hibás JSON az eszköz-argumentumban, ismeretlen eszköz → hiba-eredmény a modellnek, a futás megy tovább.
- 429 / 5xx / hálózati hiba → legfeljebb 2 újrapróba, mind beleszámít a hívásszámba és a költségbecslésbe.
- A válasz `model` mezője más, mint a kért → a bizonyíték rögzíti; a `record-review.mjs` elutasítja.
- Megszakadt futás → a `finally` takarít; a munkafa-maradványt a következő futás jelzi.

## Mérési terv (alapvonal)

Két fej, amelyen aznap egy Anthropic vak ellenőr valódi hibákat talált:

- (a) `--base origin/main --head fec8d8b9eeaceb52c61d2e4cd9c225f39dbd9b5e`, terv `docs/specs/2026-11-17-eredmeny-email-kviz.md`
  (referencia: 4 közepes, 6 kicsi lelet);
- (b) `--base a3eb9bb013206f34a50612d15f4c25e3dceb5aa9 --head 3f72797d8825655626d6394c8a0db9112f119ee5`, terv
  `docs/specs/2026-11-18-adventi-naptar.md` (referencia: 5 közepes lelet).

Szabályok: a referencia-jelentést a DeepSeek-ellenőr nem kapja meg, és a `--goal` fájl a tulajdonosi célból és a tervből készül, a
futás ELŐTT, a referencia leleteinek ismerete nélkül. Az összevetés a futás UTÁN: referencia-lelet → megtalálta / részben / nem; a
DeepSeek saját leletei a kódból visszaellenőrizve (valós / téves); költség, idő, hívásszám futásonként. Teljes keret: ≤ 3 USD. Az
eredmény szépítés nélkül kerül a záró jelentésbe és a runbookba.

## Elfogadás (EARS)

<!-- acceptance-checklist -->
- [ ] B1 WHEN a futtató ismeretlen kapcsolót kap (pl. `--dev-report`) THEN SHALL hibával kilépni modellhívás nélkül.
- [ ] B2 WHEN a modell eszközt hív THEN a futtató SHALL végrehajtani, az eredményt maszkolva és csonkolva visszaadni, és a ciklust
  a jelentés leadásáig folytatni.
- [ ] B3 WHEN egy eszköz útvonala a munkafán kívülre mutat (`..`, abszolút, junction, `.git`, `.env`) THEN SHALL elutasítani.
- [ ] B4 WHEN a kért parancs nincs az engedélylistán (pl. `git push`, `gh`, `curl`, `rm -rf`, nem követett fájl `tsx`-szel) THEN
  SHALL elutasítani futtatás nélkül.
- [ ] B5 WHEN gyerekfolyamat indul THEN a környezete SHALL NOT tartalmazni az `OPENROUTER_API_KEY`-t és más titok-jellegű változót.
- [ ] B6 WHEN az ellenőr saját fájlja fut THEN SHALL a jogosultsági homokozóban futni (munkafán kívüli olvasás, gyerekfolyamat,
  hálózat tiltva).
- [ ] B7 WHEN a költség + a következő hívás becslése meghaladná a plafont THEN SHALL megállni a hívás ELŐTT, „NEM TELJES” jelentéssel
  és `complete: false` bizonyítékkal; ugyanez körszám-, falióra-, kimenet-plafonnál és megszakító fájlnál.
- [ ] B8 WHEN a `--max-usd` 3-nál nagyobb THEN SHALL hibával kilépni.
- [ ] B9 WHEN az OpenRouter hibát ad vagy kivétel keletkezik THEN a kiírt szöveg SHALL NOT tartalmazni a kulcsot / az Authorization
  fejlécet.
- [ ] B10 WHEN a futás teljes THEN SHALL `blind-review-<fej>.json` bizonyítékot írni a válaszból visszaolvasott modell-azonosítóval,
  a jelentés sha256-ával, a tokenekkel, a költséggel és az eszközhívások számával fajtánként.
- [ ] B11 WHEN a `record-review.mjs` `required` módban fut, és nincs bizonyíték / a hash nem egyezik / a modell más / kevés az
  eszközhívás / a futás nem teljes THEN SHALL hibával kilépni rögzítés nélkül; egyező bizonyítékkal `reviewer: "blind-review"`-ként
  rögzít; `--tulajdonosi-felmentes "<indok>"` esetén az indokkal, figyelmeztetéssel rögzít.
- [ ] B12 WHEN a konfig vak-ellenőr modellje Anthropic-modell THEN az őr-teszt SHALL bukni.
- [ ] B13 WHEN a takarítás fut THEN a csatolt `node_modules` célja SHALL megmaradni.
- [ ] B14 WHEN a mutációs ellenpróba a B3–B9, B11 bármely védő feltételét kiveszi THEN a megfelelő teszt SHALL bukni.
- [ ] B15 A mért alapvonal (két fej) táblázata számokkal a záró jelentésben és a runbookban.

## Kiegészítés — kizárólagosság, saját skill, a teljes szabályrendszer (2026-11-18)

Kiegészítő tulajdonosi utasítás (2026-11-18, szó szerint):

> „Vezesd be a teljes repó szabályrendszerében, készíts rá skillt és valós, használt skillt. Ezeket minden futtató… Claude MD,
> Agent MD, memóriák, mindenhol helyezd el úgy, hogy valóban kizárólag a DeepSeek ellenőr modell fusson minden esetben.”

Ez a kiegészítés FELÜLÍRJA a fenti D5 / D6 és a „Nem cél” ellentétes részeit (a tulajdonosi felmentés kapcsolója NEM készül el; a
kapuk és a hook IS változnak).

### K1 — Kizárólagosság, gépileg

- A `record-review.mjs` (`blindReview.mode: "required"`) CSAK a futtató bizonyítékával rögzít: `blind-review-<fej>.json`,
  `complete: true`, egyező jelentés-hash, `modelReported` = a konfigurált modell, elég eszközhívás, egyező ítélet. A rögzített
  `review-<fej>.json` `reviewer: "blind-review"` és `blind.model` mezőt kap. Felmentő kapcsoló NINCS.
- A kapuk (`pre-pr-gate`, `pre-merge-gate` — a `lib.mjs` `resolveVerdict` függvényén át) az ítéletet csak akkor fogadják el, ha a
  `review-<fej>.json` `reviewer: "blind-review"`, és a `blind.model` a konfigurált modell. A PR-szövegből olvasott ítélet-sor
  (`Független ellenőr ítélete: …`) `required` módban önmagában NEM elég (a sor a PR-leírásban tájékoztatás marad).
- **Átállás:** `blindReview.requiredFrom` (`2026-11-19T00:00:00+01:00`). Az ennél KORÁBBAN rögzített `review-<fej>.json` (a rekord
  `at` mezője szerint) érvényes marad; az átállás napjától más forrásból (Anthropic-alügynök, kézzel írt jelentés, más modell)
  származó ítélet érvénytelen. Folyamatban lévő PR új feje már csak a futtatóval kaphat ítéletet.
- **Ha a futtató nem tud lefutni** (nincs kulcs, OpenRouter-hiba, betelt költségplafon, megszűnt modell): nem nulla kilépés,
  érthető üzenet („a vak ellenőr nem futott; a tulajdonos dönt”), nincs bizonyíték → a kapu ÁLL. Csendes tartalék nincs. A
  tulajdonos döntési lehetősége egy KÖVETETT, a diffben látható konfigváltozás (`blindReview.mode` / `model` /
  `requiredFrom`) — parancssori megkerülés nincs.
- A modell-azonosító EGY helyen áll (`gates.config.json` `blindReview.model`); a futtatónak nincs `--model` kapcsolója. Őr-teszt:
  a modell `deepseek/…` az OpenRouter végponton, nem Anthropic; a futtató kódjában nincs modell-literál és nincs modell-kapcsoló.

### K2 — Használható az ágról, a repó bármely fejére

A futtató kódja abban a checkoutban van, ahonnan indítják; a vizsgált fej eldobható munkafája külön készül (ugyanabból a
git-tárból), tehát a futtató bármely ág bármely fejére futtatható a főágra kerülés előtt is. A sablont (skill) és a konfigot a
FUTTATÓ checkoutjából olvassa, nem a vizsgált fejből (a vizsgált fej nem írhatja át a saját ellenőrének a szabályait).

### K3 — Saját, használt skill

Új skill: `websuli-vak-ellenor` (forrás `.agents/skills/`, tükör `.claude/skills/`, a `mirroredSkills` listában): mikor kötelező,
a pontos parancs, a `--goal` fájl sablonja, teendő NEM / FELTÉTELLEL ítéletnél, teendő, ha a futtató megáll, és hogy a fejlesztő /
orkesztrátor a saját jelentését nem adhatja át. A `websuli-fejlesztesi-ellenor` skill a megbízás-sablon EGYETLEN forrása marad (a
futtató onnan olvassa), és az indításra az új skillre mutat.

### K4 — Szabályrendszer

Minden létező ügynök-vezérlő fájl kimondja: a vak ellenőr KIZÁRÓLAG a DeepSeek-futtató (`npm run gate:blind-review`): `AGENTS.md`
(a „Vak hibakereső ellenőr — kötelező” szakasz új „Ki az ellenőr” bekezdése), új repó-szintű `CLAUDE.md` (rövid, az AGENTS.md-re
mutat), `.cursor/rules/vak-ellenor.mdc`, `.cursor/rules/minosegkapuk.mdc`, `.cursorrules`, `.github/copilot-instructions.md`,
`docs/minosegkapuk.md`, `docs/agent-haromfazisu-munka.md`, `docs/codex-felhokornyezet.md`, a három kibocsátási kapu skilljei.
Őr-teszt: mindegyikben megvan a `gate:blind-review` hivatkozás (kitörlésnél bukik). A felhasználói memória (a repón kívül) is kap
bejegyzést.

### K5 — Hook

A `check-quality-gates` hook és a `verdictResult` üzenete ítélet hiányában a `npm run gate:blind-review` parancsra mutat.

### Elfogadás — kiegészítés

- [ ] B11 (módosítva) WHEN a `record-review.mjs` `required` módban fut érvényes futtató-bizonyíték nélkül THEN SHALL hibával kilépni;
  felmentő kapcsoló nincs.
- [ ] B16 WHEN a kapu `required` módban olyan ítéletet lát, amely nem `reviewer: "blind-review"` a konfigurált modellel, és a rekord
  nem az átállás előtti THEN SHALL az ítélet-lépés bukni; a PR-szöveg ítélet-sora önmagában nem elég.
- [ ] B17 WHEN a konfig modellje nem `deepseek/…`, vagy a futtató kódjában modell-literál / `--model` kapcsoló jelenik meg THEN az
  őr-teszt SHALL bukni.
- [ ] B18 WHEN bármely felsorolt vezérlőfájlból vagy kapu-skillből hiányzik a `gate:blind-review` hivatkozás THEN az őr-teszt SHALL
  bukni; a `websuli-vak-ellenor` skill tükre bájtra azonos.
- [ ] B19 WHEN ítélet hiányzik THEN a hook és a kapu üzenete SHALL a `npm run gate:blind-review` parancsot megnevezni.
