# Spec: Ügynök-vezérlő anyagok diétája (AGENTS.md, skillek, csapdák, memória)

> Dátum: 2026-11-17 · Szerző: Claude Code (alügynök) · Állapot: JÓVÁHAGYVA (tulajdonosi kérés 2026-11-17)
> Végrehajtás: `docs/specs/2026-11-17-vezerles-dieta-vegrehajtas.md`

A tulajdonos kérése (2026-11-17, saját szavaival): „Ellenőrizd, hogy a websuli lelkei, AGENTS.md, a soulok, a skillek
megfelelő hosszúságúak, vagy túlterjeszkedőek, a memóriák túlterjeszkedőek; párhuzamos műveletként végezd el a teljes
Soul, Skill, AgentMD, ClaudeMD diétát. Úgy, hogy közben a websuli fejlesztése ne álljon le, ne sérüljön, az folytatódjon
tovább.”

## 1. Cél

Az ülések elején betöltődő és az ügynököket vezérlő szöveg legyen rövid, ismétlésmentes, ellentmondásmentes és pontos,
úgy, hogy egyetlen érvényes szabály, tulajdonosi döntés vagy tilalom sem vész el. A diéta tömörítés és rendezés, nem
szabálytörlés.

## 2. NEM cél

- Szabály enyhítése, tulajdonosi utasítás más jelentésre fogalmazása.
- Kód, teszt, CI módosítása (`source/` érintetlen → nincs telepítés).
- Új csapda felvétele a katalógusba (a futó szeletek javaslatait az orkesztrátor gyűjti, C-48).
- Kezelt blokkok kézi átírása az `AGENTS.md`-ben (`agentic-qa-kit`, `CHATGPT_CODEX_PROTOCOL`,
  `CODEX_SHARED_QUALITY_RULES` markerek között).
- A `tananyag-*` / `websuli-*` skillek tartalmi működésének (gyártási lépések, sémák) változtatása.
- Hermes-profilok `SOUL.md`-je: egyik sem WEBSULI-specifikus (`grep -ci websuli` = 0), ezért hatókörön kívül.

## 3. Érintett területek

**1. lépcső (ez a PR):**
- `docs/agent-csapdak.md` — tematikus INDEX az elején (egy sor / csapda), a részletek változatlanok, az azonosítók
  (C-nn) nem változnak.
- `.agents/skills/{tananyag-javito,tananyag-keszito,websuli-internet-pipeline,websuli-studio-tools}/SKILL.md`,
  `.claude/skills/websuli-gyartas-analitika/SKILL.md` — a négyszer szó szerint ismételt mandátum-blokk egysoros
  hivatkozásra; elavult hivatkozás jelölése (`section-patch.ts`, az S4b óta nem létezik).
- `docs/kanban.md` — a lezárt állapot-pillanatképek (2026-10-05, 10-18, 11-02) archívumba; a mandátum-pont hivatkozásra.
- `docs/archive/agent-vezerles-2026-11-17/` — a kivett, de még hasznos részletek.

**Repón kívül (nem a PR része, de ugyanebben a futásban):** a projekt-memória (`~/.claude/projects/D--repo-WEBSULI/memory/`)
és a globális `~/.claude/CLAUDE.md` — mentés `memory/archive/2026-11-17/` és `~/.claude/archive/` alá, hash-ellenőrzéssel.

**2. lépcső (csak a `chore/minosegkapuk` PR összevonása után):** `AGENTS.md` (a nem kezelt részek), `.cursor/rules/*.mdc`,
`.cursorrules`, `docs/telepites-elotti-or.md`, `docs/agent-haromfazisu-munka.md`. A terv a 10. pontban.

## 4. Rögzített döntések és kényszerek

- Semmi nem törlődik: a repóban a git-történet és a `docs/archive/agent-vezerles-2026-11-17/` az archívum.
- Ismétlődő szabály egy helyre (a legszigorúbb megfogalmazással), a többi helyen egysoros hivatkozás, dátummal.
- A „KÖTELEZŐ”, „TÖRÖLNI TILOS”, „tulajdonosi utasítás <dátum>” jelölésű szabályok jelentése és dátuma marad.
- Szabály-leltár a diéta előtt és után; minden tétel új helye kimutatva (PR-leírás + zárójelentés melléklete).
- Csak dokumentum és skill változik; egy push; zöld CI után nincs további push (C-62).

## 5. Edge case-ek

- Párhuzamos PR-ok a `docs/agent-csapdak.md` VÉGÉRE fűzhetnek (orkesztrátori docs-PR): az index a fájl elején van,
  a bejegyzések nem mozdulnak → a hozzáfűzés nem ütközik; az új bejegyzéshez egy indexsor is kell (a fejléc kimondja).
- A skillekre más doksik útvonallal hivatkoznak: a fájlok helye nem változik.
- A memória-fájlokra `[[slug]]` hivatkozások mutatnak: a fájlnevek és a `name` slugok nem változnak.
- A `mojibake-guard` teszt a `.agents/skills` és `.cursor/rules` fájlokat is vizsgálja: csak UTF-8, ékezethelyes szöveg.

## 6. Elfogadási kritériumok (EARS)

- WHEN a PR elkészül THEN the diff SHALL only touch `docs/**`, `.agents/skills/**`, `.claude/skills/**`.
- WHEN a szabály-leltár előtte-utána összevetése lefut THEN every rule SHALL have a new location (0 elveszett tétel).
- WHEN az ügynök a csapda-katalógust olvassa THEN the index SHALL list all C-01…C-72 IDs exactly once, in a section
  that precedes the first detailed entry.
- WHEN `node scripts/qa/three-phase-check.mjs --base origin/main` fut THEN it SHALL exit 0.
- WHEN `git diff --check origin/main...HEAD` fut THEN it SHALL report nothing.

## 7. Tesztterv

- `node scripts/qa/three-phase-check.mjs --base origin/main` (0).
- `git diff --check` (üres).
- Index-ellenőrzés: a `docs/agent-csapdak.md` `## C-nn` címsorainak és az indexsoroknak az azonosítóhalmaza azonos.
- `source/tests/no-real-emails-guard.test.ts` és `source/tests/mojibake-guard.test.ts` (ha a munkafában telepíthető;
  különben a CI futtatja).

## 8. Kockázatok / visszavonási terv

- Kockázat: egy szabály árnyalata elvész a rövidítéskor → leltár + archív példány; visszavonás: `git revert`.
- Kockázat: ütközés a futó kapuk-PR-ral → az `AGENTS.md` / `.cursor/rules` a 2. lépcsőben, a kapuk-PR után.
- Memória: teljes mentés a `memory/archive/2026-11-17/` alatt (SHA-256 lista: `SHA256SUMS.txt`); visszaállítás másolással.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-17-vezerles-dieta-vegrehajtas.md`

## 10. A 2. lépcső terve (a kapuk-PR összevonása után alkalmazandó)

Mérés előtte (2026-11-17, origin/main 443d6b76): `AGENTS.md` 276 sor / 2258 szó / ~4479 token (char/4), ebből a nem kezelt
(repó-saját) rész az 1–15. és a 96–186. sor (~105 sor). A kezelt blokkok (16–94, 187–220, 222–276) érintetlenek.

| Repó-saját szakasz | Ismétli | Teendő | Becsült megtakarítás |
|---|---|---|---|
| Alapelvek: „Háromfázisú munka kötelező” pont | a „Háromfázisú munka” szakaszt (116–122) és a kezelt „Terv-először” / „Spec-kötelezettség” blokkot | egy helyre: a „Háromfázisú munka” szakasz marad (2026-09-09, „ne várj második mehet üzenetre”), az Alapelvekben egysoros hivatkozás | ~6 sor |
| Alapelvek: „Titkot soha ne írj…” | a kezelt CODEX protokoll „Biztonság” és a közös minőségkapu titok-pontját | egysoros hivatkozás a kezelt blokkra | ~2 sor |
| Alapelvek: „Kód, teszt, build … előnyt élvez” + „Verifikáció” szakasz | a kezelt „legszűkebb ellenőrzés” pontot | összevonás; egyedi rész marad: „ugyanazt a bukó parancsot változatlan bemenettel újrafuttatni tilos” | ~5 sor |
| „Zárás” szakasz | a kezelt közös minőségkapu záró pontját | egysoros hivatkozás | ~4 sor |
| „Befejezési mandátum” (29 sor) | a globális CLAUDE.md MANDÁTUM-ot, a `docs/agent-haromfazisu-munka.md` mandátum-bekezdését, a kanban 5. pontját | a teljes szöveg EZ marad (a legszigorúbb, repóra szabott); tömörítés felsorolásra, minden dátummal (2026-11-01, 11-03 söprés, önfejlesztés, ARM64 + x64) | ~10 sor |
| „Aktív munkafázis-követés” (18 sor) | — (Hermes-eszköznevek: `process(action="wait")`) | tömörítés 5–6 sorra, a tiltás és a dátum (2026-09-05) szó szerint marad; az eszköznév mellé a Claude Code megfelelője (Monitor / háttérértesítés) | ~10 sor |
| „Review guidelines” | — | marad (kezelt blokkon kívül, review #306) | 0 |
| A kapuk-PR új szakasza | (még nem ismert) | a kapuk-PR után mérni; ha a „Verifikáció” / „Git” ponttal átfed, ott hivatkozás | ? |

Becsült összesen: ~37–40 sor, ~900–1000 token (~20–22%) az `AGENTS.md`-ből, minden ülésben.

Egyéb 2. lépcsős fájlok:
- `docs/agent-haromfazisu-munka.md`: a „Befejezési mandátum” bekezdés (28–35) → egysoros hivatkozás az `AGENTS.md`-re
  (~6 sor); a 42. sor `.cursorrules` hivatkozása marad, amíg a fájl él.
- `.cursor/rules/haromfazisu-munka.mdc`: a mandátum-bekezdés rövidítése egy mondatra hivatkozással (a Cursor
  `alwaysApply` miatt a három fázis maga önállóan olvasható marad).
- `docs/telepites-elotti-or.md`: a 6–7. pont (főág-védelem, zöld CI után nincs push) nem az őrről szól → egysoros
  hivatkozás a C-62 / C-63 csapdára és a kapuk runbookjára (~5 sor).
- `.cursorrules` (396 sor, 2026-09-09 óta változatlan, általános Cursor-szabálygyűjtemény): **tulajdonosi döntés kell**
  (lásd a PR-leírást) — javaslat: a WEBSULI-specifikus 360–396. sor és a háromfázisú bekezdés átkerül a
  `.cursor/rules/websuli-core.mdc`-be, a többi a `docs/archive/` alá; a Cursor a `.cursor/rules/*.mdc`-t olvassa.
