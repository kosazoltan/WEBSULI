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
- **D4:** a `split(key)` cseréje mindkét fájlban megmarad; a helyőrzők (`<email>`, `<token>`, `AIza***`, `***`, `[kulcs]`)
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
