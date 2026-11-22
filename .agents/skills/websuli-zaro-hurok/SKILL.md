---
name: websuli-zaro-hurok
description: WEBSULI záró hurok (kötelező, tulajdonosi utasítás 2026-11-22). Töltsd be automatikusan MINDEN lezárt WEBSULI-feladat (fejlesztés, javítás, PR, vizsgálat) után és minden session végén, a záró jelentés ELŐTT - csapda, YAML / QMD / Cogni / vektor / kanban memória, retró, skill-döntés, ismétlődő hibaosztály, higiénia, tiszta fa. Kapu - npm run zaro:check -- --since <ISO>. Vak kör előtt - node scripts/qa/zaro-hurok.mjs konvergencia.
---

# Záró hurok — a WEBSULI saját változata

Terv: `docs/specs/2026-11-22-zaro-hurok-websuli.md` (D1–D14). A hurok teljesülését a repón belüli kapu dönti el, nem az ügynök
állítása: `npm run zaro:check -- --since <a feladat kezdete, ISO>` → exit 0. A globális `futas-vegi-zaras` skill az általános hurok;
ez a WEBSULI-rétegeket és -parancsokat rögzíti.

> A `.hermes.md` végi `agentic-qa-kit:zaro-hurok` markeres blokk egy másik gép eszközéé — NE szerkeszd. A WEBSULI-ban a csapdafájl
> **`docs/agent-csapdak.md`** (nincs `.hermes/projekt/TRAP.md`), a skillek helye `.agents/skills/` (forrás) ↔ `.claude/skills/` (tükör),
> a kapu `scripts/qa/zaro-hurok.mjs` (nem az agentic-qa-kit szkriptje).

## A hét lépés (egyik sem hagyható ki; ha egy rétegben nincs új, jelölővel rögzítsd)

1. **Csapda** — `grep -n "<tünet>" docs/agent-csapdak.md`; új mért csapda a katalógus VÉGÉRE + egy indexsor. Ágon a sorszám
   **ideiglenes**: `C-<ág-rövidítés>-N` (pl. `C-ZH-1`); a végleges `C-NN`-t az orkesztrátor adja a merge ELŐTT (a kapu a főágon
   FAIL-lel jelzi a bennmaradt ideiglenes számot). Minden új bejegyzés skillre hivatkozik (`.agents/skills/<név>/SKILL.md`) vagy
   `nincs-skill: <indok>` sort kap. Ha nincs új: `node scripts/qa/zaro-hurok.mjs nincs-uj --kind trap`.
2. **Memória-rétegek** — csak igazolt tény, forrás-fájllal; titok, e-mail-cím, személyes adat TILOS (`no-real-emails-guard`).
   - YAML: `memory/manifest.yaml` (cél, nyelv, runtime, kapuk, rétegtérkép);
   - QMD: `memory/index.qmd` (belépő, modultérkép);
   - Cogni: `memory/.cogni/{project,modules,decisions,schema}.cogni.yaml` — tulajdonosi döntés → `decisions` (dátum, szó szerint, érintett fájl);
   - jegyzet: `memory/notes/*.md` — új fájl CSAK a `memory/indexes/index.yml` `notes` gyűjteményével együtt (`memory-index-guard`, C-ZH-1).
   Ha egy rétegben nincs új: `node scripts/qa/zaro-hurok.mjs nincs-uj --kind yaml,qmd,cogni` (YAML-ban `# zaro-hurok: <ISO> nincs-uj`,
   Markdown/QMD-ben `<!-- zaro-hurok: <ISO> nincs-uj -->`; fajtánként egy jelölő, a régi cserélődik).
3. **Vektoros réteg** — a WEBSULI-környezetben nincs vektoros memória; ne állítsd vezetettnek. A kapu a helyi beágyazót (Ollama)
   próbálja: „nem elérhető” → N/A, nem buktat.
4. **Retró + kanban** — retró: `docs/handoffs/<dátum>-<téma>-retro.md` vagy a terv „Állapotnapló” fejezete bővül (mért tények:
   mi ment rosszul, mennyibe került, mit javítottunk fájllal). Kanban: a Claude Code saját környezetében vezetett tapasztalat-kanban
   (`~/.claude/projects/<repó-név, pl. D--repo-WEBSULI>/kanban/tapasztalat-kanban.md`; NEM a Hermes) frissül — a kapu alapból
   ezt nézi, a `--kanban-file <út>` felülírja. Ha nincs kanban-változás:
   `node scripts/qa/zaro-hurok.mjs nincs-uj --kind kanban` (a manifestbe `# zaro-hurok: <ISO> nincs-uj kanban`).
5. **Skill-döntés** — kell-e új skill vagy skill-bővítés a futás tanulságaiból? A tükör ép legyen:
   `node scripts/qa/gates/skills-sync-check.mjs` (javítás: `--fix`; új tükrözött skill → `scripts/qa/gates/gates.config.json` `mirroredSkills`).
6. **Ismétlődő hibaosztály** (tulajdonosi „törvény”, 2026-11-22: ugyanazt a hibát tilos ugyanúgy újra elkövetni) — nézd át, a futás
   hibái között volt-e már rögzített hibaosztály (`docs/agent-csapdak.md` index, a memória retró-naplója). Ha igen, a szöveg NEM elég:
   **gépi kényszerítés** kell — szkript, teszt, őr vagy hook (pl. `scripts/qa/…`, `source/tests/*-guard.test.ts`, `.claude/settings.json`
   hook), és a csapda-bejegyzésbe a kényszerítő fájl neve. Ha két próbálkozás után sem megy: internetes szakmai forrás (fórum, GitHub,
   dokumentáció), a megoldás és a forrás a csapdába, a memóriába és a skillbe.
7. **Higiénia + tiszta fa** — `node scripts/qa/zaro-hurok.mjs hygiene` (CSAK riport); `--apply` kizárólag a főágba beolvasztott, munkafa
   nélküli helyi ágat (`git branch -d`) és a lezárt (beolvasztott, tiszta, nem aktuális) munkafát (`git worktree remove`, `--force`
   nélkül) távolítja el, az árva bejegyzést pedig `git worktree prune`-nal. Nem beolvasztott munka, piszkos / detached munkafa, a `main`
   és az aktuális ág érintetlen; távoli ághoz soha. Felesleges fájl archiválva, nem törölve. Végül commit → `git status --porcelain` üres.

## A kapu

```bash
npm run zaro:check -- --since 2026-11-22T09:00:00+01:00            # emberi kimenet
npm run zaro:check -- --since <ISO> --json                        # JSON; exit 0 = zöld, 1 = piros, 2 = hibás hívás
```

Lépései: `csapda`, `csapda-sorszam`, `yaml`, `qmd`, `cogni` (változott vagy friss jelölő + érvényes YAML + nincs TODO), `vektor`
(N/A / INFO), `retro`, `kanban`, `skill`, `higienia` (INFO, nem buktat), `tiszta-fa`.

## Vak kör előtt — konvergencia (C-ZH-2)

Új vak kör (`npm run gate:blind-review`) ELŐTT: `node scripts/qa/zaro-hurok.mjs konvergencia` (az aktuális ág fejeinek
`blind-review-<fej>.json` bizonyítékaiból; `--heads` / `--reports` is megadható). Exit 1 → TILOS új kör: a blokkolók száma nem
csökkent szigorúan, vagy 3+ NEM jött egymás után. Ilyenkor megközelítésváltás: követelmény / invariáns egy mondatban →
hibaosztály-leltár (a diff minden előfordulása táblázatban, közös segéddel) → PR-bontás ≤ ~400 sor → internetes szakmai forrás →
tulajdonosi döntés űrlapon.

## Tiltások

Fizetős szolgáltatás a hurokban semmilyen formában. Titok soha a memóriába, csapdába, kanbanba. A kapu megkerülése tilos; hibás kapunál
a kaput kell javítani (teszttel: `scripts/qa/zaro-hurok.test.mjs`).
