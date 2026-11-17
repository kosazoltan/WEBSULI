# Minőségkapuk — runbook

Állapot: érvényes 2026-11-17-től (tulajdonosi utasítás, kötelező). Terv: `docs/specs/2026-11-17-minosegkapuk.md`, végrehajtás:
`docs/specs/2026-11-17-minosegkapuk-vegrehajtas.md`. Szabály: `AGENTS.md` „Minőségkapuk”. Skillek: `.agents/skills/websuli-*`
(forrás) és `.claude/skills/websuli-*` (bájtazonos tükör; a `skills-sync-check.mjs` és a CI őrzi).

## Miért

A 2026-11-16/17-i játékhullám öt PR-jából négynél a független review a ZÖLD CI UTÁN talált blokkoló hibát; minden ilyen kör 1–1,5 óra
CI + egy újabb review-kör volt (`docs/handoffs/2026-11-17-jatekok-utomunka-retro.md`, `docs/agent-csapdak.md` C-61…C-72). Elv: az
olcsó, helyi, determinisztikus ellenőrzés fut előbb és gyakran; a drága kör (független ellenőr, CI) csak zöld helyi kapuk után.

## A sorrend

```text
szerkesztés → gate:stage (minden szakasz után) → … → gate:push → független ellenőr + record-review
            → gate:pr -- --body-file <leírás.md> → .audit-ok → push + gh pr create → zöld CI
            → (közvetlenül a merge előtt) gate:merge -- <PR> → gh pr merge
```

Minden parancs a munkafa gyökeréből fut (`npm run gate:<x>`, vagy `node scripts/qa/gates/<x>.mjs`). Kimenet: lépésenként egy sor
(`PASS` / `FAIL` / `WARN` / `SKIP` / `NOT RUN` / `KIVÉTEL`), a végén összesítő tábla; kilépési kód 1, ha bármely lépés `FAIL`
(`--strict` mellett a `NOT RUN` is). A gyermekfolyamatok kimenete csak bukáskor jelenik meg (utolsó ~40 sor, node-tesztnél a
„failing tests” összefoglaló), szűrve: e-mail-cím, kapcsolati szöveg, token nem kerül ki. Teljes szűrt napló:
`<git-common-dir>/websuli-qa-evidence/logs/`.

## Kapunként

Mért idők: 2026-11-17, ezen a fejlesztői gépen (Windows x64, Node 26), a saját ágon, párhuzamosan futó más ügynökök mellett — a gép
terhelésétől függően ±50%.

| Kapu | Parancs | Mit futtat | Mért idő |
|---|---|---|---|
| Lint, gyors | `npm run gate:lint -- --fast` | `git diff --check`; nem követett fájlok; ESLint a változott `source/client/src` + `source/server` fájlokra; `tsc` csak változott `.ts`-nél, a teszt-`tsc` csak változott tesztnél; repó-szabályok a diffre (`repo-rules.json` + az `enforce-repo-rules` hook a hozzáadott sorokra); tiltott minták; `no-real-emails-guard`; skill-tükör | 11 s (tsc nélkül); változott `.ts`-sel ~60–90 s |
| Lint, teljes | `npm run gate:lint` | a fenti + teljes `npm run lint` + mindkét `tsc` | 146 s (lint 12 s, check 45 s, check:test 40–70 s) |
| Szakasz | `npm run gate:stage` | lint gyors + a változott fájlokhoz leképezett egységtesztek + minden `*-guard.test.ts` (23 db) + a `scripts/qa` tesztjei, ha érintett | 47 s (tsc nélkül); tsc-vel ~115 s |
| Push előtt | `npm run gate:push` | tiszta fa; `git fetch`; lint teljes; teljes egységteszt; háromfázisú rend; PR-méret; friss main (ha nincs beolvasztva: őr-tesztek az összefésült állapoton); közös fájlok; `.audit-ok`; „zöld CI utáni push” | 251 s (ebből a teljes egységteszt 132 s) |
| PR előtt | `npm run gate:pr -- --body-file <út>` | PR-leírás sablon; ítélet; a push-kapu minden lépése; `npm run build`; játék / UI: CI-azonos böngészős út; DB: `test:learning-db` | MÉRÉS: lásd a PR-leírást (a saját ágon böngészős út nélkül) |
| Merge előtt | `npm run gate:merge -- <PR>` | CLEAN; kötelező ellenőrzések a jelenlegi fejen; nyitott szálak; main-elmozdulás (C-61); ítélet; futásőr; telepítés-jelzés; `/api/rt/status` | MÉRÉS: lásd a PR-leírást |

### Tiltott minták (a diff hozzáadott soraiban, `FAIL`, érték kiírása nélkül)

`.only(` / `.skip(` / `fixme(` / `xit(` / `{ only: true }` tesztfájlban; `git … --no-verify` szkriptben (`scripts/`, `*.sh`,
`*.ps1`, `package.json`, `.github/`); privát kulcs blokk; AWS-kulcs; GitHub / Anthropic / Slack token-előtag; jelszavas adatbázis-URL
nem-loopback gépre. A `console.log` tiltását az ESLint `no-console` + `--max-warnings 0` adja (nem duplikáljuk). Az
`enforce-repo-rules` heurisztikus titok-gyanúja (`password = "…"`) csak `WARN` — emberi átnézés; a valódi titok-mintát a fenti szabály
viszi bukásra.

### Ismert helyi kivétel

- **`native-arch` (C-38):** friss munkafában (`npm ci --ignore-scripts`) a `better-sqlite3` natív kötése nem épül fel, ezért a
  `native-arch.test.ts` és a `doctor:arch` helyben bukik. A push-kapu ezt `KIVÉTEL`-ként jelzi, de CSAK akkor, ha (a) ez az egyetlen
  bukó tesztfájl és (b) a `doctor:arch` is bukik. A CI `native-arch` jobja x64-en és ARM64-en futtatja. Más bukás mellett, vagy zöld
  `doctor:arch` mellett: `FAIL`.

### A bizonyíték és a hook

- A kapuk a fej-commitra írnak bizonyítékot: `<git-common-dir>/websuli-qa-evidence/{pre-push,pre-pr}-<fej>.json`,
  `merge-<PR>-<fej>.json`, `review-<fej>.json`. A közös git-könyvtárat a fő checkout és minden munkafa ugyanúgy látja (a fő
  checkoutban `.git/`, munkafában a `git rev-parse --git-common-dir`), ezért a munkafában futtatott kapu bizonyítékát a fő checkoutból
  kiadott parancs (`git -C <munkafa> push`, `cd <munkafa> && git push`) hookja is megtalálja. Nem commitolható.
- `scripts/qa/hooks/check-quality-gates.mjs` (PreToolUse, Bash + PowerShell) — CSAK OLVAS:
  - `git push` → zöld `pre-push-<fej>` vagy `pre-pr-<fej>` kell (a megnevezett ág feje, különben a HEAD);
  - `gh pr create` → zöld `pre-pr-<fej>`;
  - `gh pr merge [n]` → a PR JELENLEGI fejére szóló, legfeljebb 15 perces zöld `merge-<n>-<fej>` (a fejet a `gh`-tól kéri);
  - vizsgálat nélkül enged: távoli ág törlése (`--delete`, `-d`, `:ág`), `--dry-run`, idézőjelben / `echo`-ban álló szöveg, más repó
    (amelyben nincs `scripts/qa/gates/pre-push-gate.mjs` — ez a még kapu nélküli, régebbi ágakat is jelenti);
  - hibánál (pl. `gh` nem válaszol) a kibocsátó parancsra DENY. A meglévő `check-audit-ok`, `check-destructive`, `enforce-repo-rules`
    hookok változatlanok és függetlenek.
- A hook csak a WEBSULI-ból indított Claude Code munkamenetekre hat (a `.claude/settings.json`-t a munkamenet induláskor olvassa —
  a merge után induló munkamenetektől érvényes). Más ügynököt (Codex, Cursor) az `AGENTS.md`, a skillek és a `.cursor/rules` köt.

## Melyik mért hibát melyik kapu fogja meg

| # | Mért hibatípus (2026-11-16/17) | Gép fogja meg? | Melyik kapu / mi |
|---|---|---|---|
| 1 | Véletlen válasz (élesítés nélkül, a kérdés előtti bemenet, húzás = koppintás) | **Nem** általánosan | Fejlesztési ellenőr, 4.A/1. A böngészős út csak a meglévő spec-ek eseteit futtatja; új eset (tartott tűz, húzás a táblán) e2e-je a szelet feladata |
| 2 | Kupon módban elfogynak a kérdések | Részben | Fejlesztési ellenőr 4.A/2; a `pre-pr-gate` futtatja a lejárt-kupon spec-et, de a kimerülést csak célzott teszt méri |
| 3 | Levágott / takart válasz keskeny / fekvő nézetben | Részben | `pre-pr-gate` a mobil mérőt futtatja (átfedés, 48 px, vízszintes görgetés); a leghosszabb bank-válasz esetét csak a fejlesztési ellenőr 4.A/3 (valódi szélesség) fedi |
| 4 | A sim nem a lap magját / szabályát méri | **Nem** | Fejlesztési ellenőr 4.A/4 |
| 5 | Győzelem vereségre fordul ugyanabban a lépésben | **Nem** | Fejlesztési ellenőr 4.A/5 |
| 6 | Megállítási okok egymást feloldják | **Nem** általánosan | Fejlesztési ellenőr 4.A/6; a meglévő `game-explanation-pause` / lejárt-kupon spec-ek a `pre-pr-gate`-ben |
| 7 | Helyben zöld, CI-n (szoftveres WebGL, buildelt szerver) piros | **Igen** | `pre-pr-gate`: csomagoló konfig SwiftShaderrel, buildelt szerver, `workers=1`, eldobható Postgres — a CI útja |
| 8 | Repó-szintű őr elavult zöldre vonva pirosra tette a maint (C-61) | **Igen** | `stage-gate` (minden őr), `pre-push-gate` (összefésült állapoton), `pre-merge-gate` (main elmozdult + őrt érint → bukás) |
| 9 | Zöld CI utáni push újraindítja az 1 órás E2E-t (C-62) | Figyelmeztetés | `pre-push-gate` NAGYBETŰS figyelmeztetés (a `gh`-tól olvasott állapot); a döntés az ügynöké |
| 10 | Alügynök közös fájlhoz nyúl / a D:\ gyökerébe ír / `git checkout`-tal állít vissza | Részben | `pre-push-gate` közös-fájl figyelmeztetés (`--slice`: a közös modulok is); a nem követett fájl figyelmeztetés; a gyökérbe írást és a `git checkout`-ot csak a fejlesztési ellenőr 4.B/16 és a skillek szabálya fedi |

Őszintén: a játéklogikai hibák (1, 4, 5, 6) jellemzően szándék- és állapottér-hibák; ezeket determinisztikus kapu általánosan nem
ismeri fel. Ezért kötelező a független ellenőr — a kapuk feladata, hogy az ellenőr ne az olcsó hibákra költsön.

## Ha bukik

1. Olvasd el a `FAIL` sort és alatta a kimenetet; a kapu megnevezi a teendőt.
2. Javítsd az okot (tesztet gyengíteni, kihagyni tilos), futtasd újra ugyanazt a kaput. Ugyanazt a bukó parancsot változatlan
   bemenettel újrafuttatni tilos.
3. Ha a kapu hibás (hamis riasztás): a kaput javítsd (`scripts/qa/gates/` + teszt), ne kerüld meg. Vészkijárat nincs.

## Ellenpróbák (2026-11-17, a bevezető PR-ban)

A bevezető PR leírása tartalmazza a parancsokat és a kimenet lényegét: lint-hiba → `lint-gate --fast` FAIL; bukó egységteszt →
`stage-gate` FAIL; végrehajtási fájl nélküli kód → `pre-push-gate` FAIL (háromfázisú rend); hiányzó ítélet → `pre-pr-gate` FAIL;
nyitott review-szál → `pre-merge-gate` FAIL (egységteszt); bizonyíték nélküli `git push` → hook DENY.
