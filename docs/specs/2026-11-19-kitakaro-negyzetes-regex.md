# Spec: a kitakaró (titok- / e-mail-maszkoló) minták négyzetes futása és összeomlása

> Dátum: 2026-11-19 · Szerző: Claude Code (alügynök, orkesztrátori megbízás) · Állapot: JÓVÁHAGYVA (tulajdonos, 2026-11-19:
> „javítsd, ha ez a program készítésének stabilitását, gyorsaságát növeli”)
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-11-19-kitakaro-negyzetes-regex-vegrehajtas.md`.

## 1. Cél

A kapuk és a segédszkriptek kitakarója minden kiírt / naplózott szövegen fut. Két mért hiba van benne:

1. **Négyzetes e-mail-minta** — `scripts/qa/gates/lib.mjs` `REDACTIONS` utolsó sora:
   `/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g`. `@` nélküli hosszú futáson minden kezdőpozícióból
   végigolvas a futás végéig. A `redact()` minden kapulépés teljes kimenetén fut (`writeLog`, `createGate` kiírás, a git / gh
   stderr, a futásőr kimenete a `pre-merge-gate.mjs`-ben), időkorlát nélkül. Egy hosszú kimeneti sor (pontsor, hex-lánc,
   minifikált részlet) percekre megakasztja a kaput.
2. **Összeomló maszkolás** — `scripts/qa/gates/external-review.mjs` `maskSecrets()`: az `/AIza[0-9A-Za-z_\-]{20,}/g`
   20 millió karakteres folyamatos futáson `RangeError: Maximum call stack size exceeded`. A hívók a TELJES HTTP-válaszon
   maszkolnak, és csak utána vágnak 160–600 karakterre.

Cél: a kitakarás lineáris idejű legyen és ne omoljon össze, a valós címek / titkok kitakarása változatlan maradjon.

### Mérések (Node, Windows x64, 2026-11-19; a `redact` / regex önmagában)

| Minta | Bemenet | 10 000 | 30 000 | 100 000 | 300 000 | 5 M | 20 M |
|---|---|---|---|---|---|---|---|
| e-mail (`lib.mjs:22`) | `'a'.repeat(n)` | 0,07 s | 0,59 s | 6,7 s | 63 s | — | — |
| e-mail, csak helyi rész korlátos, tartomány nyitott | `'x@' + 'a.'.repeat(n/2)` | | | | | | `RangeError` |
| `ghp_…{16,}\b`, `github_pat_…{16,}\b`, `sk-…{16,}\b` (`lib.mjs:17–19`) | előtag + `'a'.repeat(n)` (+ `_` / `-`) | | | | | OK | `RangeError` |
| `Bearer\s+[…]{8,}` (`lib.mjs:21`) | `'Bearer x' + 'a'.repeat(n)` | | | | | OK | `RangeError` |
| `AIza[…]{20,}` (`external-review.mjs:191`) | `'AIza' + 'a'.repeat(n)` | | | | | OK | `RangeError` |
| `postgres(?:ql)?://[^\s…]+` (`lib.mjs:15`) | `'postgres://' + 'a'.repeat(n)` | | | | | | OK (100 M is) |
| `AKIA[0-9A-Z]{16}` (`lib.mjs:20`) | rögzített hossz | | | | | | OK |
| design-assets `redact` (`source/scripts/design-assets/lib.ts:328`) | `+` ismétlés | | | | | | lineáris, OK |

Megfigyelés (mérve): a V8 a `[osztály]{n,}` alakot visszalépési veremmel futtatja, ez 20 M-nál túlcsordul; a pontosan
egyenértékű `[osztály]{n}[osztály]*` alak 100 M karakteren is lineáris és nem dob.

## 2. NEM cél

- Kapulogika, CI, hookok (`scripts/qa/hooks/`), `.github/workflows/` módosítása; refaktor.
- Az `external-review.mjs` bekötése a kapukba.
- A titok-KERESŐ (nem kitakaró) minták: `external-review.mjs` `SECRET_PATTERNS` / `EMAIL` (89–102., 146. sor), a
  `lint-gate.mjs` `TOKEN` / `DB_URL` (30–31. sor). Ezeket a megbízás szerint csak mértük; a lelet a PR-leírásba kerül,
  döntés az orkesztrátoré (a keresők viselkedése kapulogika).

## 3. Érintett területek

- `scripts/qa/gates/lib.mjs` — `REDACTIONS` (a minták átírása; a `redact()` aláírása változatlan).
- `scripts/qa/gates/external-review.mjs` — `maskSecrets()` mintája; új `maskClip(s, key, max)` és `MASK_WINDOW`; a vágó hívók
  (325., 420., 422., 468., 482. sor) `maskClip`-et hívnak.
- `source/scripts/design-assets/lib.ts` — új `redactClip(text, key, max)` és `REDACT_WINDOW`; a 252. sor ezt hívja.
- Tesztek: `scripts/qa/gates/lib.test.mjs`, `scripts/qa/gates/external-review.test.mjs`, `source/tests/design-assets.test.ts`.

## 4. Rögzített döntések és kényszerek

- **D1 — e-mail (a #521 review után módosítva):** a cím-kitakarás NEM regex, hanem lineáris pásztázó (`redactEmails` a
  `lib.mjs`-ben), a régi minta (`[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}`) PONTOS nyelvével, korlát
  nélkül: minden `@`-ból visszafelé a helyi-rész-karakterek futása (legfeljebb az előző csere végéig), előre a címkék
  (`[A-Za-z0-9-]+`, pont-elválasztva, üres címkénél vége); a vége a legutolsó, legalább a 2. címke, amely ≥ 2 betűvel kezdődik —
  a betűs elejéig (a régi mohó TLD). Két szomszédos `@` közti szakaszt legfeljebb kétszer olvas (egyszer előre, egyszer
  visszafelé), így a futás lineáris és rekurziómentes. (Az első változat korlátos regexe a 16-nál több címkés címet
  teljesen, a 64-nél hosszabb helyi részt részben átengedte — Codex / Sourcery, #521.)
- **D2 — token / Bearer / AIza:** `[osztály]{n,}` → `[osztály]{n}[osztály]*` (pontosan egyenértékű nyelv, ugyanazok a
  találatok, a `\b` horgonyok változatlanok).
- **D3 — vágás a kitakarás előtt:** a vágott kimenetű hívók a szöveget előbb `64 * 1024` karakteres ablakra vágják; ha a
  határon token-karakterfutás (`[A-Za-z0-9._~+/=-]`) nyúlik át, azt az ablak végéről teljes hosszában levágják (lineáris
  visszafelé lépés, #521), azon maszkolnak, és ha az ablak vágott, a maszkolt ablak végéből még `max(64, kulcshossz)` karaktert eldobnak (ott maradhatna egy
  félbevágott kulcs vagy kulcsminta), csak ezután vágnak a végső hosszra. Így a végső kimenetben határon félbevágott kulcs
  sosem maradhat, a végső hossztól függetlenül. A teljes szöveget maszkoló hívók (pl. a jelentés kiírása, 652. sor) nem
  vágnak — ott a D2 biztosítja a lineáris futást.
- **D3b — forrás-koordinátás vágás (vak L1, ff3ba86d):** a design-assets `redact` hosszabbíthat (`Bearer x` → `Bearer [kulcs]`),
  ezért ott a vágás NEM a maszkolt kimenet végéről történik, hanem a forrásban (`safeCut`): a `w.length - max(64, kulcshossz)`
  pontot addig toljuk lejjebb, amíg se teljes kulcs-előfordulást, se token-karakterfutást nem metsz, és csak az így kapott,
  teljes előfordulásokat tartalmazó előtag kerül kitakarásra. Az `external-review` `maskSecrets` csak rövidít (`***`,
  `AIza***`), ott a maszkolt végből dobott sáv a félbevágott kulcsot mindig fedi — ezt regressziós teszt rögzíti.
- **D3c — vak kör (a188a33d), felülírja a D3 / D3b vágási részét:** mindkét fájlban ugyanaz a `safeCut(text, limit, key,
  margin)`: `limit = max(64 KB, max)`; ha a szöveg legfeljebb `limit` hosszú, a régi viselkedés (teljes kitakarás, majd vágás).
  Különben a vágási pont az EREDETI szövegen `limit - max(64, kulcshossz)`-ból indul, és addig lép lejjebb, amíg se teljes
  kulcs-előfordulást, se érzékeny-karakterfutást (`[A-Za-z0-9._~+/=-]` és az e-mail `%`, `@` jele), se az előtte álló
  `Bearer` + szóköz előtagot nem metsz. Így a határon átnyúló cím helyi része sem marad, és egy már eldobott hosszú futás nem
  viszi magával az előtte álló, különálló diagnosztikát (L3). A külön `trimCrossingTokenRun` megszűnt.
- **D5 — egységes kimeneti szűrő (vak L1 / L2, a188a33d):** a kapuk `redact`-ja az önálló `AIza…` kulcsot is `<token>`-re
  cseréli; az `external-review` `maskSecrets` a kulcs és az `AIza***` után a kapuk `redact`-ját is futtatja (e-mail, Bearer-,
  GitHub-, `sk-`-token, DB-URL); a design-assets `redact` a teljes Bearer-karakterkészletet és az e-mail-címet (`[e-mail]`,
  a `redactEmails` TS-mása) is kitakarja — a `generate.ts` naplója is ezen megy át.
- **D6 — egy közös kitakaró (2. vak kör, 169cb025; felülírja a D3c / D5 megvalósítását):** `scripts/qa/gates/kitakaro.mjs`
  (+ `.d.mts`) az egyetlen kitakaró; a kapuk `redact`-ja, a külső ellenőr `maskSecrets` / `maskClip`-je és a képgyártó
  `redact` / `redactClip`-je csak a helyőrző-készletben különbözik (`PH_GATE`, `PH_EXTERNAL`, `PH_DESIGN`). Menet: az érzékeny
  tartományokat az EREDETI szövegen gyűjti — a pontos kulcs minden, átfedő előfordulását KMP-vel, a tokenmintákat (DB-URL,
  GitHub, `sk-` / `sk-ant-` / `sk-or-`, AWS, AIza, `\bBearer\s+` + teljes `[A-Za-z0-9._~+/=-]` készlet) lineáris regexszel, az
  e-mailt a D1-pásztázóval —, és ugyanezt a szöveg JSON-escape-dekódolt nézetén (`\uXXXX`, `\n`, `\"` …) is, visszavetítve; a
  metsző tartományokat egyesíti, és csak utána cserél (egy korábbi csere nem törheti szét a későbbi találatot). A vágáspont
  `limit - max(64, kulcshossz)`-ból indul, és se egyesített tartományt, se token- / e-mail-futást nem metsz; a `Bearer`-előtagot
  a valódi `\bBearer` tartomány fedi (nincs szövegheurisztika). Egy szintű escape-dekódolás: a kétszeresen escape-elt
  (`\\u0040`) alak nem cél.
- **D4:** (a D6 óta a `split(key)` helyett KMP, átfedő előfordulással is;) a helyőrzők (`<email>`, `<token>`, `AIza***`, `***`, `[kulcs]`)
  változatlanok.

## 5. Edge case-ek

- Bármilyen hosszú helyi rész, bármennyi (numerikus / egykarakteres) címke, bármilyen hosszú címke / TLD → a teljes cím
  kitakarva, mint a régi mintán (részleges kitakarás nincs — #521).
- Ami a régi mintán sem volt cím, ma sem az: TLD nélküli (`a@localhost`), egybetűs TLD-s, üres címkés (`a@b..com`), helyi rész
  nélküli (`@pelda.hu`). A TLD betűs eleje számít: `a@b.com123` → `<email>123` (a régi mohó `[A-Za-z]{2,}` szerint).
- Ablakhatáron átnyúló token-futás (pl. az átadott kulcstól eltérő általános token) → teljes hosszában levágva.
- Kulcs az ablakhatáron félbevágva → a félbevágott darab az eldobott sávba esik.
- Üres / `null` / `undefined` bemenet → üres szöveg (mint eddig).
- Kulcs nélküli (üres `key`) hívás → csak a minta fut (mint eddig).
- Ablaknál rövidebb szöveg → semmi nem esik ki (a viselkedés a régi `mask(...).slice(0, n)`).

## 6. Elfogadási kritériumok (EARS)

- WHEN a `redact()` 300 000 karakteres `@` nélküli futást kap THEN the system SHALL 1 s alatt visszatérni (CI-n is).
- WHEN a `redact()` 10 M karakteres (a régi minták 6–7 M-nál már dobtak) token- / Bearer- / tartomány-futást kap THEN the system SHALL kivétel nélkül visszatérni.
- WHEN a `maskSecrets()` / `maskClip()` 20 M karakteres `AIza…` futást kap THEN the system SHALL nem dobni, és a kimenet
  nem tartalmaz kulcsot.
- WHEN a kulcs a 64 KB-os ablak határán félbe van vágva THEN the system SHALL a végső kimenetben a kulcs egyetlen 8+
  karakteres darabját sem hagyni (`external-review` és `design-assets`).
- WHEN valós e-mail-cím (köztük 64 karakteres helyi rész), DB-URL, GitHub- / Anthropic-token, AWS-kulcs, Bearer-token van a
  szövegben THEN the system SHALL helyőrzőre cserélni, a meglévő tesztek változatlanul zöldek.
- WHEN a válasz legfeljebb max(64 KB, végső hossz) hosszú THEN the system SHALL a régi viselkedést adni (`maskClip(s,k,n) === maskSecrets(s,k).slice(0,n)`).
- WHEN egy szolgáltatói hibaszöveg e-mail-címet, `+ / = ~` karaktert tartalmazó Bearer-tokent vagy önálló `AIza…` kulcsot
  tartalmaz THEN the system SHALL ezeket a kapunaplóban, a külső ellenőr hiba- és újrapróbálási naplójában és a képgyártó
  hibájában is helyőrzőre cserélni; az ablakhatáron átnyúló cím helyi része sem maradhat (vak kör, a188a33d).
- WHEN a határon átnyúló futás előtt különálló, ártalmatlan sor áll THEN the system SHALL azt megtartani (L3).

## 7. Tesztterv

- `scripts/qa/gates/lib.test.mjs`: (a) időkorlátos teljesítményteszt több ellenséges bemeneten (300 000 kar., < 1 s
  bemenetenként, a pontos kimenet is ellenőrizve — #521); (b) 10 M karakteres token-, Bearer- és tartomány-futás nem dob; (d) pozitív esetek: 64 karakteres helyi rész,
  aldomaines cím, plusz-címkés cím, több cím egy sorban.
- `scripts/qa/gates/external-review.test.mjs`: (b) 20 M `AIza…` futás nem dob, nincs kulcs; (c) ablakhatáron félbevágott kulcs
  nincs a kimenetben (több eltolással, a végső hossz az ablak méretével egyező is); rövid szövegen `maskClip` = régi viselkedés.
- `source/tests/design-assets.test.ts`: (c) `redactClip` határeset; `requestImage` hibaága nagy válasznál kulcs nélkül, korlátos
  hosszon.
- Ellenpróba: az (a)–(c) a javítás előtti kódon elbukik (a záró sorok a PR-leírásban).

## 8. Kockázatok / visszavonási terv

- A részleges kitakarás elfogadása megszűnt (#521): a pásztázó a régi minta teljes nyelvét takarja. Kockázat: kézzel írt
  pásztázó — a régi mintával azonos viselkedést a pozitív / negatív / határ-tesztek rögzítik. Visszavonás: egy commit revertje.
- A keresők (2. pont) 20 M-s sornál továbbra is dobhatnak, és a `lint-gate` `DB_URL` mintája ismétlődő `postgres://` soron
  négyzetes — lelet, nem e PR hatóköre.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-19-kitakaro-negyzetes-regex-vegrehajtas.md`

## 10. Kiegészítés — 3. vak kör (25de6739), D6 pontosítva

- **D6a — minták:** a tokenminták szókarakterhez tapadva is illeszkednek (nincs `\b` horgony): `sk-(ant|or|proj)-…`,
  `ghp_…`, `github_pat_…`; az általános `sk-` + 16 csak betű / szám után nem indul (`(?<![A-Za-z0-9])`, `risk-…` ne legyen
  találat); `AKIA` mellett `ASIA`; a HTTP-séma kis- és nagybetűs (`\bbearer\s+…`, `i`) — a szóhoz tapadó `…Bearer` ártalmatlan
  szó marad; a DB-URL a `\`-nél megáll (JSON-ban a `\n` / `\"` escape-et nem nyeli el; ára: a jelszóban álló `\` utáni rész
  nem a DB-URL-tartomány része).
- **D6b — korlátos vágás:** `max(64 KB, max)` feletti szövegnél a `clipText` csak `limit + 6 × margin + 1024` karakteres
  előtagot vizsgál (a határon átnyúló token- / e-mail- / escape-futás végéig meghosszabbítva), és csak a `limit` előtt kezdődő
  tartományokat tárolja; a mérés (`stats`) tesztben rögzített.

## 11. D7 — osztályszabály (tulajdonosi döntés, 2026-11-22)

> A tulajdonos 2026-11-22-én űrlapon döntött, szó szerint: „Óvatos túlkitakarás (Javasolt)”.

- **Szabály:** mintánkénti foltozás helyett a naplóba / kimenetbe kerülő szövegben minden legalább 20 karakteres, betűt ÉS számot
  is tartalmazó token-futás helyőrzőt kap (`<token>` / `[kulcs]`), típustól függetlenül. Token-karakter: betű, szám és
  `+ / = _ - . ~ % \`, valamint a JSON-escape-ek (nyers szövegben a `\uXXXX` egy karakter, a dekódolt érték szerint számít; a
  `\n` `\r` `\t` `\b` `\f` `\/` `\` folytatja a futást, de nem számít bele; a `\"` előtt a futás véget ér). A futás egy
  sortörésen (és escape-elt sortörésen) átnyúlik, ha a folytatás token-karakter; a szakaszokat külön helyőrző fedi (a
  sorszerkezet megmarad). Minden e-mail-alakú szöveg helyőrzőt kap (escape-es szövegben a dekódolt nézetből).
- **Továbbra is kötelező:** a megadott kulcs (minden, átfedő előfordulás) és a DB-URL — a séma és a teljes hitelesítő rész az
  első `@`-ig, backslash-sel együtt; utána a gazda / út az első `\`-ig (JSON-ban az escape ép marad).
- **Megmaradnak** a korábbi minták is (AIza, Bearer — a második `Bearer` szót nem fogyasztja —, GitHub, `sk-…`, AWS), mert ezek
  betűs / rövid alakjait az osztályszabály nem fedi.
- **Elfogadott mellékhatás:** a kapunaplóban a hash-ek, hosszú azonosítók, számot tartalmazó hosszú útvonalak is helyőrzőt kapnak;
  egy titok-futáshoz sortöréssel tapadó következő sor eleje is.
- **Kapu-konzol (4. vak kör L3):** a `createGate` a részletet a `tail` és a soronkénti előtag ELŐTT takarja; a `cmdResult` a
  nyers kimeneten, a „failing tests:” kivágása előtt.
- **Vágás (L5):** a vizsgált előtag a határon átnyúló futás végéig legfeljebb 4096 karakterrel nyúlik túl.
- **Határ:** egy szintű escape-dekódolás; a jelszóban álló literális `"` a DB-URL hitelesítő részét lezárja.

## 12. Szűkítés — tulajdonosi döntés (2026-11-22)

> A tulajdonos 2026-11-22-én űrlapon döntött (7 NEM vak kör után), szó szerint: „Szűkítés + bontás (Javasolt)”.
> A #521 célja vissza: „lineáris, összeomlás nélküli, a főágnál nem gyengébb kitakarás”; a kitakarás teljessége külön jegy.
> Legfeljebb 2 további vak kör.

**Hatókör (felülírja az 1. pont céljának teljességi részét):** a #521 kötelező célja (a) a lineáris futás, (b) az
összeomlásmentesség és (c) hogy a kitakarás semmilyen bemeneten ne legyen gyengébb a főágénál. A teljesség (minden tokenforma
minden kimeneti úton) **NEM cél** — követő jegy (lent). A D1–D7 megvalósítás megmarad; ahol a főágnál erősebb, az többlet, nem
elfogadási feltétel.

**Elfogadási kritériumok (EARS, a 6. pont kiegészítése és elsőbbséggel):**
- WHEN a kapu `redact`-ja, a külső ellenőr `maskSecrets` / `maskClip`-je vagy a képgyártó `redact` / `redactClip`-je az
  esettábla (`scripts/qa/gates/kitakaro-cases.mjs`) bármely esetét kapja bármely alakban (sima, JSON, `\uXXXX`, tapadó) és
  vágási helyzetben THEN the system SHALL legfeljebb annyi titokdarabot hagyni, mint a főág megfelelő függvénye (rögzített
  másolat: `scripts/qa/gates/kitakaro-main-baseline.mjs`, origin/main 114eaa63) a hívók régi vágásával.
- WHEN a bemenet több millió karakter (az esettábla összefűzve ~3 M, illetve a 10 M / 20 M-es futások) THEN the system SHALL
  lineáris időben (a tesztkorlátokon belül) és kivétel nélkül visszatérni.

## 13. Követő jegy — a kitakarás teljessége (nem a #521 hatóköre)

A következő határesetek nem rontanak a főághoz képest, ezért a #521-ben nyitva maradnak; a teljességi jegy tárgyai:
- **5. vak kör (5c9568c5):** L2 — a korlátos előtag-vizsgálat (`limit + 6 × margin + 1024 + 4096`) után a vágópont egy
  csak a plafon mögött besorolható D7-futás első szakaszát, illetve egy plafonon túl nyúló, escape-elt címformát hagyhat
  (a főág maszkolatlan maradékkal vágott, nem gyengébb). Az L1 (`Bearer-` kezdetű hitelesítő — a főágnál gyengébb volt), az
  L3 (a kivétel első sora szűrés előtt) és az L4 (JSON sortörés-escape a helyőrzőben) ebben a körben javítva.
- **Korábbi körök nyitott határai:** egy szintű JSON-escape-dekódolás (a `\u0040` alak nem); a DB-jelszóban álló literális
  `"` lezárja a hitelesítő részt; a D7 túltakarása (hash, hosszú azonosító, számos útvonal, sortöréssel tapadó következő sor,
  escape-elt ékezetes szavak); a szóhoz tapadó `…Bearer` nem séma; a képgyártó parancssori eszköze ismeretlen kapcsolóra nem ad
  hibát (`--help` fizetős futást indított — külön jegy).

## 14. „Nem gyengébb a főágnál” — szerkezeti biztosíték (6. vak kör, 485ac4b0; 2026-11-22)

- **D8 — főági kompatibilitási réteg:** minden kimeneti út a saját FŐÁGI mintáit is futtatja, azonos nyelvű lineáris alakban,
  a nyers szövegen; a tartományok az új tartományokkal egyesülnek (`COMPAT` a `kitakaro.mjs`-ben): a kapunál a főági DB-URL
  (`[^\s"'`<>]+` — backslash-sel, a query-jelszót is elnyelve), GitHub-, `sk-`-, AWS-, Bearer-minta és a nyers szövegen futó
  e-mail-pásztázó (a főági regex pontos nyelve); a külső ellenőrnél az AIza; a képgyártónál a `Bearer\s+[A-Za-z0-9._-]+`
  (szóhatár nélkül) és az `sk-or-`. A nyers tartomány escape-egységet nem vág ketté (az eleje / vége az egység határára tágul).
- **D9 — főági láthatósági határ a vágott utakon:** a `maskClip` / `redactClip` kimenete nem tartalmazhat forrást a főági hívó
  (`maskSecrets(…).slice(0, max)`, illetve `redact(…).slice(0, 300)`) láthatósági határa mögül (`mainVisibleEnd`): egy új,
  rövidítő találat nem hozhat be korábban levágott szöveget.
- **Következmény (elfogadva a szűkítéssel):** a kapu útján a DB-URL a főághoz hasonlóan a záró határig nyel (JSON-ban a `\n` utáni
  részt is), a képgyártón a `…Bearer` + szóköz / sortörés + futás hitelesítőnek számít; a rövid vágott kimenet a főági határnál
  véget ér. Az érintett, korábbi körökben írt olvashatósági tesztelvárások ehhez igazítva (végrehajtási napló).
- **Nyitott (követő jegy, 13. pont):** 6. kör L6 — átfedésnél a külső ellenőr pontoskulcs-helyőrzője (`***`) helyett a korábban
  kezdődő tartományé (`Bearer <token>`) jelenik meg; a kulcs takart, csak a jelölés más.
