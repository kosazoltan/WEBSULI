# Végrehajtás: a kitakaró minták négyzetes futása és összeomlása

> Terv: `docs/specs/2026-11-19-kitakaro-negyzetes-regex.md` · Ág: `fix/kitakaro-negyzetes-regex`
> Közös szabály: meglévő tesztet átírni, gyengíteni tilos; reguláris kifejezést az Edit / Write eszközzel kell írni (C-24).
> Sorrend: T1 (tesztek) → ellenpróba a javítás előtti kódon → T2–T4 (javítás) → T5 (ellenőrzés). Atomi commitok, üzenet fájlból.

## T1 — Tesztek előbb (egy commit: `test(qa): …`)

- **T1a** `scripts/qa/gates/lib.test.mjs`, új tesztek a meglévők után:
  - `redact: lineáris idő hosszú, @ nélküli és tartomány-futáson` — bemenetek, mindegyik 300 000 karakter: `'a'.repeat(n)`,
    `'a.'.repeat(n/2)`, `'x' + at + 'a'.repeat(n)`, `'x' + at + 'a.'.repeat(n/2) + '1'`, `'x' + at + 'a-'.repeat(n/2)`,
    `'0123456789abcdef'.repeat(n/16)`; mindegyikre `performance.now()` különbség `< 1000` ms (bemenetenként külön).
  - `redact: 20 M karakteres futás nem omlik össze` — `ghp_` + 20 M `a` + `_`; `github_pat_` + 20 M `a` + `-`; `sk-` + 20 M `-`;
    `Bearer x` + 20 M `a`; `x` + at + `a.`×10 M; `assert.doesNotThrow`, és a token-előtagos esetekben a kimenet nem kezdődik
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
