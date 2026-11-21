# Végrehajtás: a kitakaró minták négyzetes futása és összeomlása

> Terv: `docs/specs/2026-11-19-kitakaro-negyzetes-regex.md` · Ág: `fix/kitakaro-negyzetes-regex`
> Közös szabály: meglévő tesztet átírni, gyengíteni tilos; reguláris kifejezést az Edit / Write eszközzel kell írni (C-24).
> Sorrend: T1 (tesztek) → ellenpróba a javítás előtti kódon → T2–T4 (javítás) → T5 (ellenőrzés). Atomi commitok, üzenet fájlból.

## T1 — Tesztek előbb (egy commit: `test(qa): …`)

- **T1a** `scripts/qa/gates/lib.test.mjs`, új tesztek a meglévők után:
  - `redact: lineáris idő hosszú, @ nélküli és tartomány-futáson` — bemenetek, mindegyik 300 000 karakter: `'a'.repeat(n)`,
    `'a.'.repeat(n/2)`, `'x' + at + 'a'.repeat(n)`, `'x' + at + 'a.'.repeat(n/2) + '1'`, `'x' + at + 'a-'.repeat(n/2)`,
    `'0123456789abcdef'.repeat(n/16)`; mindegyikre `performance.now()` különbség `< 1000` ms (bemenetenként külön).
  - `redact: 10 M karakteres futás nem omlik össze` (a régi minták 6–7 M-nál már dobtak; a 20 M itt ~20 s lenne) — `ghp_` + 10 M `a` + `_`; `github_pat_` + 10 M `a` + `-`; `sk-` + 10 M `-`;
    `Bearer x` + 10 M `a`; `x` + at + `a.`×5 M; `assert.doesNotThrow`, és a token-előtagos esetekben a kimenet nem kezdődik
    a nyers előtag + 16 karakterrel (azaz ki van takarva, ahol az eredeti is kitakarta).
  - `redact: valós címek továbbra is kitakarva` — 64 karakteres helyi rész (`'a'.repeat(64) + at + 'pelda.hu'`) → pontosan
    `<email>`; `kovacs.janos+teszt` + at + `mail.pelda.co.uk` → `<email>`; két cím egy sorban → két `<email>`; zárójelben,
    vesszővel határolt cím → csak a cím cserélődik.
  A címeket futásidőben rakd össze (`at` konstans), hogy a `no-real-emails-guard` ne lássa.
- **T1b** `scripts/qa/gates/external-review.test.mjs`, a „kulcs és maszkolás” `describe` blokkban; az importba `maskClip`,
  `MASK_WINDOW`:
  - `20 M karakteres AIza-futás: nem dob, nincs kulcs` — `maskSecrets('AIza' + 'a'.repeat(20_000_000), FAKE_KEY)` nem dob,
    az eredmény `AIza***`; `maskClip` ugyanezzel, 600-as hosszal: nem dob, nem tartalmazza a `FAKE_KEY`-t.
  - `ablakhatáron félbevágott kulcs nem marad` — eltolások `d ∈ {1, 8, 20, 30, FAKE_KEY.length - 1}`:
    `s = 'x'.repeat(MASK_WINDOW - d) + FAKE_KEY + 'y'.repeat(1000)` (a kulcs első `d` karaktere az ablakba esik);
    `maskClip(s, FAKE_KEY, MASK_WINDOW)` kimenete nem tartalmazza a `FAKE_KEY.slice(0, Math.min(d, 8))` darabot (a kitöltő
    kisbetűs `x`, a kulcs nagy `A`-val kezdődik, így a darab csak a kulcsból származhat); és
    `maskClip(s, FAKE_KEY, 600).length <= 600`.
  - `rövid szövegen a régi viselkedés` — `maskClip(t, FAKE_KEY, 400) === maskSecrets(t, FAKE_KEY).slice(0, 400)` egy kulcsot
    tartalmazó, 2 000 karakteres szövegen.
- **T1c** `source/tests/design-assets.test.ts`; az importba `redactClip`, `REDACT_WINDOW`, `requestImage`:
  - `redactClip: ablakhatáron félbevágott kulcs nem marad, a hossz korlátos` — ugyanaz a szerkezet, mint T1b, a kulcs
    `"sk-or-v1-" + "abcdef0123456789".repeat(4)`.
  - `requestImage hibaága: nagy válaszban sincs kulcs, legfeljebb 300 karakteres részlet` — `fetchImpl` hamis: `new Response(
    'x'.repeat(REDACT_WINDOW - 10) + key + 'z'.repeat(5_000_000), { status: 500 })`; a dobott hiba üzenete nem tartalmazza a
    kulcs első 8 karakterét, és `message.length <= "HTTP 500: ".length + 300`.
- Parancsok: `node --test scripts/qa/gates/lib.test.mjs scripts/qa/gates/external-review.test.mjs` (a repó gyökeréből);
  `npx.cmd tsx --test tests/design-assets.test.ts` (a `source/`-ból).
- **Ellenpróba:** a T1 commit után, a javítás ELŐTT futtasd mindkét parancsot (a lassú `redact`-teszt bemenetenként percekig
  futna: a futtatás `timeout 300`-zal). Elvárt: az (a)–(c) tesztek FAIL (időtúllépés / `RangeError` / hiányzó export). A záró
  sorokat (`# pass` / `# fail`) a PR-leírásba írd.

## T2 — `scripts/qa/gates/lib.mjs` (commit: `fix(qa): …`)

`REDACTIONS` sorai (a sorrend, a helyőrzők és a többi sor változatlan):
- 17. sor: `/\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{16}[A-Za-z0-9]*\b/g`
- 18. sor: `/\bgithub_pat_[A-Za-z0-9_]{16}[A-Za-z0-9_]*\b/g`
- 19. sor: `/\bsk-(?:ant-)?[A-Za-z0-9_-]{16}[A-Za-z0-9_-]*\b/g`
- 21. sor: `/\bBearer\s+[A-Za-z0-9._~+/=-]{8}[A-Za-z0-9._~+/=-]*/g`
- 22. sor: `/[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,16}[A-Za-z]{2,63}/g`
Egy kommentsor a tömb fölé: miért korlátos / miért `{n}…*` (a terv hivatkozásával).

## T3 — `scripts/qa/gates/external-review.mjs` (ugyanabban a `fix` commitban vagy külön)

- `maskSecrets`: a minta `/AIza[0-9A-Za-z_\-]{20}[0-9A-Za-z_\-]*/g`.
- Új export a `maskSecrets` után:
  ```js
  export const MASK_WINDOW = 64 * 1024;
  export function maskClip(s, key, max) {
    const text = String(s ?? "");
    const cut = text.length > MASK_WINDOW;
    let out = maskSecrets(cut ? text.slice(0, MASK_WINDOW) : text, key);
    if (cut) out = out.slice(0, Math.max(0, out.length - Math.max(64, key ? key.length : 0)));
    return out.slice(0, max);
  }
  ```
- Hívók: 325. sor `maskClip(r.text, key, 400)`; 420. sor `maskClip(r.text, key, 600)`; 422. sor `maskClip(last.message, key, 160)`;
  468. sor `maskClip(r.text, key, 600)`; 482. sor `maskClip(r.text, key, 400)`. A többi `maskSecrets`-hívó (vágás nélküli) marad.

## T4 — `source/scripts/design-assets/lib.ts`

- Új export a `redact` után:
  ```ts
  export const REDACT_WINDOW = 64 * 1024;
  export function redactClip(text: string, key: string, max: number): string {
    const cut = text.length > REDACT_WINDOW;
    let out = redact(cut ? text.slice(0, REDACT_WINDOW) : text, key);
    if (cut) out = out.slice(0, Math.max(0, out.length - Math.max(64, key.length)));
    return out.slice(0, max);
  }
  ```
- 252. sor: `throw new Error(\`HTTP ${res.status}: ${redactClip(text, opts.key, 300)}\`)`.

## T5 — Ellenőrzés

1. A két T1 parancs: minden teszt `pass`, `# fail 0`.
2. Mérés előtte / utána: `scratchpad/kitakaro/before-after.mjs` (a munkafán kívül) 10 000 / 30 000 / 100 000 / 300 000 kar.
   a régi és az új `REDACTIONS`-szel; a táblázat a PR-leírásba.
3. `npm run gate:stage` a munkafa gyökeréből; a záró sorok a jelentésbe. 10 percnél hosszabb futásnál megállás és jelentés.
4. PR-leírás a munkafán kívül (`docs/minosegkapuk.md` kötelező szakaszai: elfogadási lista `- [x]`, Futtatott ellenőrzések,
   Nem futtatott + ok), csapda-javaslattal (C-48: a közös katalógusba nem írunk).

## T6 — A #521 review leletei (Codex / Sourcery), előbb bukó teszttel

- **T6a (tesztek, commit: `test(qa): …`)** — `scripts/qa/gates/lib.test.mjs`: a 300 000-es tesztben minden bemenetre a pontos
  elvárt kimenet (`same(s)` vagy `<email>`), új bemenetek: `'b'×n + '@pelda.hu'`, `'x@' + 'a.'×n/2 + 'com'`, cím a hosszú futás
  végén / elején; a 10 M-s tesztben három pontos kimenet; új teszt: `person@` + `'1.'×17` + `example.com` → `<email>`, 40
  egykarakteres címke, 80 betűs TLD, 70 karakteres címke, negatívok (`a@localhost`, `a@b.c`, `a@b..com`, `@pelda.hu`) és
  `a@b.com123` → `<email>123`; a 80 karakteres helyi rész → pontosan `<email>`. `external-review.test.mjs`: határon átnyúló
  `T`-futás (30 / 100 / 5000 karakter az ablakban) nem marad; 78 karakteres, `#`-et tartalmazó kulcs határesete (A3).
  `design-assets.test.ts`: a `clipKey` nem illeszkedik az `sk-or-` / `Bearer` mintára (`"kulcs#" + … + "#vege"`); új teszt: határon
  átnyúló `sk-or-…` / `Bearer …` token nem marad.
- **T6b (`lib.mjs`)** — az e-mail-sor kikerül a `REDACTIONS`-ből; új `redactEmails(text)` a D1 szerint (karakterkód-vizsgálat,
  `indexOf('@')`), a `redact()` a tömb után hívja.
- **T6c (`external-review.mjs`, `design-assets/lib.ts`)** — új segéd `trimCrossingTokenRun(text, window)` mindkét fájlban: ha
  `text[window-1]` és `text[window]` is token-karakter (`[A-Za-z0-9._~+/=-]`), a futás elejéig visszalép, és ott vág; a
  `maskClip` / `redactClip` ezt használja a `slice(0, WINDOW)` helyett; a `max(64, kulcshossz)` sáv marad.
- **T6d** — terv: D1, D3, 5. pont, 7. pont, 8. pont igazítva. Ellenőrzés: a két T1 parancs zöld; `gate:stage` + `gate:push` a
  gép-zárral egy szkriptben.

## T7 — Vak ellenőr L1 (GPT, ff3ba86d): vágás forrás-koordinátában

- **T7a (teszt előbb)** `source/tests/design-assets.test.ts`: a jelentés bemenete a `requestImage` hibaágán (kulcs = választest =
  `'SYNTHETIC_PRIVATE_MARKER ' + 'Bearer x '×8000`) → a hibaüzenetben nincs `SYNTHETIC`; `redactClip` ablakhatáron félbevágott,
  `Bearer x`-eket tartalmazó kulccsal (5 / 100 / 2000 karakter kint) → nincs `MARKER`; ablakon belüli teljes előfordulás →
  `[kulcs]`. `scripts/qa/gates/external-review.test.mjs`: ugyanez AIza-mintás kulccsal (regresszióőr).
- **T7b** `source/scripts/design-assets/lib.ts`: új `safeCut(w, key, margin)` (D3b); `redactClip` = ablak + határ-futás levágása,
  majd `redact(w.slice(0, safeCut(...)), key).slice(0, max)`. Az `external-review.mjs` változatlan (csak rövidít).

## 2026-11-21 — vak kör (a188a33d)

A független vak ellenőr (GPT-6.2 Sol) NEM ítélete, négy lelet; mind valódi, előbb bukó teszttel (`2182c9ee`), majd javítva.

- **L1 (blokkoló)** — a külső ellenőr `maskSecrets` / `maskClip` és a design-assets `redact` / `redactClip` e-mailt és teljes
  Bearer-tokent (`+ / = ~`) átengedett; a határon `%` / `@` mellett a hosszú helyi rész eleje kint maradt. Javítás (D5, D3c):
  `maskSecrets` a kapuk `redact`-ját is futtatja; a design-assets `redact` teljes Bearer-készlet + `redactEmails` TS-mása
  (`[e-mail]`); a vágás az érzékeny futást (`%`, `@` is) és a `Bearer` + szóköz előtagot teljesen eldobja. Tesztek: maszkolás,
  `generate` újrapróbálási napló + végső hiba, `requestImage` rövid hibaág, határ-e-mail mindkét fájlban.
- **L2 (blokkoló)** — a kapuk `REDACTIONS`-éből hiányzott az önálló `AIza…` kulcs. Javítás: lineáris `AIza` sor (`<token>`).
  Teszt: `redact` + `writeLog` visszaolvasva, 10 M-es AIza-futás.
- **L3 (közepes)** — a határ-futás levágása után a fix sáv az előtte álló sort is eldobta; `max` > ablak esetén a rövidebb
  bemenet is vágódott. Javítás (D3c): a sáv az EREDETI határhoz mért, `limit = max(ablak, max)`. Teszt mindkét fájlban.
- **L4 (kicsi)** — nagy bemenet megtartott előtagjának pontos maszkolását nem kényszerítette ki teszt. Új teszt; mutánspróba:
  a `cut` ágból a `maskSecrets` kivéve → csak ez a teszt bukik (1 fail / 70 pass), visszaállítva.
- A #521 hat review-szála (Codex 4633480787; Sourcery 4633501833, …847, …861, …869, …883) a fejen már kezelve volt
  (`3e7b4914` tesztek, `ff3ba86d` javítás); a 4633501833 határ-token tesztjei a D3c-vel is zöldek.

## 2026-11-21 — 2. vak kör (169cb025)

NEM ítélet: 3 blokkoló, 1 közepes, 2 kicsi; mind valódi. Orkesztrátori kérés: a kitakaró egy helyre, táblázatos teszttel.

- **Tesztek előbb** (`0a911218`): `scripts/qa/gates/kitakaro-cases.mjs` (+ `.d.mts`) közös esettábla — 13 forma (AIza; Bearer
  teljes készlettel, sortöréssel, `sk-proj` előtaggal; sk-ant; sk-or; GitHub ghp / pat; AWS; e-mail, tokenalakú helyi résszel is;
  DB-URL; hívói kulcs) × 3 alak (sima, JSON-hibatörzs `@`-val, teljesen `\uXXXX`) × 4 vágási helyzet (előtte, a vágásponton,
  az ablakhatáron, utána). `kitakaro.test.mjs`: kapu `redact` + `writeLog`, külső `maskSecrets` / `maskClip` / `generate` napló;
  `design-assets.test.ts`: `redact` / `redactClip` / `requestImage`. Piros: 7/8 a kapuknál, 3 a design-assetsnél.
- **L1** (képgyártó AIza), **L2** (korai csere szétszakít), **L3** (escape-elt cím / Bearer), **L4** (átfedő kulcs) — egy
  javítással: közös `kitakaro.mjs` (D6), a három hívó csak helyőrző-készletet ad át.
- **L5** — a vágópont-védelem mutánsa eredetileg túlélt, mert a `replaceRanges` a metsző tartományt is helyőrzőre cseréli (két
  független védelem, szivárgás nélkül). A teszt most azt is kikényszeríti, hogy a metsző kulcs a vágás ELŐTT maradjon ki;
  mutánspróba: a `cutPoint` tartomány-sora kivéve → 1 bukás mindkét fájlban, visszaállítva.
- **L6** — a `Bearer` szöveg-heurisztika megszűnt; a vágó a valódi `\bBearer` tartományt használja. Teszt: `MODE: LifeboatBearer`.
- **Csapda (javaslat a katalógusba, C-48 miatt ide írva):** a `npx tsx scripts/design-assets/generate.ts --help` NEM súgó — a
  CLI ismeretlen kapcsolót figyelmen kívül hagy, és valódi, fizetős képgenerálást indít. A futás 1 kép után leállítva (becsült
  0,093 USD; `source/design-assets/candidates/`, git-ignorált). Teendő: fizetős CLI-t füstpróbára soha ne indíts; a CLI kapjon
  ismeretlen-kapcsoló hibát / `--help`-et (külön jegy).

## 2026-11-21 — 3. vak kör (25de6739)

NEM ítélet: 2 blokkoló, 3 közepes, 1 kicsi; mind valódi, mind a közös `kitakaro.mjs`-ben.

- **Tesztek előbb** (`01f30609`): az esettábla új formái (AWS ASIA, `bearer`, `BEARER`, `PostgreSQL`) és új alakja
  (szókarakterhez tapadó: `id_…_x`; a Bearer-séma előtt előtag nélkül); L4-mérés (9 M-es, 1 M találatos bemenet: vizsgált hossz
  és tárolt találat a korláttal arányos); L5 (JSON-hiba `\n` / `\"` a DB-URL után); L6 (nagy bemenet pontos, maszkolt előtagja).
  Piros: 7 bukás a kapuknál (sk-ant tapadó, L4 stats, L5), 3 a design-assetsnél.
- **Javítás** (D6a, D6b): `\b` nélküli tokenminták, általános `sk-` betű / szám utáni tiltással, `ASIA`, kisbetűs `bearer`,
  `\`-nél megálló DB-URL; korlátos előtag-vizsgálat, csak a `limit` előtti tartományok tárolva.
- **L6 mutánspróba:** a vágott ágban `t.slice(0, max)` (maszkolás nélkül) → az új L6-tesztek mindkét fájlban bukták (sok más
  teszttel együtt), visszaállítva.
- Fizetős külső szolgáltatást hívó eszközt (a `generate.ts`-t sem) ebben a körben nem indítottam.
