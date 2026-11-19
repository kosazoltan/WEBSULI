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
- 429 / 5xx / hálózati hiba (ENOTFOUND, időtúllépés) → legfeljebb 4 újrapróba exponenciális várakozással (2, 4, 8, 16 s; legfeljebb 30 s), mind beleszámít a hívásszámba és a költségbecslésbe (minden próba előtt plafon-ellenőrzés); ha nem jön helyre: NEM TELJES, ítélet nélkül (kilépési kód 2).
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

## 2. kiegészítés — modellcsere (Qwen4 Max) és géppel ellenőrzött leletek (2026-11-18)

Tulajdonosi utasítás (2026-11-18, szó szerint):

> „Qwen 4 Max modellekre állítsd át a DeepSeek Flash modelljét, mert az megint kontextus-pazarló, ha az ő összes jelentését neked
> ellenőrizned kell. Olcsóbban jövünk ki egy autonóm módon is megbízhatóan működő ellenőrrel.”

Ez a kiegészítés FELÜLÍRJA a fenti szöveg modellre és költségplafonra vonatkozó részeit. A terv fájlneve (`…-deepseek`) és az ág
neve történeti okból marad; ahol a fenti szöveg „DeepSeek”-et ír, ott a konfigurált modell értendő.

### M1 — Modell

`gates.config.json` `blindReview.model`: `qwen/qwen4-max` (OpenRouter; a nyilvános lista szerint 1 000 000 token kontextus,
eszközhívás, 1,425 USD / millió bemeneti és 4,275 USD / millió kimeneti token). Az elv változatlan: független (nem Anthropic),
kizárólagos, egyetlen helyen konfigurált modell; modell-kapcsoló nincs; a bizonyíték a VÁLASZBÓL visszaolvasott modellt ellenőrzi.
Az őr-teszt: a modell nem Anthropic-modell, a végpont az OpenRouter, a futtató kódjában nincs modell-literál és modell-kapcsoló.

### M2 — Költségplafon

Alapérték futásonként 2 USD, kemény felső határ 6 USD (`maxUsdDefault`, `maxUsdHardCap`). Indoklás (mért token-számból): a
futtató bejáratása az olcsó modellel egy ~840 soros diffen — lásd a runbook „Mért alapvonal” táblázatát; a jellemző futás
néhány százezer–millió bemeneti token (a teljes előzmény minden körben újra elmegy) és néhány tízezer kimeneti token. A Qwen
árán 1 000 000 bemeneti + 30 000 kimeneti token ≈ 1,43 + 0,13 = 1,56 USD — ezért 2 USD az alap; a nagy (2 000+ soros) diffre a
6 USD-os felső határig emelhető. A költség a válasz `usage` mezőjéből számolódik; a konfig árai csak a hívás ELŐTTI becsléshez
kellenek.

A mért token-számok (2026-11-18, `docs/minosegkapuk.md` „Mért alapvonal”): egy ~840 soros diff 37 hívás, 2,41 M bemeneti token (ebből
2,31 M gyorsítótárból) és 38 ezer kimeneti token → 0,59 USD; egy ~2 200 soros diff 36 hívás, 3,58 M bemeneti (3,43 M gyorsítótárból),
34 ezer kimeneti → 0,65 USD. Gyorsítótár nélkül ugyanez ~3,6 és ~5,2 USD lenne — ezért kötelező a gyorsítótár (3. kiegészítés), és
ezért 2 USD az alap (a mért futás ~3-szorosa: lejárt gyorsítótárra, újrapróbára, hosszabb vizsgálatra is elég), 6 USD a felső határ.

Megjegyzés a sablon forrásáról: a `chore/vak-hibakereso-ellenor` ág a megbízás szövegét egyetlen fájlba tette
(`scripts/qa/gates/vak-ellenor-megbizas.md`), és a „Ki az ellenőr” szöveget egy jelölt bekezdésbe (AGENTS.md, skill). A beolvasztás
után a futtató ezt a fájlt olvassa (nem a skill 3. szakaszát), és a jelölt bekezdés tartalma a futtató. A falióra-alapérték 40 perc
(a mért 13–16 perces futásokhoz), a parancs-időkorlát 240 mp, a hívásonkénti kimenet 16 000 token, a jelentés ≤ 40 000 karakter.

### M3 — Autonóm, géppel ellenőrzött leletek

Cél: az orkesztrátornak NE kelljen a jelentést sorról sorra ellenőriznie. Ezért a `submit_report` eszköz a jelentés mellett
strukturált lelet-listát kér, és a futtató minden leletet gépileg visszaellenőriz:

- **Lelet:** `id` (pl. `L1`), `severity` (`blokkoló` | `közepes` | `kicsi`), `title`, `file`, `line`, `quote` (a hivatkozott
  kódrészlet szó szerint), és opcionálisan `run` (`argv` + `output_excerpt`) a futtatással igazolt leletnél.
- **Hivatkozás-ellenőrzés:** a fájl létezik a munkafában, a sor létezik, és az idézet (szóköz-normalizálva, legalább 8 karakter)
  a megadott sor ±3 soros környezetében valóban ott van → „igazolt hivatkozás”.
- **Futtatás-ellenőrzés:** a `run.argv` egyezik a futtató SAJÁT naplójában egy ténylegesen végrehajtott `run_command` hívással, és
  az `output_excerpt` (szóköz-normalizálva, legalább 8 karakter) szerepel annak a hívásnak a kimenetében → „futtatással igazolt”.
  Az ellenőr nem hivatkozhat olyan futásra, amit nem végzett el.
- **Érvényesség:** a jelentés csak akkor fogadható el, ha minden BLOKKOLÓ és KÖZEPES lelet hivatkozása visszaellenőrizhető, a
  megadott `run` bizonyíték (ha van) igazolt, a jelentés szövege minden lelet-azonosítót tartalmaz, és az ítélet összhangban van a
  leletekkel (blokkoló lelet mellett csak NEM; NEM ítélethez kell legalább egy blokkoló lelet). Különben az eszköz elutasítja a
  leadást a hibák felsorolásával (a modell javíthat); ha a keret így fogy el: NEM TELJES.
- **Gépi összegzés:** a futtató a jelentés VÉGÉRE táblázatot fűz: leletek súlyosság szerint, ebből igazolt hivatkozású /
  futtatással igazolt, és külön az érvénytelen (nem visszaellenőrizhető — csak „kicsi” lehet) leletek. A bizonyíték-JSON
  ugyanezt számokkal tartalmazza (`findings`). Az orkesztrátor csak az összegzést és a blokkoló / közepes leleteket olvassa.
- Maradék kockázat: a géppel ellenőrzött hivatkozás azt igazolja, hogy a lelet VALÓDI kódra mutat és a futás megtörtént — azt nem,
  hogy a következtetés helyes. A mért alapvonal mutatja, mekkora a téves leletek aránya.

### M4 — Mérés

Az alapvonal-mérés (két ismert hibás fej) a Qwen4 Max modellel fut; teljes keret 8 USD. A futtató bejáratása az olcsó
DeepSeek-modellel történt — annak eredménye összehasonlításként a táblázatban marad.

### Elfogadás — 2. kiegészítés

- [ ] B12 / B17 (módosítva) WHEN a konfig modellje Anthropic-modell, a végpont nem az OpenRouter, vagy a futtató kódjában
  modell-literál / modell-kapcsoló jelenik meg THEN az őr-teszt SHALL bukni; a konfigurált modell `qwen/qwen4-max`.
- [ ] B8 (módosítva) a `--max-usd` alapértéke 2, kemény felső határa 6.
- [ ] B20 WHEN egy blokkoló / közepes lelet fájlja vagy sora nem létezik, vagy az idézet nincs a megadott helyen THEN a
  `submit_report` SHALL elutasítani a leadást.
- [ ] B21 WHEN egy lelet `run` bizonyítéka olyan parancsra hivatkozik, amelyet az ellenőr nem futtatott, vagy a kimenet-részlet
  nincs a naplózott kimenetben THEN SHALL elutasítani.
- [ ] B22 WHEN az ítélet IGEN / IGEN, FELTÉTELLEL, de van blokkoló lelet (vagy NEM blokkoló lelet nélkül) THEN SHALL elutasítani.
- [ ] B23 WHEN a jelentés elfogadott THEN a futtató SHALL gépi összegzést fűzni a végére, és a bizonyítékba írni a leletek számát
  súlyosság és igazoltság szerint.

## 3. kiegészítés — a prompt-gyorsítótár maximális kihasználása (2026-11-18)

Tulajdonosi kérés (2026-11-18, szó szerint): „figyelj oda, hogy a [KV-]cache használat maximálisan ki legyen használva.”

Megjegyzés a sorrendről: ez a kérés a futtató megírása KÖZBEN érkezett; a megvalósítás és ez a tervfejezet ugyanabban a munkaszakaszban
készült (a kód a `93e85136` commitban, ez a fejezet közvetlenül utána) — a háromfázisú rend szigorú sorrendje itt nem teljesült.

### C1 — Tények (forrás és mérés)

Forrás: `https://openrouter.ai/docs/guides/best-practices/prompt-caching.md` (lekérve 2026-11-18), és a modell végpont-leírója:
`https://openrouter.ai/api/v1/models/qwen/qwen4-max/endpoints`.

- **Alibaba / Qwen:** a gyorsítótár NEM automatikus — explicit töréspont kell: `cache_control: { "type": "ephemeral" }` a tartalom-
  blokkon, „az Anthropic explicit gyorsítótárával azonos szintaxissal”; az írás élettartama 5 perc; az írás ára az alapár 1,25-szöröse,
  az olvasásé a doksi szerint 0,1-szerese. A végpont-leíró szerint a `qwen/qwen4-max`-nál: `supports_implicit_caching: false`,
  `input_cache_write` 1,78125 USD / M (1,25×), `input_cache_read` 0,07125 USD / M (0,05×).
- A doksi modell-listája a `qwen/qwen4-max`-ot NEM sorolja fel (csak korábbi Qwen-modelleket) — ezért MÉRTEM (három hívás, 2026-11-18):
  1. hívás: `cached_tokens` 0, `cache_write_tokens` 14 889; 2. hívás (töréspont a tool-üzeneten): `cached_tokens` 14 889,
  `cache_write_tokens` 665; 3. hívás (a töréspont továbbmozdítva, a régi jelölő eltávolítva): `cached_tokens` 15 554 a 15 597-ből.
  Tehát az explicit gyorsítótár ezen a végponton működik, a `tool` szerepű üzenet tartalom-blokkján is, és a MOZGÓ töréspont a korábbi
  töréspontig érő előtagot találatként olvassa.
- **Válaszmezők:** `usage.prompt_tokens_details.cached_tokens` (olvasás) és `cache_write_tokens` (írás); a `usage.cost` a kedvezményt
  már tartalmazza.
- **Minimális előtag-hossz, a töréspontok száma:** az OpenRouter-doksi az Alibabára nem ad számot (az Anthropicra: legfeljebb 4
  explicit töréspont) — UNVERIFIED; a futtató 2 töréspontot használ, a rögzített blokk pedig mindig több ezer token.
- **Szolgáltató-útválasztás:** a `qwen/qwen4-max`-nak egyetlen szolgáltatója van (Alibaba), tehát szolgáltató-váltás miatt a
  gyorsítótár nem veszhet el; a doksi szerint az OpenRouter „provider sticky routing”-ot használ, és a `provider.order` megadása ezt
  KIKAPCSOLJA — ezért NEM rögzítünk szolgáltatót, hanem a futásonként állandó `session_id`-t küldjük (a doksi szerint ez a ragadós
  útválasztás kulcsa). Ha a modellnek később több szolgáltatója lesz, ez a döntés újranézendő.
- **DeepSeek (összehasonlítás):** automatikus, beállítás nélkül (ugyanez a doksi, „DeepSeek”) — a bejáratás futásán mért arány 95,8%.

### C2 — Előtag-stabilitás

A kérés sorrendje: rögzített rendszerüzenet (a skill sablonja + a futtató kiegészítése) → az eszközdefiníciók változatlan sorrendben →
a feladatblokk (terv, tulajdonosi cél, hibakereső pontok, base / head, diff-összesítő) → utána CSAK hozzáfűzés. A tárolt üzenetlista
soha nem íródik át, nem rendeződik újra, nem csonkolódik utólag: az eszköz-eredmény csonkolása a beérkezéskor, egyszer történik. Az
előtagban nincs időbélyeg, véletlen azonosító, számláló; a munkafa abszolút útvonalát a futtató rögzített jelölőre (`<munkafa>`) cseréli
(ez adatvédelmi okból is kell: az útvonal a felhasználónevet hordozza). A listázás rendezett.

### C3 — Töréspontok

Kettő: (1) a feladatblokk (az első user-üzenet) végén; (2) a beszélgetés mindenkori utolsó üzenetén (mozgó). A jelölő a kérés
összeállításakor, MÁSOLATON kerül az üzenetre — a tárolt lista jelölő nélküli, így a „korábbi üzenet soha nem változik” szabály a
jelölő mozgatásával sem sérül. `promptCache.mode: "none"` (automatikus gyorsítótárú szolgáltató) mellett jelölő nincs.

### C4 — Mérés és bizonyíték

A bizonyíték `callsDetail` tömbje hívásonként: `prompt`, `cached`, `cacheWrite`, `completion`, `usd`; a `cache` mező: találati arány a
2. hívástól, a gyorsítótárból olvasott / oda írt tokenek, becsült megtakarítás USD-ben (a konfig áraival). Ugyanez a jelentés Gépi
összegzésében. Elfogadás: a 2. hívástól a bemeneti tokenek ≥ 80%-a gyorsítótárból (a mért érték az alapvonal-táblában).

Az 5 perces élettartam miatt az ellenőr parancsainak időkorlátja 240 mp (őr-teszt: kisebb a gyorsítótár élettartamánál).

### C5 — Költségplafon

A tényleges költség a `usage.cost` (a kedvezménnyel). A hívás ELŐTTI becslés: a már elküldött előtag olvasási (`cacheRead`), az új rész
írási (`cacheWrite`) áron; ha az utolsó hívás óta a gyorsítótár élettartama lejárhatott, az egész bemenet írási áron; második
védvonal: a becslés legalább az előző hívás tényleges költségének 1,25-szöröse.

### Elfogadás — 3. kiegészítés

- [ ] B24 WHEN a futtató egymást követő kéréseket küld THEN a korábbi üzenetek SHALL bájtra azonosak maradni (a jelölők nélkül
  összevetve), és az eszközdefiníciók SHALL változatlanok lenni; időbélyeg az előtagban → a teszt bukik (mutáció).
- [ ] B25 WHEN `promptCache.mode` = `explicit` THEN pontosan két töréspont: a feladatblokk végén és az utolsó üzeneten.
- [ ] B26 WHEN a futás véget ér THEN a bizonyíték SHALL tartalmazni a hívásonkénti `cached` / `prompt` tokeneket, a találati arányt
  és a megtakarítást; a Gépi összegzés is.
- [ ] B27 Mért érték: a 2. hívástól a bemeneti tokenek ≥ 80%-a gyorsítótárból (alapvonal-tábla).

## 4. kiegészítés — kapcsolható kizárólagosság, böngésző és adatbázis az ellenőrnek, részben igazolt próba (2026-11-18)

Tulajdonosi döntés (2026-11-18, kérdőíven, szó szerint): „Kapjon böngészőt és DB-t, addig marad a mai.”

A mért alapvonal (fent, és `docs/minosegkapuk.md` „Mért alapvonal”) szerint a futtató a referencia közepes leleteinek kis részét
találta meg. Ez a kiegészítés FELÜLÍRJA a K1 (kizárólagosság) átállási dátumát és a D3 / D4 „böngésző és adatbázis nem cél” részét.

### E1 — Kapcsolható kizárólagosság (dátum helyett)

- `gates.config.json` `blindReview.exclusive` (alapból `false`) és `blindReview.exclusiveSince` (alapból `null`). A `requiredFrom`
  és a `mode` megszűnik.
- **Amíg KI:** a `record-review` és a kapuk a mai szabály szerint fogadnak el ítéletet: a vak, hibakereső alügynök (friss kontextus,
  csak terv + diff) teljes jelentése (a `Fej:` / `Ítélet:` sor és a két kötelező szakasz). Ha ugyanarra a fejre van teljes
  futtató-bizonyíték (`blind-review-<fej>.json`), a rögzített ítélet `blindSupplement` mezőbe kapja kiegészítő bizonyítékként
  (modell, a futtató ítélete, leletszám, költség, jelentés-hash); ha maga a rögzített jelentés a futtatóé (egyező hash), a
  `reviewer` értéke `blind-review`. A futtató futtatása mellé ajánlott (adatgyűjtés a küszöbhöz); a kapu nem követeli meg.
- **Átállás (BE):** CSAK ha az újramérés eléri a küszöböt (E3), és CSAK a tulajdonos kifejezett jóváhagyásával: egy követett
  konfigváltozás (`exclusive: true`, `exclusiveSince: <ISO időpont>`) ÉS a `rules-guard` őr-teszt „a kapcsoló KI” sorának ugyanabban
  a PR-ban történő módosítása, a PR-leírásban a jóváhagyás idézetével. BE állásban a K1-szabályok élnek; az `exclusiveSince` előtt
  rögzített ítéletek érvényesek maradnak.
- Őr-teszt: a kapcsoló értéke ezen az ágon (és így a főágon) `false`.

### E2 — Böngésző és adatbázis az ellenőrnek, biztonságosan

Új eszközök (mind „nehéz” futás: darabszám-plafon futásonként, saját időkorlát, a falióra-keretbe számít):

- **`run_db_tests`** — a repó saját eldobható adatbázisos futtatója (`npm run test:learning-db`,
  `source/scripts/run-learning-db-tests.ts`): saját, véletlen nevű `postgres:17` konténer csak loopbacken, a futás végén leállítva (a
  repó futtatójának saját 300 s-os korlátja a mienknél rövidebb, így a saját takarítása lefut).
- **`run_e2e`** — a fej követett Playwright-specjei (legfeljebb 3) a repó e2e-futtatójával (`npm run test:e2e -- <spec…> --workers=1`,
  `source/scripts/run-e2e-tests.ts`: eldobható adatbázis, `WEBSULI_E2E=1`, saját szerver).
- **`run_browser_scenario`** — az ellenőr SAJÁT böngészős próbája. A modell nem ír végrehajtható Playwright-kódot (az Node-jogokkal
  futna); helyette deklaratív forgatókönyv-fájlt ír a kijelölt mappába (`.blind-review-tmp/*.json`: esetek, nézetméret, lépések:
  `goto`, `click`, `fill`, `press`, `wait`, `waitFor`, `mockApi` (csak `/api/…` útvonal, állapotkód, törzs, késleltetés), `offline`,
  `evaluate` (oldalon belüli JS — a böngésző homokozójában), `measure` (befoglaló doboz, túlcsordulás, számított stílus, szöveg),
  `screenshot`). A forgatókönyvet a futtató SAJÁT, rögzített spec-fájlja hajtja végre a repó e2e-futtatójával; a böngésző minden nem
  helyi kérését megszakítja (`page.route`). A képernyőképeket (JPEG, futásonként legfeljebb 6) a futtató képként visszaadja a
  modellnek — a `qwen/qwen4-max` képbemenetet fogad (végpont-leíró: `input_modalities: text, image, video`).
- **Biztonság, gépileg kikényszerítve (teszttel):**
  - a nehéz futás gyerek-környezete a tiszta környezet (`cleanEnv`) + külön ellenőrzés (`assertSafeHeavyEnv`): nincs benne
    e-mail-küldő kulcs (`RESEND`, `SMTP`, `SENDGRID`, `MAILGUN`, `POSTMARK`, `*_API_KEY`, `*_TOKEN`, `*_SECRET`), sem adatbázis-URL —
    ha van, a futás el sem indul. Kulcs nélkül a szerver levélküldője nem küld (`source/server/resend.ts`); az adatbázis-URL-t a repó
    futtatója maga állítja a loopbackes konténerre;
  - `source/.env` a vizsgált munkafában → a nehéz futás tilos;
  - a `postgres:17` képnek helyben meg kell lennie (`docker image inspect`) — letöltés (kimenő hálózat) nincs;
  - kimenő hálózat: a Node-folyamatok halott helyi proxyn át (`NODE_USE_ENV_PROXY=1`, `HTTP(S)_PROXY=http://127.0.0.1:9`,
    `NO_PROXY=localhost,127.0.0.1,::1` — Node 26-on mérve: külső cím ECONNREFUSED, helyi cím elérhető); a saját forgatókönyvben a
    böngésző nem helyi kérése megszakítva. Maradék: a fej KÖVETETT e2e-specjeiben a böngésző forgalmát nem szűrjük (a fejlesztő / CI
    bizalmi szintje);
  - gépi sorompó: indulás előtt `docker ps` — ha legalább 2 friss (60 percen belül indult) idegen `websuli-*` konténer fut, várakozás
    15 s-onként, legfeljebb `heavyWaitMaxSec` (alap 600 s), utána elutasítás („a gép foglalt”); a várakozás a falióra-keretbe számít;
  - saját konténer takarítása: a futás előtti és utáni `docker ps` összevetése; a futás alatt megjelent, utána is futó konténert,
    amelynek a neve a futás kimenetében szerepel, a futtató leállítja (`docker stop`);
  - plafonok: `maxHeavyRuns` (alap 4), `heavyTimeoutSec` (alap 900), kimenet-csonkolás.
- A nehéz futás hosszabb a gyorsítótár élettartamánál (5 perc) — a következő hívás újraírja a gyorsítótárat; a plafon-becslés a hideg
  gyorsítótárat már kezeli.

### E3 — Újramérés és elfogadási küszöb

Ugyanaz a két fej, ugyanazok a `--goal` fájlok, a referencia átadása nélkül, `qwen/qwen4-max`, az új eszközökkel; keret 8 USD. A
táblázatban a régi sor mellé. **Küszöb (az átállás feltétele):** a referencia 9 közepes leletéből legalább 7-et megtalál (teljesen vagy
részben, kódból igazoltan), ÉS az (a) fejre NEM vagy IGEN, FELTÉTELLEL ítéletet ad, a blokkoló / közepes leletekkel.

### E4 — Részben igazolt próba (a „gépi igazolás határa” tanulsága)

A futtatással igazolt lelet `run` mezője kötelezően tartalmazza: `argv` (a teljes parancs, vagy az eszköz neve és argumentuma),
`output_excerpt`, `input` (a próba bemenete szó szerint — a futtatott fájlban / forgatókönyvben vagy a kimenetben ellenőrizve) és
`scope` (`teljes_ut` | `elszigetelt`). A futtató a parancs fajtájából is dönt: a saját homokozós fájl, a követett egységteszt és a
típusellenőrzés MINDIG `elszigetelt`; `teljes_ut` csak böngészős (`run_e2e`, `run_browser_scenario`) vagy adatbázisos (`run_db_tests`)
futásnál lehet. Elszigetelt próba → a lelet legfeljebb „részben igazolt”. A Gépi összegzés külön oszlopban mutatja.

### Elfogadás — 4. kiegészítés

- [ ] B28 WHEN `exclusive` = false THEN a `record-review` SHALL a teljes alügynök-jelentést rögzíteni, és a meglévő futtató-bizonyítékot
  `blindSupplement`-ként csatolni; a kapuk SHALL elfogadni. Őr: a kapcsoló értéke `false`.
- [ ] B29 WHEN `exclusive` = true THEN a K1 szabályai (csak futtató-bizonyíték; az `exclusiveSince` előtti rekord érvényes).
- [ ] B30 WHEN a nehéz futás gyerek-környezetében e-mail-küldő kulcs vagy adatbázis-URL van, vagy a munkafában `source/.env` van, vagy a
  `postgres:17` kép nincs helyben THEN a futás SHALL NOT elindulni.
- [ ] B31 WHEN legalább 2 friss idegen `websuli-*` konténer fut THEN SHALL várni (legfeljebb a plafonig), utána elutasítani.
- [ ] B32 WHEN a forgatókönyv nem helyi címet kér, `/api/`-n kívüli útvonalat mockol, vagy érvénytelen lépést tartalmaz THEN SHALL
  elutasítani (érvényesítés a futtatás előtt); a böngésző nem helyi kérése megszakítva.
- [ ] B33 WHEN a lelet próbája elszigetelt THEN a lelet SHALL legfeljebb „részben igazolt”; nem ellenőrizhető `input` → a `run`
  bizonyíték érvénytelen.
- [ ] B34 Az újramérés táblázata a régi sor mellett, a küszöbhöz mérve, szépítés nélkül.

## 5. kiegészítés — a vak ellenőr modellje: GPT-6.2 Sol (high), a futtató kizárólagos (2026-11-19)

Tulajdonosi döntés (2026-11-19, szó szerint): „A teljes ökoszisztémában az ellenőr, független ellenőr modellt cseréld le skillekben,
Agent MD fájlokban, memóriákban, a GPT-6.2 SOL modellre high efforttal.” — „Amint kicserélted az ellenőr modellt az összes futó
folyamaton, folytasd a munkát.”

Ez a kiegészítés FELÜLÍRJA az M1 (modell), az E1 (kapcsoló KI) és az E3 (átállás a küszöb után) ellentétes részeit.

### F1 — Modell

`gates.config.json` `blindReview.model`: `openai/gpt-6.2-sol` (OpenRouter; végpont-leíró, lekérve 2026-11-19:
`https://openrouter.ai/api/v1/models/openai/gpt-6.2-sol/endpoints` — 1 050 000 token kontextus, eszközhívás és `reasoning` paraméter
támogatott, `temperature` NEM; ár 2 / 10 USD / millió bemeneti / kimeneti token, gyorsítótárból olvasás 0,1, írás 2,5 USD / M; 272 000
bemeneti token FÖLÖTT a kérés ára 4 / 15 / 0,2 / 5 USD / M). A kérés `reasoning: { effort: "high" }` paramétert kap
(`blindReview.requestExtras`); a `temperature` kikerül. A modell egyetlen helyen áll; modell-kapcsoló továbbra sincs; az őr-teszt a
modellt és a döntés dátumát rögzíti (más modell → bukik).

- **Gyorsítótár:** az OpenAI-végpont nem fogad `cache_control` töréspontot (a szolgáltató maga gyorsítótáraz) → `promptCache.mode:
  "none"`; az előtag-stabilitás (csak hozzáfűzés) és a futásonként állandó `session_id` marad — a találati arányt a bizonyíték méri.
- **Plafon-becslés:** a tartalék-árak a 272 000 token fölötti (drágább) sávot veszik (4 / 15 / 0,2 / 5) — a becslés így felső
  korlát; a tényleges költség továbbra is a válasz `usage` mezőjéből. A 2 karakter / token becslés (a Qwen-mérés) marad: a GPT
  tokenizálója magyar szövegen hasonló vagy kedvezőbb, így a becslés legfeljebb felülbecsül. A költségkeret (alap 2, legfeljebb 6 USD)
  és a futáskorlátok változatlanok.

### F2 — A futtató kizárólagos (`blindReview.exclusive: true`)

A tulajdonos a független ellenőr modelljének cseréjét rendelte el: a kötelező ítélet ezentúl a futtatóé (GPT-6.2 Sol, high); a
Claude-alügynök ítéletet nem ad. `exclusiveSince` = az átkapcsolás időpontja — az előtte rögzített ítéletek érvényesek maradnak. A
`record-review` csak a futtató bizonyítékával rögzít; a kapuk csak ilyen ítéletet fogadnak el (a PR-szöveg sora önmagában nem elég).
Ha a futtató nem tud lefutni (kulcs, OpenRouter, költségplafon, NEM TELJES): a munka megáll, a tulajdonos dönt — csendes tartalék
nincs. Az E3 küszöbe (≥ 7/9) a Qwen-mérésre szólt; a GPT-6.2 Sol-ra ugyanezen a két fejen mért alapvonal jegyre kerül.

### Elfogadás — 5. kiegészítés

- [ ] B35 WHEN a konfigot olvassuk THEN `blindReview.model` = `openai/gpt-6.2-sol`, `requestExtras.reasoning.effort` = `high`,
  `exclusive` = true, érvényes `exclusiveSince`; más modell vagy kikapcsolt kizárólagosság → az őr-teszt bukik.
- [ ] B36 WHEN bármely vezérlőfájlt / skillt olvassuk THEN a régi Qwen-modell és a „KI állásban az alügynök az ítélet” szabály nem él;
  a „Ki az ellenőr” bekezdés a futtatót nevezi meg kizárólagosként.
- [ ] B37 Füstpróba valódi hívással egy kis, kész célon: a futtató lefut, a jelentésben `Ítélet:` és `Fej:` sor, a `record-review`
  elfogadja; költség és idő a jelentésben.
