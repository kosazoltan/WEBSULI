# S5 — Tantárgyi memória: végrehajtási utasítás (AI-ügynöknek)

Spec: `docs/specs/2026-10-06-s5-tantargyi-memoria.md`. Munkakönyvtár: `source/`. Windows: `npm.cmd`, `npx.cmd`. Modellhívás TILOS.
Éles DB csak olvasásra (`scripts/lib/read-only-db.ts`); `--write` futtatása TILOS.

## 1. Migráció — `source/migrations/0024_subject_memory.sql`
Tartalom (pontosan, `--> statement-breakpoint` elválasztóval):
- `CREATE TABLE IF NOT EXISTS subject_memory_cards (fingerprint varchar(32) PRIMARY KEY, subject varchar(32) NOT NULL, step varchar(32) NOT NULL,
  code varchar(64) NOT NULL, occurrences integer NOT NULL DEFAULT 0, first_seen timestamptz NOT NULL, last_seen timestamptz NOT NULL,
  status varchar(8) NOT NULL CHECK (status IN ('open','watch','closed')), evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  corrective_summary text, corrective_at timestamptz, corrective_count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now())`
- `CREATE INDEX IF NOT EXISTS subject_memory_cards_subject_status_idx ON subject_memory_cards (subject, status)`
- `CREATE TABLE IF NOT EXISTS subject_memory_events (card_fingerprint varchar(32) NOT NULL REFERENCES subject_memory_cards(fingerprint) ON DELETE CASCADE,
  evidence_key varchar(160) NOT NULL, seen_at timestamptz NOT NULL, PRIMARY KEY (card_fingerprint, evidence_key))`
Ellenőrzés: a teszt beolvassa a fájlt, és `IF NOT EXISTS`-t vár minden CREATE-ben.

## 2. Séma — `source/shared/schema.ts`
A fájl végére `subjectMemoryCards`, `subjectMemoryEvents` pgTable a fenti oszlopokkal (drizzle), `SubjectMemoryCardRow` típus.

## 3. Tiszta modul — `source/server/memory/subject-memory.ts`
Exportok:
- `subjectMemoryEnabled(env = process.env)`: `env.STUDIO_SUBJECT_MEMORY === "1"`.
- `MEMORY_LIMITS = { promptCards: 6, promptChars: 1500, snapshotCards: 40, evidenceRefs: 10, summaryChars: 300, decayDays: 45, openAt: 2 }`.
- `type MemoryRole = "pedagogue" | "author" | "bank"`; `type MemoryEvidence = { subject; step; code; key; at: number; summary?: string }`.
- `type MemoryCard = { fingerprint; subject; step; code; occurrences; firstSeen: number; lastSeen: number; status; evidence: string[]; correctiveSummary: string | null; correctiveAt: number | null; correctiveCount: number }`.
- `cardFingerprint(subject, step, code)`: sha256 `s5:1|subject|step|code`, 32 hex.
- `evidenceFromRun(view, subject)`: workflow-leletek + `failures` (spec „Bizonyíték-képzés” 1. és 3.). `subject` null → `[]`.
- `evidenceFromLektorNotes(jobId, notes, subject)`: csak `severity === "blocker"` (spec 2.).
- `foldEvidence(existing: MemoryCard[], seenKeys: Set<string /* fp|key */> | Map<string /* fp|key */, number /* seen_at ms */>, evidence, now)` (review #204: Map esetén az `evidence` a legújabb ≤ 10 kulcs idő szerint) → `{ cards: MemoryCard[] /* érintett */, events: Array<{ fingerprint; key; at }> }`.
- `statusAt(card, now)`.
- `memoryPromptBlock(cards, subject, role, now, runs?)`: üres string, ha nincs sor; a gyakoriság a kódcsoport különböző kulcsai (`runs[role|code]` vagy `distinctRuns`, review #204).
- `memorySnapshot(cards, subject, now)`: `{ version: 1, subject, at, cards, runs }` (csak `open`, a tantárgyé, ≤ 40, rendezve; `runKeys` nélkül).
- `memoryBlockVersion(block)`: sha256 első 12 jele.
Teszt: `source/tests/subject-memory.test.ts`.

## 4. DB-réteg — `source/server/memory/store.ts`
- `type Query = <R>(sql: string, params?: unknown[]) => Promise<R[]>`.
- `applyEvidence(query, evidence, now)`: üres → `{ newEvents: 0, cards: 0 }`; `SELECT pg_advisory_xact_lock(hashtext('subject_memory'))`; meglévő kártyák (`fingerprint = ANY($1)`) és események
  (`card_fingerprint = ANY($1) AND evidence_key = ANY($2)`, `seen_at`-tel; `$2` = új kulcsok ∪ a kártyákon tárolt kulcsok) betöltése; `foldEvidence`; kártya-upsert (`ON CONFLICT (fingerprint) DO UPDATE SET` minden mező = EXCLUDED), esemény-insert (`ON CONFLICT DO NOTHING`).
- `recordSubjectMemory(client, record)`: ELŐSZÖR `SAVEPOINT subject_memory` (review #204: az előellenőrzés hibája se rontsa a hívó tranzakcióját); `to_regclass('public.subject_memory_cards')` null → `RELEASE` és kilép; job-azonosító = `resourceId ?? view.id` (a `sweepStudioJobs` kötése); tantárgy a `studio_jobs ⋈ knowledge_maps`-ből (nincs sor → kilép);
  lektor-jegyzetek a jobra; `applyEvidence` → `RELEASE`; bármely hiba → `logger.warn`, `ROLLBACK TO SAVEPOINT` + `RELEASE` (ezek hibája is csak napló); a `SAVEPOINT` hibája → napló, kilép.
- `loadSubjectMemoryCards(query, subject)`: `WHERE subject = $1 AND status = 'open' ORDER BY occurrences DESC, last_seen DESC LIMIT 200`; utána a kártyák összes esemény-kulcsa `runKeys`-be (review #204).

## 5. Élő hook — `source/server/workflows/learning-store.ts`
`saveSkillAudit` végén (a for-ciklus után): `await recordSubjectMemory(client, record);` (import a `../memory/store`-ból).

## 6. Prompt-bekötés — `source/server/studio/step-runner.ts` és `experience-builder.ts`
- `PipelineStore.loadSubjectMemory?(subject: string): Promise<MemoryCard[]>`; a drizzle-tárban `loadSubjectMemoryCards` a `dbPool`-lal.
- `ensureSubjectMemory(job, map, store)`: kapcsoló KI → `undefined`; `subjectKeyOf(map.meta.subject)` null → `undefined`; `job.output.subjectMemory` version 1 + azonos tantárgy → az;
  különben betöltés (hiba → `undefined`, `logger.warn`) → `memorySnapshot` → `job.output.subjectMemory`.
- pedagogue: az S6-blokk UTÁN: `if (subjectMemoryEnabled()) { const b = memoryPromptBlock(...,"pedagogue"); if (b) system += "\n" + b; }`.
- author: ugyanígy `"author"`, az S6-blokk után, a javító kiegészítések előtt.
- bank: `buildLessonExperience(..., { ...(memoryBlock ? { memory: memoryBlock } : {}) })`; `experience-builder.ts`: `ExperienceBuildDeps.memory?: string`;
  `teaching` kap `memory: { version: memoryBlockVersion(deps.memory) }`-t, ha van; a rendszerprompt a `unitCatalogText` után `${deps.memory}\n`.
Teszt: a S6-teszt mintájára hamis tárral (pedagogue KI/BE), és `buildLessonExperience` memóriával/nélküle.

## 7. Admin API — `source/server/memory/admin-routes.ts` + `routes.ts`
`subjectMemoryAdminRouter` (`isAuthenticatedAdmin`): `GET /summary` (tantárgy × újraszámolt státusz darab), `GET /cards?subject=&status=` (≤ 500 sor, újraszámolt státusszal).
`routes.ts`: `app.use("/api/admin/subject-memory", subjectMemoryAdminRouter);` a katalógus-router mellé.

## 8. Backfill — `source/scripts/memory/backfill.mts`
`npx.cmd tsx scripts/memory/backfill.mts [--write] [--out <json>]`. Olvasás `withReadOnlyDb`-vel: futások (`resourceId` ⋈ `studio_jobs` ⋈ `knowledge_maps`), blokkoló jegyzetek (⋈ jobs ⋈ maps).
Bizonyíték a §3 függvényeivel, fold üres állapotból, kimenet: összes/tantárgyankénti kártya státusz szerint, top 10 visszatérő kód tantárgyanként, kihagyott futások oka.
`--write`: `withWriteTransaction` + `applyEvidence` (NEM futtatandó ebben a szeletben). Alapértelmezett kimenet: `docs/measurements/2026-10-06-s5-backfill-dryrun.json`.

## 9. Ellenőrzés (sorrendben, `source/`-ban)
1. `node --import tsx --test tests/subject-memory.test.ts tests/catalog-s6.test.ts` → mind pass.
2. `npx.cmd tsx scripts/memory/backfill.mts` → JSON kiírva.
3. `npm.cmd run check`, `npx.cmd tsc --noEmit -p tsconfig.test.json`, `npm.cmd run lint`, `npm.cmd test` → 0 hiba.
4. Commit: `feat(memory): S5 — …`, utolsó sor `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push NINCS.
