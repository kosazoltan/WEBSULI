# Végrehajtás — Játékok mobilos színvonalra emelése és központi nyelvi szóbank (2026-11-15)

Terv (kötelező forrás, döntései nem bírálhatók felül): `docs/specs/2026-11-15-jatekok-mobil-szobank.md`.
Szabály: `docs/agent-haromfazisu-munka.md` (ez a 2. fázis). Kiindulás: `main` HEAD `3e9df145`.
Minden sorszám-horgony a `3e9df145` állapot szerint, kódból ellenőrizve (Grep + részolvasás, 2026-11-15). Ha a
`main` időközben változott, a horgonyt a megadott függvény- / konstans- / testid-név alapján keresd meg újra
(`grep -n`), a sorszám csak tájékoztató.

Kanban-jegyek (repo-tábla `D:\repo\WEBSULI\.hermes\kanban.db`, felvéve 2026-11-15):

| Szelet | Jegy | Cím |
|---|---|---|
| S0 | #17 | FEAT(jatekok): S0 – terv, végrehajtási utasítás, kanban-jegyek (docs PR) — `in_progress` |
| S1 | #18 | FEAT(jatekok): S1 – szóbank-infrastruktúra |
| S2 | #19 | FEAT(jatekok): S2 – közös mobilos játékkeret |
| S3 | #20 | FEAT(jatekok): S3 – angol szóbank-tartalom 2500 bejegyzés + vak megoldó |
| S4 | #21 | FEAT(jatekok): S4 – német szóbank-tartalom 2000 bejegyzés + vak megoldó |
| S5 | #22 | FEAT(jatekok): S5 – francia szóbank-tartalom 2000 bejegyzés + vak megoldó |
| S6 | #23 | FEAT(jatekok): S6 – Szólétra mobilra + központi szóbank |
| S7 | #24 | FEAT(jatekok): S7 – Gyors matek sprint mobilra |
| S8 | #25 | FEAT(jatekok): S8 – Brain Rot Lopás mobilra + szóbank |
| S9 | #26 | FEAT(jatekok): S9 – Szökőár szökés mobilra + szóbank |
| S10 | #27 | FEAT(jatekok): S10 – Galaktikus Aszteroida mobilra + szóbank |
| S11 | #28 | FEAT(jatekok): S11 – Kockavadász kvíz mobilra + szóbank |
| S12 | #29 | FEAT(jatekok): S12 – Tornado Hunter 200 mobilra + szóbank |
| S13 | #30 | FEAT(jatekok): S13 – játéklista és főkártyák arculata, teljes mobil mátrix, verify, átfogó review, retro |

---

## K — Közös rész (minden szeletre érvényes; minden alügynök ELŐSZÖR ezt olvassa el)

### K.1 Munkarend

1. Munkakönyvtár: saját git-munkafa a friss `origin/main`-ről. Git Bash (Bash eszköz) parancsok:
   ```bash
   cd /d/repo/WEBSULI && git fetch origin
   git worktree add .claude/worktrees/jatekok-s<n> -b <a szelet ága> origin/main
   cd /d/repo/WEBSULI/.claude/worktrees/jatekok-s<n> && npm ci --prefix source
   ```
   A `.claude/worktrees/` gitignore-olt (`.gitignore:51`). A `node_modules`-t gépenként telepítjük, másolni tilos
   (`docs/agent-csapdak.md` C-01). Ha az orkesztrátor `isolation: "worktree"` móddal indított, a munkafa már kész:
   ilyenkor csak `git switch -c <ág> origin/main` és `npm ci --prefix source`.
2. Ellenőrző parancsok a munkafa GYÖKERÉBŐL (a gyökér `package.json` `npm --prefix source run …`-ra továbbít):
   `npm run check`, `npm run lint` (a `source/package.json` szerint `eslint client/src server --max-warnings 0`:
   egy figyelmeztetés is bukás), `npm run check:test`, `npm test`, `npm run build`, és
   `node scripts/qa/three-phase-check.mjs --base origin/main`.
   **Minden ellenőrzés KÜLÖN Bash-hívásban, saját kilépési kóddal**, a kimenet fájlba, a kód kiírva:
   ```bash
   cd /d/repo/WEBSULI/.claude/worktrees/jatekok-s<n> && npm run lint > /tmp/s<n>-lint.txt 2>&1; echo "lint=$?"; tail -20 /tmp/s<n>-lint.txt
   ```
   Zárójeles / `&&`-láncba fűzött ellenőrzéscsoport tilos (a lánc kilépési kódja az utolsó parancsé — memória
   „Ellenőrzés-lánc és titok-kimenet”). Ugyanazt a bukó parancsot változatlan bemenettel újrafuttatni tilos:
   előbb az okot javítsd.
3. Célzott egységteszt: `cd source && node --import tsx --test tests/<fájl>.test.ts`.
4. Böngészős teszt: alap konfigurációval CSAK `npm run test:e2e -- tests/<spec>` (saját eldobható Postgres-konténer,
   Docker kell; `npx playwright test` az alap konfigurációval tilos — C-27, a szerver éles `.env` miatt nem indul).
   Gyors, adatbázis nélküli futás a S2-ben létrehozott `source/playwright.game-mobile.config.ts`-sel:
   `cd source && npx playwright test -c playwright.game-mobile.config.ts`. A meglévő Vite-only konfiguráció:
   `npx playwright test -c playwright.game-release.config.ts` (`game-viewport-experience`, `game-win-paths`,
   `coupon-lesson.browser.ts`).
5. Fájlt a szerkesztő / író eszközzel hozz létre és módosíts, ne shell-heredockal (C-10, C-28: a hookok a parancs
   szövegét nézik).
6. Windows: a `npm` Git Bashben működik; PowerShellben `npm.cmd` / `npx.cmd`. Időbélyeg PowerShellben
   `[DateTime]::Now.ToString('o')` (a `Get-Date -Format` szót a destruktív-hook tiltja, C-20 megelőzés 4).
7. Kanban: státuszt (start / review / done) az orkesztrátor mozgat. Az alügynök csak jegyzetet írhat, explicit
   táblával (munkafából a CLI más táblát nyithat): 
   `KANBAN_DB="D:/repo/WEBSULI/.hermes/kanban.db" node --no-warnings "$HOME/AppData/Local/hermes/skills/software-development/hermes-kanban-workflow/scripts/kanban.mjs" note <id> "<bizonyíték>"`.
   A CLI státuszai: `todo → in_progress → in_review → done` (+ `blocked`).
8. Hatókör: csak a szelet fejezetében felsorolt fájlokat módosíthatod. Ha közös fájl (más szelet fájlja,
   `index.css`, `game-engine/mobile/*`, `game-engine/vocab/*`, `data/vocabBank/*` a saját szeleteden kívül)
   változtatása kellene: NE módosítsd, írd a záró jelentésbe „ORKESZTRÁTOR-KÉRÉS” alatt (fájl, ok, javasolt diff).
9. Merge-et alügynök nem végez. A merge az orkesztrátoré, előtte az aktív gyártási futások őre fut
   (memória „Nincs deploy futás közben”; terv D2).

### K.2 Háromfázisú CI-kapu (minden kódszelet)

A `scripts/qa/three-phase-check.mjs` (`decideThreePhase`, 19–50. sor) a CI-ban bukik, ha a PR `source/client/src/`,
`source/server/` vagy `source/shared/` fájlt módosít, de a PR diffjében nincs `docs/specs/*-vegrehajtas.md`
fájl, vagy az a kódcommitnál korábban nem létezett commitban, vagy nem hivatkozik létező tervre. Ezért:

- **A szelet ELSŐ commitja** ebben a fájlban (`docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`) a
  saját fejezeted `**Állapot:**` sorát írja át erre: `**Állapot:** folyamatban — ág <ág>, munkafa <útvonal>,
  kanban #<id>`. Csak a saját fejezeted sorát módosítsd (a fejezetek távol esnek egymástól, így párhuzamos
  szeleteknél nincs git-ütközés). A kód csak ezután, külön commitban jön.
- PR előtt: `node scripts/qa/three-phase-check.mjs --base origin/main` → elvárt kimenet:
  `[három-fázis] OK: Rendben: terv + végrehajtási utasítás (…), a kód utána.`

### K.3 Tesztintegritás

- Meglévő tesztet gyengíteni, törölni, `skip`/`only`/`todo`-val kikapcsolni, elvárást lazítani TILOS
  (AGENTS.md „Teszt-integritás”). Bukó meglévő tesztnél az implementációt javítsd.
- Kivétel csak dokumentált spec-változás: ilyenkor a teszt kommentjébe `SPEC-VÁLTOZÁS 2026-11-15
  (docs/specs/2026-11-15-jatekok-mobil-szobank.md <pont>)` kerül, és a követelmény nem lazulhat (a
  `tests/tornado-mobile-controls.test.ts:46–59` mintája). Ebben a funkcióban egyetlen tervezett ilyen eset sincs.
- A forrásszöveget vizsgáló őr-tesztek (pl. `game-touch-controls.test.ts`, `game-feedback-wiring-guard.test.ts`,
  `tornado-mobile-controls.test.ts`, `coupon-claim-wiring-guard.test.ts`, `grade-quiz-select.test.ts`,
  `game-levels-wiring.test.ts`, `audit-2026-09-static.test.ts`) az átrendezésnél eltörhetnek: a hívásokat és
  mintákat (pl. `touchAction: "none"`, `gradeForGame(`, `levelAdaptBand(`, `buildFeedback`, `QuizFeedbackCard`)
  meg kell tartani a lapon.
- Új teszt elvárását a szabályból vezesd le (kommentben a számítás), ne a kimenetből (C-15).

### K.4 Valós böngészős próba (UI-szeletek: S2, S6–S13)

- Kötelező mobil profil: Playwright `devices["Pixel 7"]` (érintős, `isMobile`), nézetek **360×640, 390×844,
  844×390**. Állapotok: kezdőképernyő, játék közben, szünet menü, eredményképernyő.
- Mérés a `tests/game-mobile-quality.spec.ts`-sel és a `tests/support/game-mobile-quality.ts` segédekkel (S2 hozza
  létre). Ezen felül kézi szemle a képernyőképeken: átfedés, levágott szöveg, váratlan görgetősáv.
- Képernyőképek: JPEG (`type: "jpeg", quality: 70`), szeletenként legfeljebb 8 db, egyenként ≤ 150 KB, a
  `docs/measurements/jatekok-mobil/S<n>/<játék>-<szélesség>x<magasság>-<állapot>.jpg` útvonalra, commitolva; a
  PR-leírás felsorolja az útvonalakat. (UNKNOWN: a repóban nincs korábbi gyakorlat képernyőkép csatolására; ha az
  orkesztrátor másképp dönt, ő jelzi.)
- Hálózatot csonkoló új spec ELSŐ sora `test.use({ serviceWorkers: "block" })` (C-29 megelőzés 4).

### K.5 Commit, push, PR

1. Commit-üzenet fájlból: a Write eszközzel írd a session scratchpadjába (`commit-s<n>.txt`), majd
   `git commit -F <útvonal>`. Az üzenet vége:
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (az adott modell neve, ha más modell dolgozott).
2. **Audit-hook (ellenőrizve a kódból):** `scripts/qa/hooks/check-audit-ok.mjs` minden Bash / PowerShell
   parancsra fut (`.claude/settings.json` PreToolUse). Aktív, ha a parancs SZÖVEGE illeszkedik erre:
   `/\bgit\b[^|;&]*\bpush\b/` (31. sor) — heredocban vagy doksiszövegben álló „git … push” is kiváltja. A gyökeret
   a hook a **session munkakönyvtárából** (`payload.cwd`) `git rev-parse --show-toplevel`-lel oldja fel (33–42.
   sor), a jelzőfájl neve és kora a `.agentic-qa-kit.json` szerint `.audit-ok`, legfeljebb **10 perc**
   (44–60. sor; a repo konfigja: `"sentinel": ".audit-ok", "maxAgeMinutes": 10`). Hiányzó vagy régebbi jelzőnél
   tilt. A `.audit-ok` gitignore-olt (`.gitignore:17`). Ezért:
   - előbb MIND a hat kapu zöld (K.1/2), egyenként igazolva;
   - utána KÜLÖN hívásban a jelző írása MINDKÉT helyre (a session cwd-je lehet a fő checkout is):
     `date -Iseconds > /d/repo/WEBSULI/.claude/worktrees/jatekok-s<n>/.audit-ok; date -Iseconds > /d/repo/WEBSULI/.audit-ok`;
   - utána KÜLÖN hívásban, 10 percen belül: `git push -u origin <ág>`. Commit, jelző és push soha nem egy parancsban
     (C-25 megelőzés 5).
3. PR: `gh pr create --base main --head <ág> --title "<típus>(jatekok): S<n> – <rövid név>" --body-file <scratchpad fájl>`.
   A PR-leírás kötelező elemei:
   - első sor: `S<n> / S0–S13` és a kanban-jegy száma;
   - terv: `docs/specs/2026-11-15-jatekok-mobil-szobank.md`, végrehajtás: ez a fájl, fejezet `S<n>`;
   - mit ad (2–5 pont), érintett fájlok;
   - teljesített elfogadási pontok (A/M/P azonosítókkal) és bizonyítékuk;
   - futtatott ellenőrzések a valós kimenet összegző sorával (pl. `# pass 2731`, `# fail 0`), PASS/FAIL;
     NOT RUN + ok + kockázat;
   - képernyőképek útvonalai (UI-szeletnél);
   - adatszeletnél: „A diff a 400 soros irányelv többszöröse — adatfájl (terv 4.7)”;
   - utolsó sor: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

### K.6 Záró jelentés az orkesztrátornak (kötelező formátum)

```
SZELET: S<n> — <név>   ÁG: <ág>   PR: #<szám> (vagy NOT DONE + ok)
MÓDOSÍTOTT FÁJLOK: <útvonal — 1 soros ok>, …
ELLENŐRZÉSEK (valós kimenet):
  npm run check — PASS (exit 0)
  npm run lint — PASS (exit 0)
  npm run check:test — PASS (exit 0)
  npm test — PASS (# pass N, # fail 0)
  npm run build — PASS (exit 0)
  three-phase-check — OK (<kimenet sora>)
  <célzott tesztek / Playwright> — PASS (<n passed>)
NOT RUN: <parancs> — <ok> — <kockázat>
ELFOGADÁS: <A/M/P azonosító> — <bizonyíték> …
KÉPERNYŐKÉPEK: <útvonalak>
ORKESZTRÁTOR-KÉRÉS: <közös fájl változtatási kérés vagy „nincs”>
KOCKÁZAT: <maradó kockázat>
UNKNOWN: <ami nem derült ki>
```

### K.7 Közös szerződések (S1 és S2 hozza létre; S3–S13 erre épít — itt rögzített, eltérni csak orkesztrátori jóváhagyással)

#### K.7.1 Szóbank-adat (S1) — `source/client/src/data/vocabBank/`

```ts
// types.ts
export type VocabLang = "en" | "de" | "fr";
export const VOCAB_LANGS: readonly VocabLang[] = ["en", "de", "fr"];
export type VocabLevel = 0 | 1 | 2 | 3 | 4;           // 0=A1, 1=A1–A2, 2=A2, 3=B1, 4=B2 (= LadderTier)
export type VocabKind = "word" | "phrase";
export type VocabPos = "noun" | "verb" | "adj" | "adv" | "prep" | "pron" | "conj" | "num" | "interj" | "phrase";
export type VocabTopic = (typeof VOCAB_TOPICS)[number];   // VOCAB_TOPICS a topics.ts-ben
export type VocabEntry = {
  id: string;        // "<nyelv><szint>-<téma>-<nnn>", pl. "en0-family-001"; végleges, soha nem írható át
  term: string; hu: string; kind: VocabKind; level: VocabLevel; topic: VocabTopic; pos: VocabPos;
  example: string; exampleHu: string; alt?: string[];
};
export type VocabStage = "sample" | "full";
```
- `topics.ts`: `export const VOCAB_TOPICS = ["family","school","food","home","city","time","body","clothes","weather","freetime","animals","nature","travel","shopping","health","feelings","work","technology","sports","culture","numbers","colors","everyday","communication"] as const;` és `VOCAB_TOPIC_LABELS_HU: Record<VocabTopic, string>`.
- Adatfájlok: `<nyelv>/level-<0..4>.ts`, mindegyik `export const VOCAB_<NYELV>_L<n>: VocabEntry[] = [ … ];`
  (pl. `VOCAB_EN_L0`), **egy bejegyzés = egy sor**. `<nyelv>/stage.ts`: `export const VOCAB_<NYELV>_STAGE: VocabStage`.
- Gyűjtőfájl nyelvenként: `vocab-en.ts`, `vocab-de.ts`, `vocab-fr.ts` (`export const VOCAB_EN: VocabEntry[] = [...VOCAB_EN_L0, …, ...VOCAB_EN_L4];`
  és a stage újraexportja). A fájlnév miatt a Vite külön darabot ad (`vocab-en-<hash>.js`).
- `loader.ts`: `export function loadVocabBank(lang: VocabLang): Promise<VocabEntry[]>` — dinamikus
  `import("./vocab-<lang>")`, nyelvenként gyorsítótárazott ígéret, hibánál elutasít (a hívó a kézi bankra esik vissza);
  `export function resetVocabBankCache(): void` (teszthez).
- `validate.ts`: `normalizeTerm(s)` (NFC, `toLowerCase()`, `[\s\u00A0\u202F]+` → egy szóköz, trim);
  `vocabBankProblems(entries: VocabEntry[], lang: VocabLang): string[]`; `vocabBankStats(entries)` →
  `{ total, perLevel: number[5], perTopic: Record<VocabTopic, number>, phrase: number }`;
  `minimumProblems(stats, min: VocabMinimums): string[]`.
- `minimums.ts`: `PLAN_MINIMUMS: Record<VocabLang, VocabMinimums>` (terv 4.2: en total 2500, perLevel
  [500,550,550,500,400]; de/fr total 2000, perLevel [400,450,450,400,300]; mindháromnál `phraseRatio: 0.3`,
  `perTopic: 40`), `SAMPLE_MINIMUMS: VocabMinimums` (`total: 40, perLevel: [8,8,8,8,8], phraseRatio: 0, perTopic: 0`).
- `quotas.ts`: `TOPIC_LEVEL_QUOTAS: Record<"en" | "de" | "fr", Record<VocabTopic, [number, number, number, number, number]>>`
  — a K.8.1 (en) és K.8.2 (de, fr) kvóta-táblák pontosan; a riport ehhez méri a hiányt (a teszt nem cellánként, hanem a
  terv minimumai szerint kapuz).

#### K.7.2 Szóbank-motor (S1) — `source/client/src/game-engine/vocab/`

```ts
// seenHistory.ts
export const VOCAB_SEEN_KEY = "websuli.vocabSeen.v1";
export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type SeenHistory = {
  has(lang: VocabLang, entryId: string): boolean;
  lastSeen(lang: VocabLang, entryId: string): number | undefined;
  mark(lang: VocabLang, entryId: string): void;
  markExternal(lang: VocabLang, text: string): void;       // kézi kérdés helyes válasza, kulcs "ext:" + normalizeTerm
  hasExternal(lang: VocabLang, text: string): boolean;
  setCap(lang: VocabLang, bankSize: number): void;          // nyelvenként legfeljebb a bank mérete; túllépéskor a legrégebbiek törlődnek
  size(lang: VocabLang): number;
};
export function createSeenHistory(storage: StorageLike | null, now?: () => number): SeenHistory;
// Tárolt alak: { v: 1, langs: { en?: Record<string, number>, de?: …, fr?: … } } (érték: ms időbélyeg).
// Minden olvasás a tárolóból (más játék írását is látja); bármely kivétel / sérült JSON → futáson belüli memória, kivétel nélkül.

// questionGenerator.ts
export type VocabQuestionType = "hu-to-target" | "target-to-hu" | "cloze" | "phrase-meaning";
export type VocabQuiz = FourChoiceQuiz & {
  vocabId: string; lang: VocabLang; level: VocabLevel; topic: VocabTopic; kind: VocabKind;
  questionType: VocabQuestionType; answerTerm: string;     // a bejegyzés term-je (naplózáshoz, dedupe-hoz)
};
export function generateVocabQuestion(entry: VocabEntry, bank: readonly VocabEntry[], type: VocabQuestionType, rng: () => number): VocabQuiz | null;
export function pickQuestionType(entry: VocabEntry, rng: () => number): VocabQuestionType;

// vocabSource.ts
export type VocabSource = {
  lang: VocabLang;
  bankSize: number;
  /** A kért szint (+ téma) nem látott bejegyzéséből kérdés, és NAPLÓZ. Kimerülésnél terv 4.4 szerint. */
  next(level: VocabLevel, opts?: { topic?: VocabTopic; types?: VocabQuestionType[] }): VocabQuiz | null;
  /** Kérdéskészlet NAPLÓZÁS nélkül (a Szólétra pickUnseen-jéhez); a ténylegesen feltett tételt markAsked naplózza. */
  buildPool(level: VocabLevel, count: number): VocabQuiz[];
  markAsked(q: Pick<VocabQuiz, "vocabId">): void;
  /** Kézi (nem szóbankos) kérdés helyes válasza; az azonos normalizált term- vagy hu-jú bejegyzés ezután kimarad. */
  markExternal(correctAnswer: string): void;
  /** A Szólétra LadderItem-je (category: word→"word", phrase→"phrase"; tier = level). */
  toLadderItem(q: VocabQuiz): LadderItem;
};
export function createVocabSource(opts: { lang: VocabLang; entries: readonly VocabEntry[]; history: SeenHistory; rng?: () => number }): VocabSource;

// useVocabQuizSource.ts (React)
export function useVocabQuizSource(lang: VocabLang, enabled?: boolean): VocabSource | null;
// null, amíg tölt, ha enabled=false, vagy ha a betöltés hibázott (a játék ilyenkor a kézi bankkal megy — terv 5. szakasz).
// A history a window.localStorage-ra épül (try/catch: elérhetetlen tárolónál null storage → memória).

// level.ts
export function vocabLevelForGrade(grade: number | null | undefined, band: number): VocabLevel;
// = ladderTierIndex(grade ?? 4, band) a game-engine/no-repeat.ts-ből (104. sor) — ugyanaz a skála, mint a Szólétrán.
```
- `index.ts` mindezt újraexportálja (`@/game-engine/vocab`).
- **Bekötési szabály minden nyelvi játékban (S6, S8–S12):** a választó sorrendje (1) tananyag-kvíz
  (`pickUnseenMaterial` / a meglévő tananyag-ág, változatlanul elöl), (2) ha az aktuális kérdés-hely ANGOL (a
  Szólétrán a választott nyelv) és `vocab !== null`: `vocab.next(vocabLevelForGrade(grade, band))`, (3) a meglévő
  ág (közös évfolyam-bank, kézi bank) változatlanul. Ha kézi angol kérdés megy ki, a helyes opciójára
  `vocab?.markExternal(q.options[q.correctIndex])`. A szóbankos kérdés a játék saját `seen`-listájába is bekerül
  (`markGradeQuizSeen(gradeSeenRef.current, q)` vagy a játék meglévő megfelelője), így a meglévő tartalmi
  duplikátum-szűrők is látják. A bekötés EGY helyen kapcsolható ki: a `useVocabQuizSource(…, enabled)` hívás.
- **A szóbank-forrás változójának neve `vocab`-bal kezdődik** (`vocab`, `vocabSource`, `vocabRef.current` …): a
  `vocab-game-wiring.test.ts` a sorrendet a `/\bvocab[\w.]*\??\.(?:next|buildPool)\(/` mintán méri.

#### K.7.2/a S1 megvalósítás — a szerződéshez képesti eltérések és kiegészítések (S1, 2026-11-15; a valós szerződés)

Minden K.7.1–K.7.2 export a fenti néven és szignatúrával létezik. Eltérés csak additív bővítés vagy pontosítás:

- `types.ts`: + `VOCAB_LEVELS`, `VOCAB_POS` (tömbök), + `VocabMinimums` típus
  (`{ total; perLevel: readonly [n,n,n,n,n]; phraseRatio; perTopic }` — a K.7.1 `minimums.ts`-hez).
- `quotas.ts`: + `phraseQuotaForCell(cell) = ceil(0,32 × cell)` (K.8.3; a riport méri).
- `validate.ts`: + `BLOCKED_TERMS` (exportált; a K.7-es lista + `whiskey, casino, drunk` / `Kasino, betrunken` /
  `casino, ivre`), + `exampleWordCount(example)`, + `formInExample(entry)`, + `findFormInText(form, text)` (a
  generátorral KÖZÖS szóhatáros kereső: kis-/nagybetű független, mindkét oldalon szóhatár, bármely (nem törő) szóköz;
  review #421 — a „példa tartalmazza a term-et vagy egy alt alakot” szabály is ezzel mér, így „cat” nem megy át a
  „This category is new.” mondaton), + `VocabStats` típus. A tiltott szót a
  term MINDEN szaván is keresi (a német névelős „das Bier” így is fennakad). A K.8.5 szabályaiból a validátor ezeket is
  hibának jelzi: ASCII `"` bármely szövegmezőben; a példamondat nem nagybetűvel/számmal kezdődik; nem `.`, `!`, `?`,
  `…` (+ esetleg `”`/`»`) zárja; az `alt` üres eleme.
- `loader.ts`: hibánál az ígéret kiesik a gyorsítótárból (a következő hívás újrapróbál).
- `seenHistory.ts`: + `snapshot(lang): Readonly<Record<string, number>>` a `SeenHistory`-n (a nyelv naplója EGY
  tárolóolvasással — a választó ezzel nézi végig a szintet; enélkül bejegyzésenként parse-olná a tárolót),
  + `externalKey(text)` (= `"ext:" + normalizeTerm(text)`). Az időbélyeg nyelvenként szigorúan növekvő
  (`max(now(), eddigi max + 1)`), hogy az azonos ms-on belüli jelölések sorrendje is egyértelmű legyen. A változatlan
  nyers JSON-t nem parse-olja újra (minden olvasás továbbra is a tárolóból). **Két külön korlát (review #421):** a
  `setCap(lang, bankméret)` csak a szóbankos azonosítókra vonatkozik; a kézi (`ext:`) kulcsoké a rögzített
  `EXTERNAL_CAP = 2000` (exportált); mindkét csoportban a legrégebbi törlődik, és kézi kulcs soha nem töröl szóbankos
  bejegyzést (különben a bank kimerülése előtt ismétlés jönne). `size(lang)` az összes kulcs, + `bankSize(lang)` csak
  a szóbankos kulcsok száma.
- `questionGenerator.ts`: + `findTermInExample(entry)` (a review #419 szerinti cloze-szabály: csak a `term`,
  kis-/nagybetű függetlenül, szóhatáron, a szóköz bármely (nem törő) szóközzel egyezik; visszatekintés NÉLKÜL — a
  `no-lookbehind-client.test.ts` tiltja), + `langOfEntry(entry)` (a nyelv az azonosító előtagjából). A
  `generateVocabQuestion` `null`-t ad, ha a típus nem alkalmazható (cloze term nélkül, phrase-meaning nem phrase-re
  vagy L0–L1-re), és ha a kész kérdés `isPlayableQuestion`-on elbukna. A rossz válaszok egymás között is különböző
  `term`-, `hu`- és opció-szövegűek.
- `vocabSource.ts`: `next(level, { types })` — ha a véletlen típus nincs a `types`-ban, a `types`-ból választ; ha a
  választott típus nem készíthető, egyszer `hu-to-target`-tel próbál. Kimerülésnél a „legrégebben látott” a
  bejegyzés azonosítójának ÉS a term/hu kézi kulcsának legkésőbbi időbélyege szerint számít. `markAsked` csak a bank
  saját azonosítóját naplózza. `buildPool` a tartós napló szerint a még nem látottakat veszi előre (szint, majd
  `tierSearchOrder` szomszéd), és csak ha elfogytak, a legrégebben látottakat.
- `useVocabQuizSource.ts`: + `safeLocalStorage()` export.
- `index.ts`: a fentieken túl a `VocabEntry`, `VocabKind`, `VocabLang`, `VocabLevel`, `VocabPos`, `VocabTopic` típusokat is
  újraexportálja.
- `scripts/vocab-bank.ts`: + `report --terms` (szintenkénti term-lista a K.8.6/1 foglalási listához); a riport a
  `phrase`-kvóta cellánkénti hiányát és a terv 4.2 minimum-hiányt is kiírja. `blind-export`: a kérdés- és kulcsfájl
  alakja `{ lang, level, seed, count|canary, items: [...] }`; a kulcs tételében + `questionType`. `blind-score`: a
  válaszfájl lehet tömb vagy `{ items|answers: [...] }`; kanári-észlelés csak a TÉNYLEGES, a rontott kulcstól eltérő
  válasz (a hiányzó nem); a kanárik nem kerülnek a jelzettek közé; kilépési kód 2, ha nem mind észlelt (kapu).
  Exportált tiszta függvények: `reportLines`, `blindExport`, `blindScore`.
- Tesztsegéd: `tests/support/vocab-fixture.ts` + `seededRng(seed)`, `memoryStorage({ failGet, failSet, initial })`.
  Az esetfájl-típus `tests/support/vocab-wiring-case.ts`-ben él (`VocabWiringCase`; a `tests/vocab-wiring-cases/`
  mappában CSAK esetfájl állhat), + opcionális `materialFirst?: RegExp` (a tananyag-ág mintája; alapértelmezés
  `/pickUnseenMaterial\(/`). A `materialFirstFile` a `client/src/`-hez relatív útvonal. A Szólétra esete
  `materialFirst: /useMaterialQuizzes\(/`, a Tornadóé `materialFirstFile: "lib/tornado/questions.ts"`,
  `materialFirst: /args\.material\b/`.
- Forrás-szabály (új őr a `vocab-bank-validate.test.ts`-ben): a `data/vocabBank/` fájljaiban nyers U+00A0 / U+202F
  nem állhat, csak escape. FIGYELEM, tartalomgyártók (S5): az ügynök Write/Edit eszköze a forrásba írt escape-et
  nyers karakterré alakíthatja (mérve S1-ben) — írás után `grep -c $'\xc2\xa0'` a fájlon, és ha > 0, cseréld
  `perl -CSD -pi -e 's/\x{00A0}/\x5Cu00A0/g'`-vel (a `\x5C` kell: a perl a `\\u`-t nagybetűsítésnek veszi).
- Csomagméret-ellenőrzés: a Vite fő belépési darabja `main-<hash>.js` (nem `index-*`). Amíg egyetlen lap sem
  importálja a `@/game-engine/vocab`-ot (S1 állapot), a `vocab-*` darabok a valós buildben NEM jönnek létre (a Rollup
  kiszórja); az első bekötő szelet (S6) után kell `ls source/dist/public/assets | grep -E "vocab-(en|de|fr)-"` → 3
  darab, és `grep -l "en0-family-001" source/dist/public/assets/main-*.js` → nincs találat.

#### K.7.3 Mobilos játékkeret (S2) — `source/client/src/game-engine/mobile/`

```ts
// types.ts
export type GameOrientation = "portrait" | "landscape";
export type GameOrientationPreference = "any" | GameOrientation;
export type GameScreenState = "start" | "playing" | "paused" | "result";

// GameShell.tsx
export type GameShellProps = {
  gameId: string;                      // a gyökér data-game értéke: a MEGLÉVŐ értéket kell átadni
                                       // ("TornadoHunter200", "WordLadderHuEn", "SpeedQuizMath", "BlockCraftQuiz",
                                       //  "BrainRotSteal", "SpaceAsteroidQuiz", "TsunamiEscapeEnglish")
  state: GameScreenState;
  fixedScreen?: boolean;               // data-fixed-screen; alap: state !== "start"
  orientation?: GameOrientationPreference; // alap "any"; ha mást kér és state==="playing" és a tájolás eltér → RotateHint
  onAutoPause?: () => void;            // useAutoPause(state === "playing", onAutoPause)
  className?: string;
  style?: React.CSSProperties;         // a játék saját háttere ide kerül
  children: React.ReactNode;
};
// Gyökér: <div data-game={gameId} data-playing={state==="playing"||state==="paused"} data-fixed-screen
//   data-game-state={state} data-touch={touch ? "true" : "false"}
//   className={`game-shell-fixed min-h-screen relative overflow-hidden text-white ${className}`} style={style}>
// (a meglévő index.css .game-shell-fixed szabályai — 384–513. sor — erre épülnek, ezért az osztálynév kötelező).

// GameHud.tsx
export type GameHudStat = { id: string; label: string; value: React.ReactNode; tone?: "default" | "good" | "warn" | "bad" };
export type GameHudProps = {
  stats: GameHudStat[];                // telefonon legfeljebb 4 látszik egy sorban; több esetén 2 sor
  onPause: () => void;                 // 48×48-as gomb: data-testid="game-pause", aria-label="Szünet"
  progress?: { value: number; max: number; label: string; tone?: "default" | "warn" | "bad" }; // időcsík, data-testid="game-progress"
  children?: React.ReactNode;          // játékspecifikus elem (pl. CouponHud)
};
// Gyökér: data-game-hud; felső belső margó max(4px, var(--game-safe-top)), oldalt a safe-left/right;
// betűméret var(--game-hud-font) (≥ 13 px).

// PauseMenu.tsx
export type PauseMenuProps = {
  open: boolean;
  onResume: () => void;                // data-testid="game-resume", „Folytatás”
  onRestart: () => void;               // data-testid="game-restart", „Újrakezdés”
  onExit: () => void;                  // data-testid="game-exit", „Kilépés” (a hívó navigál)
  exitLabel?: string;
  children?: React.ReactNode;          // játékspecifikus beállítás
};
// Gyökér: data-testid="game-pause-menu", role="dialog", aria-modal; hangkapcsoló: <AudioToggleButton showLabel
// className="h-12 min-w-12" /> data-testid="game-sound" burkolóval; minden gomb ≥ 48 px, felirat ≥ 16 px.

// ResultScreen.tsx
export type ResultScreenProps = {
  open: boolean;
  testId: string;                      // a játék MEGLÉVŐ eredmény-testid-je: sq-won/sq-over, wl-won, ts-won (+ a
                                       // vereséghez új: ts-over), br-over, bc-level-complete/bc-over, sa-over, th-result
  title: string;
  won: boolean;
  score: number;
  best: number | null;
  isNewBest?: boolean;
  correct: number;
  total: number;
  stars?: 1 | 2 | 3;                   // alap: computeStars({ correct, total, won })
  onRetry: () => void;                 // data-testid="game-result-retry" ÉS ha retryTestId van, azt is a gombra (data-testid
  retryTestId?: string;                //  csak egy lehet: a retryTestId elsőbbséget kap, a gomb data-game-retry="true" attribútumot kap)
  retryLabel?: string;                 // alap „Újra”
  onBack: () => void;                  // data-testid="game-result-back", alap felirat „Vissza a játékokhoz”
  backLabel?: string;
  extra?: React.ReactNode;             // játékspecifikus sor (Storm Coin, tantárgyi bontás)
};
// Gyökér: data-game-result="true"; csillagok: data-testid="game-result-stars" data-stars={n}; „Legjobb: …”, „Jó válaszok: x/y (p%)”.

// StartScreen.tsx
export type StartScreenProps = {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  startLabel: string;                  // a meglévő e2e-regexeknek megfelelő felirat (lásd a játék fejezetét)
  startTestId?: string;                // a MEGLÉVŐ start-testid, ha van (sq-start, wl-start, bc-start, sa-start, button-tsunami-start)
  onStart: () => void;                 // a gomb min. 56 px magas; ez az 1. érintés a lapon
  best?: number | null;
  settings?: React.ReactNode;          // <details> „Beállítások” alatt, alapértékkel kitöltve — indításhoz nem kell megnyitni
  secondary?: React.ReactNode;         // további gombok (pl. Tornado: Szintek, Garázs)
  menuKey?: string;                    // data-game-menu értéke a meglévő CSS-hez (pl. "ladder", "brain")
  children?: React.ReactNode;
};
// Gyökér: data-game-start="true".

// RotateHint.tsx
export type RotateHintProps = { want: GameOrientation; onContinue: () => void };
// data-testid="game-rotate-hint"; „Fordítsd el a telefont” + gomb data-testid="game-rotate-continue" „Így is játszom” (48 px).

// hooks és tiszta függvények
export function detectTouchCapable(env: { anyPointerCoarse: boolean; pointerCoarse: boolean; hoverNone: boolean; maxTouchPoints: number }): boolean;
//   = anyPointerCoarse || pointerCoarse || hoverNone || maxTouchPoints > 0
export function useTouchCapable(): boolean;   // matchMedia("(any-pointer: coarse)"), "(pointer: coarse)", "(hover: none)", navigator.maxTouchPoints; change + resize figyelés
export type HapticKind = "tap" | "success" | "error" | "hit";
export const HAPTIC_PATTERNS: Record<HapticKind, number | number[]>; // tap 8, success 18, error [30, 40, 30], hit 12
export function shouldVibrate(env: { supported: boolean; muted: boolean; reducedMotion: boolean }): boolean; // supported && !muted && !reducedMotion
export function useHaptics(): (kind: HapticKind) => void;   // muted = isMuted() a @/lib/audioEngine-ből (83. sor); hiányzó vibrate → csendes kihagyás
export function orientationFrom(width: number, height: number): GameOrientation;  // width > height → "landscape"
export function useOrientation(): GameOrientation;
export type AutoPauseTarget = {
  doc: { visibilityState: string; addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
  win: { addEventListener(t: string, f: () => void): void; removeEventListener(t: string, f: () => void): void };
};
export function attachAutoPause(target: AutoPauseTarget, onPause: () => void): () => void;
//   doc "visibilitychange" (ha visibilityState === "hidden"), win "pagehide", win "orientationchange" → onPause; visszaad: leiratkozás
export function useAutoPause(active: boolean, onPause: () => void): void;
export function computeStars(i: { correct: number; total: number; won: boolean }): 1 | 2 | 3;
//   arány = total > 0 ? correct/total : 0;  won && arány ≥ 0.9 → 3;  arány ≥ 0.7 → 2;  különben 1
export function controlRadiusFor(vp: { width: number; height: number }): number;  // clamp(round(min(w,h) × 0.16), 52, 76)
export const GAME_BEST_KEY = "websuli.gameBest.v1";
export function readBest(storage: StorageLike | null, gameId: string): number | null;
export function writeBest(storage: StorageLike | null, gameId: string, score: number): { best: number; isNewBest: boolean };
export function useBestScore(gameId: string): { best: number | null; submit(score: number): { best: number; isNewBest: boolean } };
```
- `index.ts` mindezt újraexportálja (`@/game-engine/mobile`).
- CSS-változók (S2, `index.css` `:root`): `--game-safe-top|right|bottom|left: env(safe-area-inset-*, 0px)`,
  `--game-touch-min: 48px`, `--game-action-size: clamp(56px, 16vmin, 88px)`, `--game-hud-font: clamp(13px, 3.6vmin, 16px)`,
  `--game-answer-font: clamp(16px, 4.4vmin, 20px)`, `--game-radius: 16px`, színek `--game-surface: #0b172d`,
  `--game-surface-2: #14243d`, `--game-text: #f1f5f9`, `--game-accent: #22d3ee`, `--game-good: #22c55e`,
  `--game-bad: #f43f5e`, `--game-warn: #f59e0b`. Osztályok: `.game-action-btn` (szélesség = magasság =
  `var(--game-action-size)`, min. 48 px, lekerekítés 9999px), `.game-touch-layer` (játék közbeni vezérlősáv:
  alsó belső margó `max(8px, var(--game-safe-bottom))`, oldalt a safe-left/right, `data-game-controls`
  attribútummal együtt használandó), `.game-answer-btn` (min. magasság 56 px, betű `var(--game-answer-font)`).
  **HUD-ban és vezérlőn `env()`-et közvetlenül tilos használni** — csak a fenti változókat (az e2e így emulálja a
  biztonsági sávot).
- `VirtualJoystick`: új érték `radius?: number | "auto"`; `"auto"` → `controlRadiusFor({ width: innerWidth, height: innerHeight })`, resize-ra frissül; alapérték változatlanul 56.
- `HoldButton`: új prop `size?: "auto"`; `"auto"` → a `game-action-btn` osztály is rákerül. Egyéb viselkedés változatlan.
- `useCoarsePointer` (`hooks/useCoarsePointer.ts`): a függvény neve és exportja marad, a törzse `return useTouchCapable();`
  (elavultként jelölve). Így a Kockavadász (`BlockCraftQuiz.tsx:1107`) és az Aszteroida (`SpaceAsteroidQuiz.tsx:732`)
  azonnal az új észlelést kapja. A `(pointer: coarse)` és `(hover: none)` lekérdezés a képletben marad, mert a
  `tests/games-pointer-controls.spec.ts` (13–31. sor) pontosan ezt a kettőt csonkolja.
- Játékonkénti mobil-esetek (S2 hozza létre, a játékszeletek kapcsolják élesre): `source/tests/game-mobile-cases/<játékazonosító>.ts`,
  mindegyik `export const CASE: GameMobileCase`. `status: "baseline"` → a spec a jelenleg is teljesülő alap-ellenőrzéseket
  futtatja; `status: "full"` → a teljes M1–M7, M9–M11 mérést. A játékszelet CSAK a saját esetfájlját írja át `"full"`-ra.
  Az S13 egy őr-tesztben megköveteli, hogy mind a 7 `"full"` legyen.

**S2 megvalósítási eltérések és pontosítások (2026-11-15, ág `feat/jatekok-s2-mobil-keret`) — a játékszeletek EZT a
valós szerződést kövessék:**
1. **Biztonsági sáv a HUD-on és a vezérlősávon eltolással, nem belső margóval.** A `safeAreaViolations` az elem
   DOBOZÁT méri; belső margóval a doboz a képernyő széléig ér, és mindig hibát adna. Ezért: `GameHud` gyökere
   (`.game-hud`) KÜLSŐ margót kap (`margin: max(4px, var(--game-safe-top)) max(8px, var(--game-safe-right)) 0
   max(8px, var(--game-safe-left))`); a `.game-touch-layer` `position: absolute` réteg `left/right/bottom:
   max(8px, var(--game-safe-*))` eltolással, `z-index: 30`, `display: flex; justify-content: space-between;
   align-items: flex-end`, a rétegen `pointer-events: none`, a közvetlen gyerekein `auto`. Pozicionált ős kell
   (a `GameShell` gyökere `relative`). Ha a játék a vezérlőt a `main`-en belül, folyásban akarja, ne ezt az
   osztályt használja, hanem saját elrendezést a `--game-safe-*` változókkal.
2. **`useTouchCapable`: a `maxTouchPoints` csak akkor számít, ha `"ontouchstart" in window`.** Mért (érintőkijelzős
   Windows gép, Chrome): érintés nélküli környezetben `maxTouchPoints = 10`, `any-pointer: coarse` hamis — a nyers
   érték miatt a `games-pointer-controls.spec.ts` két „fine pointer” tesztje bukott. A tiszta `detectTouchCapable`
   képlete és tesztje VÁLTOZATLAN; csak a hook környezet-olvasása szűri a jelet. Érintős laptopon az
   `any-pointer: coarse` adja a jelet.
3. **`PauseMenu` és `ResultScreen` portálon a `document.body`-ba kerül** (mint a `QuizFeedbackCard`): a játékok
   transzformált / `overflow: hidden` tárolói nem vágják le. Következmény: a két fedőréteg a `[data-game]` gyökéren
   KÍVÜL van a DOM-ban (a `.game-shell-fixed …` szelektorok rájuk nem hatnak; testid-kereséshez ez közömbös).
   Réteg: `.game-overlay` `position: fixed; z-index: 80` (a `QuizFeedbackCard` `z-[90]` fölötte marad).
4. **`ResultScreen`:** a `testId` és a `data-game-result="true"` a teljes képernyős fedőréteg gyökerén van; a
   „Újra” gomb MINDIG `data-game-retry="true"`-t kap (nem csak `retryTestId` esetén); megnyitáskor a fókusz a
   párbeszédre kerül (`tabIndex=-1`), nem a gombra. `best === null` esetén a „Legjobb” a `score`-t mutatja.
5. **`GameHud`:** 5–8 stat esetén telefonon soronként `ceil(n/2)` (≤ 4) kártya — 5 → 3 + 2, nem 4 + 1; ≥ 700 px
   szélességben mind egy sorban. Az érték változáskor rugós „pop” animációt kap (csökkentett mozgásnál nem).
6. **`GameShell`:** ha a `style` nem ad hátteret, a háttér `var(--game-surface)`. A `data-playing` /
   `data-fixed-screen` / `data-touch` értéke a „true” / „false” szöveg.
7. **`StartScreen`:** a gyökér `<section data-game-start="true" data-game-menu={menuKey}>`; az első gyereke `<header>`,
   a gombok beágyazott tárolóban vannak (a régi `[data-game-menu] > div:first-child` / `> button` / `> .grid`
   szabályok nem érik el). A StartScreent tartalmazó héj (`.game-shell-fixed:has(> [data-game-start])` vagy
   `:has(> main > [data-game-start])`) oszlopos flexet kap, így a kezdőképernyő függőlegesen középre kerül; a régi
   menük nem változnak.
8. **Új típus és segédek:** `StorageLike = Pick<Storage, "getItem" | "setItem">` a `types.ts`-ben (a szerződés
   hivatkozta, de nem definiálta); `TouchEnv` exportálva. A `tests/support/game-mobile-quality.ts` exportálja még:
   `waitForPlaying(page)` (általános jel: `[data-game][data-playing="true"]`, a baseline esetek ezt használják),
   `MOBILE_VIEWPORTS`, `SafeInsets`.
9. **Mérő-részletek:** a `smallTargets` a `position: fixed` elemet akkor is méri, ha `offsetParent === null`; a
   `collectErrors` a `console.error`-t és a WebGL-mintájú `console.warning`-ot gyűjti, KIVÉVE a CI futtató (GPU nélküli,
   szoftveres WebGL) két környezeti figyelmeztetését (#425 CI-napló): „Automatic fallback to software WebGL has been
   deprecated” és „GL Driver Message (OpenGL, Performance, …): GPU stall due to ReadPixels”; ezeket az
   `isBenignWebglEnvWarning` (`tests/support/webgl-noise.ts`) szűri, minden más WebGL-hiba (CONTEXT_LOST, shaderhiba,
   `GL_INVALID_*`, nem „Performance” driver-üzenet) továbbra is hiba; az M5 két leírója
   („nem érintős”, „érintős laptop”) csak `status: "full"` és megadott `touchControlsTestId` mellett fut.
   Képernyőkép: mindig `testInfo.outputPath()`, és ha `GAME_MOBILE_SHOT_DIR` meg van adva, oda is
   `<id>-<sz>x<m>-<állapot>.jpg` néven (JPEG 70).
9/a. **Mérő-utójavítás (#429 bővítés, Brain Rot szelet mérése):** a `full` mód a játéktól független hibákat is kimért:
    (1) M8 — a hálózati csonk a `/api/games/leaderboard` GET-re `{ ok: true }` objektumot adott, a valódi végpont
    tömböt ad (`server/routes.ts`), ezért a `/games` lap „leaderboard.map is not a function” hibával összeomlott; a
    csonk most `[]`-t ad, a pontszám-küldés (`POST /api/games/score`) külön ágon `{ ok: true }`-t;
    (2) M2 — a mérő a `PauseMenu` / `ResultScreen` belépő animációja (scale 0,9 → 1) közben mért, így a 48 px-es gombok
    47,x px-nek látszottak; a `smallTargets` előtt `waitForStable` vár (a párbeszéd mérete két egymást követő
    mintavételnél azonos, nincs futó animáció) — a 48 px-es mérce nem lazult;
    (3) helyi Windows-futásnál az ANGLE/D3D shader-fordító `THREE.WebGLProgram: Program Info Log: … warning X4122: sum
    of … cannot be represented accurately in double precision` figyelmeztetése jelenik meg (Linux CI-ban nincs);
    az `isBenignWebglEnvWarning` harmadik, szűk mintaként csak az olyan Program Info Log-ot engedi át, amelynek
    minden sora `warning X4122` (egyetlen `error` sor is hibává teszi);
    (4) közös kliens-komponensek mérete: `AchievementToast` 10–11 px-es szövegei ≥ 12 px-re, a `GradeLevelPicker`
    gombjai és a `GamePedagogyPanel` súgó-gombja 44 → 48 px minimum magasságra (csak méret, viselkedés nem változik).
10. **`playwright.game-mobile.config.ts`:** a port `GAME_MOBILE_PORT` környezeti változóval állítható (alap 5184), hogy
    párhuzamos munkafák ne ütközzenek.
11. **Közös CSS-osztályok a változókon túl** (index.css, a `.game-shell-fixed > main` szabály elé): `.game-btn`,
    `.game-btn-primary` (cián színátmenet), `.game-btn-secondary`, `.game-btn-ghost` (mind ≥ 48 px, 16 px felirat),
    `.game-hud*`, `.game-overlay`, `.game-dialog`, `.game-pause*`, `.game-result*`, `.game-start*`, `.game-rotate*`.
    Fekvő, alacsony nézetben (`max-height: 500px` és `min-width: 560px`) a szünet menü két oszlopos, az
    eredménykártya és a kezdőképernyő kéthasábos.

```ts
// source/tests/support/game-mobile-quality.ts (S2)
export type GameMobileCase = {
  id: string;                          // játékazonosító, pl. "tornado-hunter-200"
  path: string;                        // "/games/<id>"
  status: "baseline" | "full";
  startTestId?: string; startName?: RegExp;   // ahogy a game-viewport-experience.spec.ts MENU_GAMES-e (17–25. sor)
  playReady: (page: Page) => Promise<void>;   // az indítás utáni játszható állapot jele (pl. a vezérlő látszik)
  touchControlsTestId?: string;        // érintővezérlő testid (Tornado: tornado-touch-controls; Aszteroida: sa-touch-controls; …)
  resultForce: Record<string, unknown>; resultTestId: string;   // ahogy a game-win-paths.spec.ts GAMES-e (15–21. sor)
  answerWrong?: (page: Page) => Promise<void>;  // rossz válasz kiváltása (M9, M10); hiányában a két mérés nem fut erre a játékra, és az S13 őr ezt hibának veszi
  orientation?: "any" | "landscape";
};
export async function measureOverflow(page: Page): Promise<{ x: number; y: number }>;
export async function smallTargets(page: Page, min?: number): Promise<Array<{ label: string; w: number; h: number; testid: string | null }>>;
export async function smallFonts(page: Page, min?: number): Promise<Array<{ text: string; px: number }>>;
export async function emulateSafeArea(page: Page, insets: { top: number; right: number; bottom: number; left: number }): Promise<void>;
export async function safeAreaViolations(page: Page, insets: { top: number; right: number; bottom: number; left: number }): Promise<string[]>;
export async function hideAndShowPage(page: Page): Promise<void>;
export async function stubVibrate(page: Page): Promise<void>;     // addInitScript: navigator.vibrate rögzít window.__vibrateCalls-ba
export function defineGameMobileQuality(c: GameMobileCase): void;
```

### K.8 Szóbank-tartalom: kvóták, tartalmi szabályok, ütközés, vak megoldó (S1 a kvótákat kódba írja; S3, S4, S5 ez alapján gyárt)

#### K.8.1 Kvóta-tábla — angol (`en`; cellánkénti minimum; sorösszeg ≥ 40, oszlopösszeg = terv 4.2)

| Téma | L0 | L1 | L2 | L3 | L4 | Össz. |
|---|---|---|---|---|---|---|
| family | 31 | 27 | 22 | 15 | 9 | 104 |
| school | 31 | 27 | 21 | 20 | 13 | 112 |
| food | 31 | 32 | 27 | 20 | 13 | 123 |
| home | 31 | 32 | 27 | 20 | 13 | 123 |
| city | 21 | 27 | 27 | 20 | 13 | 108 |
| time | 26 | 27 | 21 | 20 | 13 | 107 |
| body | 26 | 27 | 21 | 15 | 9 | 98 |
| clothes | 26 | 27 | 21 | 15 | 9 | 98 |
| weather | 21 | 21 | 21 | 15 | 13 | 91 |
| freetime | 21 | 27 | 27 | 26 | 18 | 119 |
| animals | 31 | 27 | 21 | 15 | 9 | 103 |
| nature | 16 | 21 | 27 | 26 | 22 | 112 |
| travel | 16 | 21 | 27 | 25 | 22 | 111 |
| shopping | 16 | 21 | 27 | 20 | 13 | 97 |
| health | 10 | 16 | 21 | 25 | 22 | 94 |
| feelings | 16 | 21 | 27 | 25 | 22 | 111 |
| work | 5 | 11 | 21 | 31 | 31 | 99 |
| technology | 5 | 11 | 21 | 31 | 31 | 99 |
| sports | 16 | 21 | 21 | 20 | 18 | 96 |
| culture | 5 | 10 | 16 | 25 | 31 | 87 |
| numbers | 26 | 21 | 16 | 10 | 4 | 77 |
| colors | 21 | 16 | 11 | 5 | 4 | 57 |
| everyday | 31 | 32 | 32 | 25 | 17 | 137 |
| communication | 21 | 27 | 27 | 31 | 31 | 137 |
| **Összesen** | **500** | **550** | **550** | **500** | **400** | **2500** |

#### K.8.2 Kvóta-tábla — német és francia (`de`, `fr`; azonos; cellánkénti minimum; sorösszeg ≥ 40, oszlopösszeg = terv 4.2)

| Téma | L0 | L1 | L2 | L3 | L4 | Össz. |
|---|---|---|---|---|---|---|
| family | 25 | 22 | 18 | 12 | 7 | 84 |
| school | 25 | 22 | 18 | 16 | 10 | 91 |
| food | 25 | 26 | 22 | 16 | 10 | 99 |
| home | 25 | 26 | 22 | 16 | 10 | 99 |
| city | 17 | 22 | 22 | 16 | 10 | 87 |
| time | 21 | 22 | 18 | 16 | 10 | 87 |
| body | 21 | 22 | 18 | 12 | 7 | 80 |
| clothes | 21 | 22 | 17 | 12 | 7 | 79 |
| weather | 17 | 18 | 17 | 12 | 10 | 74 |
| freetime | 17 | 22 | 22 | 21 | 13 | 95 |
| animals | 25 | 22 | 17 | 12 | 7 | 83 |
| nature | 13 | 18 | 22 | 20 | 17 | 90 |
| travel | 12 | 17 | 22 | 20 | 16 | 87 |
| shopping | 12 | 17 | 22 | 16 | 10 | 77 |
| health | 8 | 13 | 17 | 20 | 16 | 74 |
| feelings | 12 | 17 | 22 | 20 | 16 | 87 |
| work | 4 | 9 | 17 | 25 | 23 | 78 |
| technology | 4 | 9 | 17 | 25 | 23 | 78 |
| sports | 12 | 17 | 17 | 16 | 13 | 75 |
| culture | 4 | 9 | 13 | 20 | 23 | 69 |
| numbers | 21 | 17 | 13 | 8 | 3 | 62 |
| colors | 17 | 13 | 9 | 4 | 3 | 46 |
| everyday | 25 | 26 | 26 | 20 | 13 | 110 |
| communication | 17 | 22 | 22 | 25 | 23 | 109 |
| **Összesen** | **400** | **450** | **450** | **400** | **300** | **2000** |

#### K.8.3 Kifejezés-kvóta

Minden cellában legalább `ceil(0,32 × cella)` `phrase` bejegyzés. Ebből szintenként: angol 171 / 187 / 186 / 168 / 141
(összesen 853 = 34%), német és francia 136 / 160 / 160 / 140 / 113 (összesen 709 = 35%) — mindkettő ≥ 30% (terv 4.2).

#### K.8.4 Adagolás

- **Egy gyártó-alügynök (Sonnet) = egy szintfájl** (`data/vocabBank/<nyelv>/level-<n>.ts`): angol L0 500, L1 550, L2 550,
  L3 500, L4 400; német/francia L0 400, L1 450, L2 450, L3 400, L4 300 bejegyzés (~310–560 sor). Egy nyelv öt adagja
  párhuzamosan futhat.
- A fájlon belül témánként csoportosítva (`// ── <téma> ──` megjegyzéssel), cellánként a kvóta szerint; azonosító
  `<nyelv><szint>-<téma>-<nnn>` folytatólagosan: az S1 8 mintabejegyzése szintenként megmarad (azonosítójuk végleges,
  csak tartalmuk javítható), a gyártó a témán belüli következő szabad számmal folytat.
- Egy bejegyzés = egy sor, egyetlen TypeScript-objektum a K.7.1 `VocabEntry` alakjában.

#### K.8.5 Közös tartalmi szabályok (minden nyelv)

- Korosztály: 3–12. évfolyamos magyar diák; L0–L1 alsó tagozatos szókincs, L3–L4 középiskolás. Tilos: trágár, erőszakos,
  szexuális, alkohol-, dohány-, fegyver-, szerencsejáték-tartalom, márkanév, valós személy.
- `hu`: természetes magyar jelentés, több jelentésnél a leggyakoribb; `exampleHu`: a példamondat pontos fordítása.
- `example`: 3–14 szó, hétköznapi helyzet, nagybetűvel kezdődik és írásjellel zárul; a `term` szó szerint szerepel benne,
  ragozott vagy eltérő alaknál az `alt` adja meg a példában szó szerint álló, ÖSSZEFÜGGŐ alakot.
- `kind: "phrase"` ⇔ `pos: "phrase"`: többszavas, önálló jelentésű egység (kifejezés, állandósult szókapcsolat, rövid
  mondat). Szóközös főnévi összetétel, amelyet a szótár egy fogalomként kezel, `word` + `pos: "noun"`.
- Szövegben nincs ASCII `"` (idézet: „ ”).
- Nyelvenként egy normalizált `term` csak egyszer szerepelhet (szintek között sem).

#### K.8.6 Szintek közötti term-ütközés

1. Megelőzés: ha egy gyártó indulásakor már kész alacsonyabb szintfájl van, megkapja annak term-listáját
   (`cd source && node --import tsx scripts/vocab-bank.ts report --lang <nyelv>` kimenetéből) foglalási listaként.
2. Utólagos validátor + pótlás: mind az öt szintfájl után `report --lang <nyelv>` → a `duplikált term` hibák. Az ütköző
   term az ALACSONYABB szinten marad; a magasabb szintű fájl gyártója (csak a saját fájljához nyúlva) azonos témájú és
   szintű új bejegyzéssel pótolja. Ismétlés, amíg 0 hiba.
3. Kvóta: `report --lang <nyelv>` → minden cella `van ≥ kell`, `phrase` ≥ 30%, 0 hiba.

#### K.8.7 Vak megoldós ellenőrzés (A9), szintenként egy adag

1. Export: `cd source && node --import tsx scripts/vocab-bank.ts blind-export --lang <nyelv> --level <n> --seed 1115 --out <scratchpad>/blind-<nyelv>-<n>.json --key-out <scratchpad>/blind-<nyelv>-<n>.key.json --canary 10`.
2. Megoldás: a gyártótól független Opus-alügynök CSAK a `blind-<nyelv>-<n>.json` fájl útvonalát kapja (a kulcsfájl és a
   `data/vocabBank` útvonala nem kerül a promptjába; utasítás: a repó fájljait ne olvassa). 100 tételes részletekben
   dolgozik, és a `<scratchpad>/blind-<nyelv>-<n>.answers.json`-ba írja tételenként:
   `{ ref, answer: 0..3 | null, ambiguous: boolean, ageOk: boolean, exampleOk: boolean, note: string }`
   (`exampleOk`: a példamondat nyelvtanilag helyes ÉS az `exampleHu` pontos fordítása).
3. Pontozás: `node --import tsx scripts/vocab-bank.ts blind-score --key <…>.key.json --answers <…>.answers.json --out <scratchpad>/blind-<nyelv>-<n>.flagged.json`
   → `kanári: 10/10` kötelező; kevesebb esetén a megoldói prompt szigorítása és újrafuttatás.
4. Elbírálás: minden jelzett, nem kanári tételt egy Opus-alügynök minősít: (a) valódi hiba → javítás a szintfájlban
   (azonosító marad) vagy törlés + azonos cellájú pótlás; (b) a megoldó tévedett → indoklás a jegyzőkönyvbe.
5. Javítás után az érintett tételekre újra export → megoldás → pontozás, amíg a valódi hibák száma 0.
6. Jegyzőkönyv: `docs/measurements/2026-11-15-szobank-<nyelv>-vakmegoldo.md`:
   ```
   # Szóbank — <nyelv> — vak megoldós ellenőrzés
   Dátum, gyártó modell, megoldó modell, seed, export-parancs.
   | Szint | Bejegyzés | Kérdés | Kanári | Jelzett (1. kör) | Valódi hiba | Javítva | Törölve+pótolva | Megoldói tévedés | Jelzett (utolsó kör) |
   Jelzett tételek: `<id>` — hiba — javítás / indoklás (egy sor tételenként).
   Maradó kockázat: anyanyelvi lektorálás nem történt (terv 8.); a megoldó elvben elérheti a repó fájljait (utasítással tiltva).
   ```

#### K.8.8 Élesítés

A kvóta és a vak megoldó után `data/vocabBank/<nyelv>/stage.ts` → `"full"`: ettől a `vocab-bank-validate.test.ts` a terv
minimumait követeli az adott nyelvre (A1).


---

## S0 — Terv, végrehajtási utasítás, kanban-jegyek (docs PR)

**Állapot:** folyamatban — ág `docs/jatekok-mobil-szobank-terv` (fő checkout), kanban #17 (`in_progress`).

- **Cél:** a terv és ez a végrehajtási utasítás a `main`-re kerül; a 14 kanban-jegy létezik.
- **Ág:** `docs/jatekok-mobil-szobank-terv` (már létezik a fő checkoutban, `3e9df145`-ről).
- **Fájlok (létrehozandó):** `docs/specs/2026-11-15-jatekok-mobil-szobank.md` (kész, untracked),
  `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` (ez a fájl). Kódfájl nem változik.
- **Lépések:**
  1. `git status --short` → csak a két `docs/specs/2026-11-15-jatekok-mobil-szobank*.md` kerül a commitba (a
     `.wt-legacy/`, `.wt-num/` munkafák nem; azokat nem stage-eljük).
  2. `git add docs/specs/2026-11-15-jatekok-mobil-szobank.md docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`
  3. Commit fájlból (`docs(jatekok): terv és végrehajtási utasítás — mobilos játékok + központi szóbank (S0)`).
  4. `node scripts/qa/three-phase-check.mjs --base origin/main` → `OK: Nincs kódváltozás (…)`.
  5. Jelző (K.5/2) és KÜLÖN hívásban push, PR (`docs(jatekok): S0 – terv és végrehajtási utasítás`).
- **Tesztek:** nincs új teszt (csak dokumentum).
- **Elfogadás:** a két fájl a `main`-en; jegyek #17–#30 a táblán (`list` kimenet a PR-ban); P4 része (kanban).
- **Tiltás:** kódfájl, a terv tartalmának átírása.

---

## S1 — Szóbank-infrastruktúra

**Állapot:** kész, review-ra vár (PR) — ág `feat/jatekok-s1-szobank-infra`, munkafa `.claude/worktrees/jatekok-s1`, kanban #18. A szerződéshez képesti eltérések: K.7.2/a. Modell: Opus. Függőség: S0 összevonva.

- **Cél:** a K.7.1–K.7.2 szerinti típusok, betöltő, validátor, kérdésgenerátor, közös ismétlés-napló és
  játék-adapter, nyelvenként szintenként 8 mintabejegyzéssel; egységtesztek; riport- és vakmegoldó-szkript a
  tartalomszeleteknek. Játékoldal NEM változik.
- **Ág:** `feat/jatekok-s1-szobank-infra`.
- **Létrehozandó fájlok:**
  - `source/client/src/data/vocabBank/types.ts`, `topics.ts`, `minimums.ts`, `quotas.ts`, `validate.ts`,
    `loader.ts`, `vocab-en.ts`, `vocab-de.ts`, `vocab-fr.ts`;
  - `source/client/src/data/vocabBank/{en,de,fr}/level-0.ts … level-4.ts` (15 fájl, egyenként 8 bejegyzés) és
    `{en,de,fr}/stage.ts` (mindhárom `"sample"`);
  - `source/client/src/game-engine/vocab/seenHistory.ts`, `questionGenerator.ts`, `vocabSource.ts`,
    `useVocabQuizSource.ts`, `level.ts`, `index.ts`;
  - `source/scripts/vocab-bank.ts` (CLI: `report`, `blind-export`, `blind-score`);
  - `source/tests/support/vocab-fixture.ts` (szintetikus bank: `makeSyntheticBank(lang, perLevel: number[], seed)`);
  - `source/tests/vocab-bank-validate.test.ts`, `vocab-question-generator.test.ts`, `vocab-seen-history.test.ts`,
    `vocab-game-wiring.test.ts`;
  - `source/tests/vocab-wiring-cases/{word-ladder-hu-en,tsunami-english,block-craft-quiz,brain-rot-steal,space-asteroid-quiz,tornado-hunter-200}.ts`.
- **Módosítandó:** `source/tsconfig.test.json` — az `include` tömbbe (`["tests/**/*.ts", "server/**/*.ts", "shared/**/*.ts", "scripts/lesson-fusion-live.ts", …]`)
  új elem: `"scripts/vocab-bank.ts"`.
- **Ellenőrzött horgonyok:** `FourChoiceQuiz` — `source/client/src/types/gameQuiz.ts:2–9`; `LadderItem` —
  `data/wordLadder/types.ts:29` (`FourChoiceQuiz & { tier: LadderTier; category: LadderCategory }`),
  `LadderCategory` 22. sor (`"word"|"topic"|"phrase"|"irregular"|"regular"|"everyday"`); `tierSearchOrder` —
  `game-engine/no-repeat.ts:20`, `ladderTierIndex` 104. sor, `normalizePrompt` 15. sor;
  `isPlayableQuestion` — `source/shared/game-quiz-contract.ts:6` (3–4 opció, különböző, pontosan egy helyes:
  `singleChoiceProblems` a `shared/single-choice-check.ts:295`-ből); `uniqueQuizContent` ugyanott 21. sor.
  A meglévő angol bankok brit helyesírásúak (`wordLadder/en.ts`: `colour` 6×, `favourite` 6×, `color` 0×).

**Lépések:**
1. Első commit: e fejezet `**Állapot:**` sora (K.2).
2. `types.ts`, `topics.ts`, `minimums.ts` a K.7.1 szerint. `quotas.ts`: a K.8.1 és K.8.2 kvóta-tábla
   szó szerint (en: K.8.1; de és fr: K.8.2 — a kettő azonos).
3. `validate.ts` — `vocabBankProblems(entries, lang)` minden hibát egy sorban ad (`"<id>: <hiba>"`):
   - azonosító: `^(en|de|fr)([0-4])-([a-z]+)-(\d{3})$`, a nyelvi előtag = `lang`, a szintjegy = `level`, a téma = `topic`;
   - egyedi `id`; egyedi `normalizeTerm(term)` az EGÉSZ nyelvben (szintek között is);
   - `term`, `hu`, `example`, `exampleHu` nem üres (trim után);
   - `level ∈ 0..4`, `topic ∈ VOCAB_TOPICS`, `kind ∈ {word, phrase}`, `pos` a listából; `kind === "phrase"` ⇔ `pos === "phrase"`;
   - példamondat szószáma 3–14 (`example.trim().split(/[\s\u00A0\u202F]+/).filter(w => /[\p{L}\d]/u.test(w)).length`);
   - a `normalizeTerm(example)` tartalmazza a `normalizeTerm(term)`-et vagy valamelyik `normalizeTerm(alt[i])`-t;
   - `de`, `pos === "noun"`: a term `^(der|die|das) \p{Lu}` (u flag);
   - `fr`: a `term`, `example` szövegben `?`, `!`, `:`, `;` előtt NEM állhat sima szóköz (`/ [?!:;]/`) és betű sem
     közvetlenül (`/[\p{L}\d][?!:;]/u`); csak `\u00A0` vagy `\u202F` (a forrásban `\u00A0` escape-pel írandó);
   - tiltólista (`BLOCKED_TERMS: Record<VocabLang, string[]>` a fájlban; legalább: en `beer, wine, vodka, whisky, cigarette, cigar, gun, kill`,
     de `Bier, Wein, Schnaps, Zigarette, Waffe, töten`, fr `bière, vin, vodka, cigarette, arme, tuer`): ha a
     `normalizeTerm(term)` vagy az `example` bármely szava tiltott → hiba.
   - `vocabBankStats` és `minimumProblems(stats, min)`: `total ≥ min.total`, `perLevel[i] ≥ min.perLevel[i]`,
     `phrase / total ≥ min.phraseRatio`, minden téma `≥ min.perTopic`.
4. Mintabejegyzések: nyelvenként szintenként 8 (összesen 120), a terv 4.2 szabályai szerint; szintenként
   legalább 2 `phrase`; a német főnevek névelővel; a francia `\u00A0`-val. **Ezek a bejegyzések a végső bank
   részei:** az S3–S5 nem törölheti és nem nevezheti át őket (az azonosító végleges), csak a tartalmukat
   javíthatja, ha a vak megoldó hibát talál. Azonosítók: `<nyelv><szint>-<téma>-001…` (a téma a bejegyzés témája).
5. `vocab-en.ts`/`-de`/`-fr` gyűjtő, `stage.ts` (`"sample"`), `loader.ts` (K.7.1).
6. `seenHistory.ts` (K.7.2): a tárolt JSON-t minden `has`/`mark` előtt újraolvassa (`getItem` try/catch);
   `JSON.parse` hiba / rossz alak → üres napló; `setItem` kivétel → onnantól memóriában (jelző: `fallback = true`),
   kivételt soha nem enged ki. `setCap`: ha egy nyelv kulcsainak száma > cap, a legkisebb időbélyegűek törlődnek.
7. `questionGenerator.ts` (terv 4.3):
   - `pickQuestionType`: `phrase` és `level ≥ 2` → a négy típusból egyenletesen; különben `hu-to-target`,
     `target-to-hu`, `cloze` közül egyenletesen; `cloze` CSAK akkor, ha a példamondat magát a
     `term`-et tartalmazza (kis-/nagybetűtől függetlenül, szóhatáron). Ha a példában csak egy `alt` (ragozott) alak
     szerepel, abból a bejegyzésből `cloze` NEM készül (review #419: a kihagyott „went” helyére a szótári „go” hibás
     mondatot jelölne helyesnek). A kihagyás helye tehát mindig a `term` szó szerinti előfordulása, a helyes opció a `term`.
   - Prompt-sablonok (nyelvnév: angolul / németül / franciául):
     `hu-to-target`: `„<hu>” <nyelvnév>:`; `target-to-hu`: `Mit jelent: „<term>”?`;
     `cloze`: `Melyik illik a mondatba? <példa, a talált alak helyén „_____”> (Magyarul: <exampleHu>)` (review #421:
     a fordítás teszi egyértelművé, melyik opció illik; a cloze rossz válaszai közül kimarad, amelynek a `hu`-ja szó
     elején — toldalékkal is — szerepel az `exampleHu`-ban);
     `phrase-meaning`: `Mit jelent ez a mondat? „<example>”`.
   - Opciók: `hu-to-target` és `cloze` → term-ek; `target-to-hu` → `hu`-k; `phrase-meaning` → `exampleHu`-k.
   - Rossz válaszok (pontosan 3): azonos nyelv és `kind`, szint = kérdés szintje vagy ±1; elsőként azonos `pos`;
     kizárt: azonos `normalizeTerm(term)` vagy azonos `normalizeTerm(hu)` a helyes bejegyzéssel, és egymással is
     különböző `hu` és `term`. Ha < 3 jelölt: a szomszéd szintek után bármely szint ugyanabból a `kind`-ból; ha még
     mindig kevés → `null`.
   - Helyes index: `Math.floor(rng() * 4)`; az opciók többi helye a jelöltek keverése után.
   - Magyarázat: `A helyes válasz: „<helyes opció>”. <term> = <hu>. Példa: „<example>” (<exampleHu>)`; ha > 300
     karakter, a példa-rész elhagyva; ha < 30, kiegészül: ` Szó: <term>.`; sorrendre („a második”) nem hivatkozik.
   - Az azonosító: `vocab:<entry.id>:<type>`.
   - Hiányos mondatban a keresés `normalizeTerm` szerint (kis-nagybetű, `\u00A0`/`\u202F` = szóköz), a csere az
     EREDETI szövegen történik (a francia nem törő szóköz megmarad).
8. `vocabSource.ts` (terv 4.4): `next(level, opts)` sorrendje: a `tierSearchOrder(5, level)` szerinti szinteken (a
   kért, majd előbb a könnyebb szomszéd) az első, ahol van nem látott (`!history.has` és nem `hasExternal` sem a
   term-re, sem a hu-ra) és (ha van `topic`) a témába illő bejegyzés → véletlen ezek közül; ha a témában elfogyott,
   ugyanez téma nélkül; ha a nyelv teljesen elfogyott → a legkisebb `lastSeen` időbélyegű bejegyzés. A kiválasztott
   bejegyzést `mark`-olja, a kérdést `generateVocabQuestion`-nel készíti (ha `null`, a következő jelölttel próbál,
   legfeljebb 20-szor). `createVocabSource` híváskor `history.setCap(lang, entries.length)`.
   `buildPool(level, count)`: ugyanez a sorrend, de nem naplóz és nem ad kétszer ugyanazt a bejegyzést.
9. `useVocabQuizSource.ts`: `useEffect`-ben `loadVocabBank(lang)`; siker → `createVocabSource({ lang, entries,
   history: createSeenHistory(safeLocalStorage()) })`; hiba → `null` marad (konzolra nem ír hibát, hogy az e2e
   konzolhiba-mérése ne bukjon); `enabled === false` → `null`.
10. `level.ts`, `index.ts`.
11. `scripts/vocab-bank.ts` (futtatás: `cd source && node --import tsx scripts/vocab-bank.ts <parancs>`):
    - `report --lang <en|de|fr>`: darabszám szintenként, témánként, `phrase` arány, a `TOPIC_LEVEL_QUOTAS` szerinti
      cellánkénti hiány (`<téma> L<n>: <van>/<kell>`), a `vocabBankProblems` hibái; kilépési kód 0, ha nincs hiba
      (a hiány csak tájékoztató).
    - `blind-export --lang <l> --level <n> --seed <s> --out <fájl> --key-out <fájl> [--canary <k>]`: a szint minden
      bejegyzéséből `hu-to-target` és `target-to-hu` kérdés (+ `cloze`, ha lehetséges), a kérdésfájlba
      `{ ref, prompt, options, example, exampleHu }` KULCS NÉLKÜL; a kulcsfájlba `{ ref, correctIndex, entryId }`.
      `--canary k`: a kulcsfájlban k véletlen tétel kulcsát szándékosan elrontja, a `canary: true` jelzéssel.
    - `blind-score --key <fájl> --answers <fájl> --out <fájl>`: összeveti a megoldó válaszait
      (`{ ref, answer: 0..3 | null, ambiguous: boolean, ageOk: boolean, exampleOk: boolean, note: string }`) a
      kulccsal; jelzett = rossz/hiányzó válasz, vagy bármely `false`/`ambiguous: true`. Kimenet:
      `ellenőrzött: N, jelzett: M, kanári: <észlelt>/<k>` és a jelzettek listája a `--out` fájlba.
12. Esetfájlok `tests/vocab-wiring-cases/<id>.ts`: `export const CASE = { page: "<Lap>.tsx", wired: false, manualBank: /<minta>/ }`.
    A `manualBank` a kézi angol bank meglévő azonosítója (ellenőrizve): Szólétra `/WORD_LADDER_BANKS/`
    (`WordLadderHuEn.tsx` a `registry`-ből), Szökőár `/QUIZ_BANK\b/` (81. sor), Kockavadász `/QUIZ_FALLBACK\b/`
    (214. sor), Brain Rot `/ENGLISH_QUIZZES\b/` (128. sor), Aszteroida `/FALLBACK_QUIZZES\b/` (188. sor), Tornado
    `/pickQuestion\(/` (a `TornadoHunter200.tsx:1163` hívás; az `ENG_1…ENG_6` a `lib/tornado/questions.ts`-ben él).

**Megírandó tesztek:**
- `vocab-bank-validate.test.ts`:
  - „validátor: nulla hiba mindhárom nyelven” — `vocabBankProblems(VOCAB_<L>, l)` üres (A2).
  - „darabszám-minimum a nyelv állapota szerint” — nyelvenként: ha `VOCAB_<L>_STAGE === "full"` →
    `minimumProblems(stats, PLAN_MINIMUMS[l])` üres; ha `"sample"` → `minimumProblems(stats, SAMPLE_MINIMUMS)` üres
    (A1 — a mechanizmus: a tartalomszelet a saját `stage.ts`-ét `"full"`-ra állítja, és onnantól a teszt a terv
    minimumait követeli; nincs skip).
  - „a PLAN_MINIMUMS pontosan a terv 4.2 számai” — szó szerinti összevetés a tesztbe írt táblával (en 2500,
    [500,550,550,500,400]; de/fr 2000, [400,450,450,400,300]; 0.3; 40).
  - „a validátor elkapja a hibákat” — kézi rossz bejegyzések: ismétlődő term más szinten, üres `exampleHu`, 2 szavas
    példa, term nélküli példa, `de` névelő nélküli főnév, `fr` sima szóköz `?` előtt, rossz azonosító, tiltott szó
    → mindegyikre ≥ 1 hiba.
  - „a TOPIC_LEVEL_QUOTAS soraiban a szintösszeg = PLAN_MINIMUMS.perLevel, minden téma ≥ 40” (a kvóta-tábla saját épsége).
- `vocab-question-generator.test.ts` (A3): szintetikus bankon 4000 seedelt kérdés minden típusból: pontosan 4
  különböző opció; `correctIndex` 0–3, és az a helyes; nincs a helyessel azonos `hu`/`term` rossz válasz;
  magyarázat 30–300 karakter, tartalmazza a helyes opciót; `isPlayableQuestion(q) === true`; a helyes index
  eloszlása mind a 4 helyen 20–30% (egyenletes: 25% ± 5); azonos seed → azonos kérdés; `phrase-meaning` csak
  `phrase` és `level ≥ 2`; `cloze` a „der Hund” → „Der Hund bellt.” esetre készül, de ha a példában csak `alt` alak áll
  (`den Hund`, `went`), abból a bejegyzésből 500 próbálkozásból egyszer sem jön `cloze`; francia
  `Tu viens\u00A0?` mondatban a `\u00A0` megmarad; kevés jelöltnél a szomszéd szintről jön a rossz válasz.
- `vocab-seen-history.test.ts`:
  - A4: szintetikus bank (szintenként 500), 10 egymás utáni `createVocabSource` UGYANAZON a memória-tárolón
    (új futás szimulációja), futásonként 20 `next(0)` → a 200 `vocabId` mind különböző.
  - A4 kimerülés + 2000 futásos szimuláció: véletlen szintméretek (1–60), véletlen szintkérések; az első
    `összes bejegyzés` húzás között nincs ismétlődés; utána mindig a legrégebben látott jön.
  - A5: két forrás (két „játék”) ugyanazon a tárolón: az egyikben látott bejegyzést a másik nem adja.
  - A6: `getItem`/`setItem` kivételt dob → `next` kivétel nélkül működik és futáson belül nem ismétel; sérült JSON
    (`"{nem json"`) → üres naplóval indul; `localStorage` `null`.
  - cap: 30 bejegyzéses banknál a napló mérete ≤ 30.
  - `markExternal("dog")` után a `term: "dog"` bejegyzés és a `hu: "kutya"` bejegyzés (`markExternal("kutya")`) kimarad.
  - `vocabLevelForGrade(3|5|7|9|12, startingDifficulty(g))` → 0/1/2/3/4 (a `ladderTierIndex` szabálya, `no-repeat.ts:104`).
- `vocab-game-wiring.test.ts`: beolvassa a `tests/vocab-wiring-cases/` minden `.ts` fájlját (`readdirSync` + `await import`),
  és esetenként a lap forrásán (kommentek nélkül, a `tornado-mobile-controls.test.ts:18–22` `stripComments` mintája):
  - mindig: a `manualBank` minta illeszkedik (a kézi bank megmaradt — terv 2. szakasz);
  - `wired: true` esetén ezen felül: van `useVocabQuizSource(` hívás és `@/game-engine/vocab` import; van
    `markExternal(` hívás; a lap forrásában a tananyag-ág (`pickUnseenMaterial` vagy a Tornadóban `pickQuestion`
    hívás a `lib/tornado/questions.ts`-ben — ott az esetfájl `materialFirstFile` mezője adja meg a fájlt) a
    `.next(` hívás ELŐTT áll (A8 tananyag-elsőbbség); a Szólétra esetén `buildPool(` és `markAsked(` is (A7).
  - Az esetfájl típusa: `{ page: string; wired: boolean; manualBank: RegExp; materialFirstFile?: string }`.

**Parancsok és elvárt kimenet:**
- `cd source && node --import tsx --test tests/vocab-bank-validate.test.ts tests/vocab-question-generator.test.ts tests/vocab-seen-history.test.ts tests/vocab-game-wiring.test.ts` → `# fail 0`.
- `cd source && node --import tsx scripts/vocab-bank.ts report --lang en` → 0 hiba, `total 40`.
- `npm run build` után: `ls source/dist/public/assets | grep -E "vocab-(en|de|fr)-"` → 3 külön darab; és
  `grep -l "en0-" source/dist/public/assets/index-*.js` → nincs találat (a bank nincs a kezdő csomagban).
- K.1/2 hat kapuja külön-külön: mind exit 0.

**Elfogadás:** A2 (minta szinten), A3, A4, A5, A6 teljes; A1 mechanizmusa kész (élesítés S3–S5); A7/A8 őr-teszt
alapállapotban fut; terv 8. „Csomagméret” ellenőrzés.

**Tiltások:** játékoldal, `index.css`, `game-engine/mobile/*` módosítása; a meglévő `data/wordLadder/*`,
`englishGameQuizExtras.ts`, `gradeQuizBank` módosítása; `skip`/`todo` teszt; `console.error` a betöltő hibaágában.

---

## S2 — Közös mobilos játékkeret

**Állapot:** review — ág feat/jatekok-s2-mobil-keret, munkafa .claude/worktrees/jatekok-s2, kanban #19; a K.7.3
szerződéstől való eltérések a K.7.3 végén („S2 megvalósítási eltérések”).

- **Cél:** a K.7.3 szerinti komponensek, hookok, CSS-változók, a `VirtualJoystick`/`HoldButton` méretezése, a
  `useCoarsePointer` átkötése, a `QuizFeedbackCard` gombjainak 48 px-re emelése, egységtesztek, a
  `game-mobile-quality.spec.ts` közös mérő-segédei és a 7 alapállapotú esetfájl, egy Vite-only Playwright-konfig.
  Játékoldal NEM változik.
- **Ág:** `feat/jatekok-s2-mobil-keret`.
- **Létrehozandó fájlok:**
  - `source/client/src/game-engine/mobile/types.ts`, `GameShell.tsx`, `GameHud.tsx`, `PauseMenu.tsx`,
    `ResultScreen.tsx`, `StartScreen.tsx`, `RotateHint.tsx`, `touch.ts` (`detectTouchCapable`, `useTouchCapable`),
    `haptics.ts`, `orientation.ts`, `autoPause.ts`, `stars.ts`, `bestScore.ts`, `controlSize.ts`, `index.ts`;
  - `source/tests/game-mobile-shell.test.ts`;
  - `source/tests/support/game-mobile-quality.ts`;
  - `source/tests/game-mobile-cases/{speed-quiz-math,word-ladder-hu-en,block-craft-quiz,tsunami-english,brain-rot-steal,space-asteroid-quiz,tornado-hunter-200}.ts`;
  - `source/tests/game-mobile-quality.spec.ts`;
  - `source/playwright.game-mobile.config.ts`.
- **Módosítandó fájlok és horgonyok (ellenőrizve):**
  - `source/client/src/index.css`: a `.game-shell-fixed > main` szabály (385–388. sor) `padding`-je
    `env(safe-area-inset-*)` helyett a `var(--game-safe-*)` változókat használja (azonos alapértékkel); a 417. sor
    (`padding-bottom: max(8px, env(safe-area-inset-bottom))`) ugyanígy; új `:root` változók és a
    `.game-action-btn`, `.game-touch-layer`, `.game-answer-btn` osztályok a 384. sor elé (K.7.3). A meglévő
    játékszabályok (384–513. sor) egyébként változatlanok.
  - `source/client/src/game-engine/VirtualJoystick.tsx`: `radius` prop (30. sor, alapérték 45. sor `radius = 56`)
    `number | "auto"`; a `createJoystickDrag(radius)` (51. sor) és a stílus (127–128. sor) a feloldott számot kapja.
  - `source/client/src/game-engine/HoldButton.tsx`: `HoldButtonProps` (25–35. sor) + `size?: "auto"`; a 86. sori
    `className` összeállításba a `game-action-btn` kerül, ha `size === "auto"`.
  - `source/client/src/hooks/useCoarsePointer.ts` (37 sor): a `readCoarsePointer` (10–16. sor) törlődik, a
    `export function useCoarsePointer()` (18. sor) törzse → `return useTouchCapable();`.
  - `source/client/src/game-engine/QuizFeedbackCard.tsx`: a két gomb `min-h-[44px]` (131. és 140. sor) → `min-h-12`.

**Lépések:**
1. Első commit: e fejezet `**Állapot:**` sora (K.2).
2. Tiszta függvények (`touch.ts`, `haptics.ts`, `orientation.ts`, `autoPause.ts`, `stars.ts`, `bestScore.ts`,
   `controlSize.ts`) a K.7.3 képletei szerint; a hookok `typeof window === "undefined"` esetén biztonságos
   alapértéket adnak (`useTouchCapable` → false, `useOrientation` → "portrait").
3. Komponensek a K.7.3 prop-szerződésével. Közös arculat: háttér `var(--game-surface)`, kártya
   `var(--game-surface-2)`, lekerekítés `var(--game-radius)`, elsődleges gomb `bg-cyan-600` + fehér, ≥ 48 px,
   betű ≥ 16 px; csillagok `★` sárga (`#facc15`), üres `☆`. Minden animáció `useReducedMotion()`
   (`game-engine/useReducedMotion.ts:27`) mellett elmarad. A `PauseMenu` megnyitáskor a „Folytatás” gombra
   fókuszál, `Escape` → `onResume`.
4. CSS (index.css) és a négy meglévő fájl módosítása (fent).
5. `tests/support/game-mobile-quality.ts`:
   - `smallTargets`: látható (`offsetParent !== null` és nem `visibility:hidden`) `button, a[href], [role="button"],
     input, select, summary` elemek, ahol `getBoundingClientRect` szélesség vagy magasság < `min` (alap 48);
     kihagyva: `[aria-hidden="true"]` ősű és `disabled` elemek.
   - `smallFonts`: TreeWalker a látható, nem üres szövegcsomópontokon; a szülő `getComputedStyle().fontSize` < `min`
     (alap 12) → lista.
   - `emulateSafeArea`: `page.addStyleTag({ content: ":root{--game-safe-top:<t>px;--game-safe-right:<r>px;--game-safe-bottom:<b>px;--game-safe-left:<l>px}" })`.
   - `safeAreaViolations`: a `[data-game-hud]` és `[data-game-controls]` elemek doboza a nézetből a beszűkített
     téglalapon kívül lóg-e (1 px tűrés).
   - `hideAndShowPage`: `Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })`,
     `document.dispatchEvent(new Event("visibilitychange"))`, 300 ms, majd `"visible"` és újabb esemény.
   - `stubVibrate`: `addInitScript`, `navigator.vibrate = (p) => { (window.__vibrateCalls ??= []).push(p); return true; }`.
   - `defineGameMobileQuality(c)`: `test.describe(c.id)` a három nézetre (`test.use({ viewport })`); minden tesztben
     `pageerror` és `console` `error` gyűjtés (a WebGL-hibák is: `/WebGL|GL_|CONTEXT_LOST/`).
     - `baseline`: a lap betölt, a start-vezérlő látható (`startTestId` vagy `startName`), `measureOverflow` x ≤ 2,
       nincs `pageerror`.
     - `full`: a baseline + M1 (x ≤ 2 és y ≤ 2 kezdő-, játék-, szünet- és eredményállapotban), M2 (`smallTargets`
       üres mind a négy állapotban), M3 (`smallFonts` üres játék-, szünet- és eredményállapotban), M4
       (`emulateSafeArea({top:44,right:0,bottom:34,left:0})` után játék közben `safeAreaViolations` üres), M6
       (játék közben `hideAndShowPage` → `game-pause-menu` látható), M7 (`window.__websuliGame.forceState(c.resultForce)`
       → `[data-game-result]`, `c.resultTestId`, `game-result-stars`, `game-result-retry` vagy `[data-game-retry]`,
       `game-result-back` látható), M8 (a `/games` lapról a játék kártyájára koppintás + `startTestId`/`startName`
       = 2 koppintás után `c.playReady` teljesül), M9 (`page.emulateMedia({ reducedMotion: "reduce" })`,
       `c.answerWrong` után `document.getAnimations()` között nincs `/shake|flash/i` nevű futó animáció),
       M10 (`stubVibrate` + `c.answerWrong` → `window.__vibrateCalls` tartalmazza a `[30,40,30]` mintát),
       M11 (nincs konzolhiba / `pageerror` a játszható állapotig), képernyőkép minden állapotról a
       `testInfo.outputPath()` alá.
     - külön `test.describe("nem érintős")`: `test.use({ hasTouch: false, isMobile: false, viewport: { width: 1366, height: 768 } })`
       → játék közben `c.touchControlsTestId` darabszáma 0 (M5, ha a játéknak van érintővezérlője);
       `test.describe("érintős laptop")`: `test.use({ hasTouch: true, isMobile: false, viewport: { width: 1366, height: 768 } })`
       → látható (M5 „másodlagos mutató”).
6. Esetfájlok: mind a 7 `status: "baseline"`, a `startTestId`/`startName`, `resultForce`, `resultTestId` a
   `game-viewport-experience.spec.ts:17–25` és a `game-win-paths.spec.ts:15–21` értékeivel szó szerint;
   `playReady` és `touchControlsTestId` a játékszeletig `undefined` is lehet a baseline-ban.
7. `game-mobile-quality.spec.ts`: első sor `test.use({ serviceWorkers: "block" })`; `test.use({ ...devices["Pixel 7"] })`
   a fájl tetején (a `games-touch-controls.spec.ts:22` mintája — `devices` szétterítése csak a fájl szintjén
   megengedett); a `/api/**` csonkolás a `game-viewport-experience.spec.ts:28–43` `beforeEach`-ének mintájára;
   `localStorage` `websuli.classroomGrade = "4"`; a 7 esetfájl statikus importja és `defineGameMobileQuality` mindegyikre.
8. `playwright.game-mobile.config.ts` (a `playwright.game-release.config.ts` mintája):
   `testMatch: ["game-mobile-quality.spec.ts"]`, `timeout: 90000`, `workers: 1`, `use: { channel: "chrome", serviceWorkers: "block", baseURL: "http://127.0.0.1:5184", screenshot: "only-on-failure" }`,
   `webServer: { command: "npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 VITE_ENABLE_GAME_TEST_HOOKS=1 vite --host 127.0.0.1 --port 5184 --strictPort", url: "http://127.0.0.1:5184", reuseExistingServer: false }`.
9. Böngészős próba (K.4) egy ideiglenes, NEM commitolt bemutató nélkül: a komponensek élő képét az S6–S12 adja; az
   S2-ben a képernyőkép a `game-mobile-quality.spec.ts` baseline-futásának 7 kezdőképernyője 390×844-ben.

**Megírandó tesztek (`game-mobile-shell.test.ts`):**
- `detectTouchCapable`: 16 kombináció igazságtáblája; különösen: csak `maxTouchPoints: 5` → true (érintős laptop);
  minden false és 0 → false.
- `shouldVibrate`: csak `supported && !muted && !reducedMotion` → true (8 kombináció).
- `HAPTIC_PATTERNS.error` = `[30, 40, 30]`.
- `orientationFrom(844, 390)` → landscape; `(390, 844)` → portrait; `(500, 500)` → portrait.
- `attachAutoPause`: Node `EventTarget`-ből épített `doc` (`visibilityState` mezővel) és `win`: `hidden` +
  `visibilitychange` → 1 hívás; `visible` + `visibilitychange` → 0; `pagehide` → 1; `orientationchange` → 1;
  leiratkozás után 0.
- `computeStars`: (9/10, won) → 3; (9/10, lost) → 2; (7/10) → 2; (6/10) → 1; (0/0) → 1.
- `controlRadiusFor`: 360×640 → 58; 390×844 → 62; 844×390 → 62; 320×480 → 52; 1366×768 → 76 (számítás: min×0.16, vágás 52–76).
- `readBest`/`writeBest`: memória-tárolón; kivételt dobó tárolón kivétel nélkül `{ best: score, isNewBest: true }`.
- Forrásőr: `hooks/useCoarsePointer.ts` hívja a `useTouchCapable`-t; `touch.ts` mind a négy jelet olvassa
  (`any-pointer: coarse`, `pointer: coarse`, `hover: none`, `maxTouchPoints`).

**Parancsok és elvárt kimenet:**
- `cd source && node --import tsx --test tests/game-mobile-shell.test.ts` → `# fail 0`.
- `cd source && npx playwright test -c playwright.game-mobile.config.ts` → 7 eset × 3 nézet baseline: mind passed.
- Regresszió (változatlan mércével zöld): `cd source && npx playwright test -c playwright.game-release.config.ts`;
  `npm run test:e2e -- tests/games-pointer-controls.spec.ts tests/games-touch-controls.spec.ts tests/game-mobile-quality.spec.ts`.
- K.1/2 hat kapuja külön-külön.

**Elfogadás:** a keret és a mérés kész (M1–M11 eszköze); M5 észlelés tiszta függvénnyel igazolva; P2 (7 kezdőkép).

**Tiltások:** játékoldal (`pages/*`) és jelenet módosítása; a meglévő testid-k átnevezése; meglévő teszt módosítása.

---

## S3 — Angol szóbank-tartalom (2500 bejegyzés) + vak megoldó

**Állapot:** nincs elkezdve. Kanban #20. Gyártó: Sonnet; vak megoldó: Opus. Függőség: S1 összevonva.

- **Cél:** `data/vocabBank/en/level-0..4.ts` a K.8.1 kvóta-tábla és a K.8.3 kifejezés-kvóta szerint (összesen ≥ 2500),
  `en/stage.ts` → `"full"`, vak megoldós jegyzőkönyv.
- **Ág:** `feat/jatekok-s3-szobank-en`.
- **Módosítandó fájlok:** `source/client/src/data/vocabBank/en/level-0.ts … level-4.ts`, `en/stage.ts`.
  **Létrehozandó:** `docs/measurements/2026-11-15-szobank-en-vakmegoldo.md`. Más fájl nem változhat.
- **Ellenőrzött horgonyok:** a fájlok, a riport-CLI (`source/scripts/vocab-bank.ts`) és a validátor az S1-ben készülnek
  (K.7.1); a meglévő angol bankok brit helyesírásúak (`data/wordLadder/en.ts`: `colour` 6×, `favourite` 6×, `color` 0×).

**Lépések:**
1. Első commit: e fejezet `**Állapot:**` sora (K.2).
2. Gyártás a K.8.4 adagolással: 5 Sonnet-alügynök (L0 500, L1 550, L2 550, L3 500, L4 400), mindegyik a K.8.1 tábla saját
   oszlopa szerint, a K.8.5 közös szabályokkal és az alábbi angol szabályokkal:
   - brit helyesírás (`colour`, `favourite`, `centre`); az eltérő amerikai alak az `alt`-ba (`["color"]`);
   - igék alapalakban (`go`), rendhagyó múlt idejű példánál az `alt` a példában álló alak (`["went"]`); főnév névelő nélkül
     (`dog`), a példában többes szám esetén `alt` (`["dogs"]`);
   - kifejezések: phrasal verb (`look after`), köszönés / udvariassági forma (`How are you?`), helyhatározós szókapcsolat (`on the left`).
3. Ütközés-kezelés és kvóta-ellenőrzés: K.8.6 `--lang en`.
4. Vak megoldó: K.8.7 `--lang en`, szintenként; kanári 10/10; valódi hiba 0.
5. Jegyzőkönyv: `docs/measurements/2026-11-15-szobank-en-vakmegoldo.md` a K.8.7/6 formátumában.
6. Élesítés: `en/stage.ts` → `export const VOCAB_EN_STAGE: VocabStage = "full";` (K.8.8).

**Tesztek:** új teszt nincs; a `vocab-bank-validate.test.ts` (S1) élesen fut az angolra (A1, A2).

**Parancsok és elvárt kimenet:**
- `cd source && node --import tsx scripts/vocab-bank.ts report --lang en` → `total ≥ 2500`, minden cella teljesül, 0 hiba.
- `cd source && node --import tsx --test tests/vocab-bank-validate.test.ts tests/vocab-question-generator.test.ts` → `# fail 0`.
- `npm run build` → a `source/dist/public/assets/vocab-en-*.js` darab létezik; mérete (`ls -l`) a PR-ba.
- K.1/2 hat kapuja külön-külön.

**Elfogadás:** A1 (angol), A2 (angol), A9 (angol jegyzőkönyv, kanári 10/10 szintenként, valódi hiba 0).

**Tiltások:** más nyelv vagy kód módosítása; mintabejegyzés törlése / átnevezése; `stage` `"full"` a kvóta és a vak megoldó előtt.

---

## S4 — Német szóbank-tartalom (2000 bejegyzés) + vak megoldó

**Állapot:** folyamatban — ág feat/jatekok-s4-szobank-de, munkafa .claude/worktrees/jatekok-s4, kanban #21. Gyártó: Sonnet; vak megoldó: Opus. Függőség: S1 összevonva.

- **Cél:** `data/vocabBank/de/level-0..4.ts` a K.8.2 kvóta-tábla és a K.8.3 kifejezés-kvóta szerint (összesen ≥ 2000),
  `de/stage.ts` → `"full"`, jegyzőkönyv.
- **Ág:** `feat/jatekok-s4-szobank-de`.
- **Módosítandó:** `source/client/src/data/vocabBank/de/level-0.ts … level-4.ts`, `de/stage.ts`.
  **Létrehozandó:** `docs/measurements/2026-11-15-szobank-de-vakmegoldo.md`. Más fájl nem változhat.
- **Ellenőrzött horgonyok:** a meglévő német Szólétra-bank (`data/wordLadder/de.ts`, `WORD_LADDER_DE`) mintája: a főnév
  névelővel és nagy kezdőbetűvel áll (`"der Hund"`), a magyarázat magyar. Ez a bank érintetlen marad. Az S1 validátora a
  német főnévre a `^(der|die|das) \p{Lu}` mintát követeli.

**Lépések:**
1. Első commit: e fejezet `**Állapot:**` sora (K.2).
2. Gyártás a K.8.4 adagolással: 5 Sonnet-alügynök (L0 400, L1 450, L2 450, L3 400, L4 300), a K.8.2 tábla saját oszlopa
   szerint, a K.8.5 közös szabályokkal és az alábbi német szabályokkal:
   - **főnév mindig névelővel és nagy kezdőbetűvel** (`der Hund`, `die Schule`, `das Buch`; többes számú főnév `die Eltern`);
     a példában eltérő esetű névelő (`den Hund`, `dem Hund`) → `alt` (`["den Hund"]`);
   - igék főnévi igenéven (`spielen`); elváló igénél a példamondat olyan, hogy az ige egyben álljon (`Ich muss früh aufstehen.`),
     mert az `alt` csak összefüggő alak lehet; ragozott igealak a példában → `alt` (`["ging"]`);
   - `ß` és umlaut helyesen; standard német (nem osztrák vagy svájci változat).
3. Ütközés-kezelés és kvóta-ellenőrzés: K.8.6 `--lang de`.
4. Vak megoldó: K.8.7 `--lang de`, szintenként; kanári 10/10; valódi hiba 0.
5. Jegyzőkönyv: `docs/measurements/2026-11-15-szobank-de-vakmegoldo.md` a K.8.7/6 formátumában.
6. Élesítés: `de/stage.ts` → `"full"` (K.8.8).

**Tesztek:** új nincs; a `vocab-bank-validate.test.ts` élesen fut a németre (a validátor a névelőt is ellenőrzi).

**Parancsok és elvárt kimenet:**
- `cd source && node --import tsx scripts/vocab-bank.ts report --lang de` → `total ≥ 2000`, minden cella teljesül, 0 hiba.
- `cd source && node --import tsx --test tests/vocab-bank-validate.test.ts tests/vocab-question-generator.test.ts` → `# fail 0`.
- `npm run build` → `vocab-de-*.js` mérete a PR-ba. K.1/2 hat kapuja.

**Elfogadás:** A1 (német), A2 (német), A9 (német jegyzőkönyv).

**Tiltások:** más nyelv vagy kód módosítása; mintabejegyzés törlése / átnevezése; a `data/wordLadder/de.ts` módosítása;
`stage` `"full"` a kvóta és a vak megoldó előtt.

---

## S5 — Francia szóbank-tartalom (2000 bejegyzés) + vak megoldó

**Állapot:** folyamatban — ág feat/jatekok-s5-szobank-fr, munkafa .claude/worktrees/jatekok-s5, kanban #22. Gyártó: Sonnet; vak megoldó: Opus. Függőség: S1 összevonva.

- **Cél:** `data/vocabBank/fr/level-0..4.ts` a K.8.2 kvóta-tábla (a német és a francia kvóta azonos) és a K.8.3
  kifejezés-kvóta szerint (összesen ≥ 2000), `fr/stage.ts` → `"full"`, jegyzőkönyv.
- **Ág:** `feat/jatekok-s5-szobank-fr`.
- **Módosítandó:** `source/client/src/data/vocabBank/fr/level-0.ts … level-4.ts`, `fr/stage.ts`.
  **Létrehozandó:** `docs/measurements/2026-11-15-szobank-fr-vakmegoldo.md`. Más fájl nem változhat.
- **Ellenőrzött horgonyok:** az S1 validátora franciában a `?`, `!`, `:`, `;` előtti sima szóközt (`/ [?!:;]/`) és a
  szóköz nélküli írásjelet (`/[\p{L}\d][?!:;]/u`) is hibának veszi; csak `\u00A0` vagy `\u202F` elfogadott. A meglévő
  francia Szólétra-bank: `data/wordLadder/fr.ts` (`WORD_LADDER_FR`), érintetlen marad.

**Lépések:**
1. Első commit: e fejezet `**Állapot:**` sora (K.2).
2. Gyártás a K.8.4 adagolással: 5 Sonnet-alügynök (L0 400, L1 450, L2 450, L3 400, L4 300), a K.8.2 tábla saját oszlopa
   szerint, a K.8.5 közös szabályokkal és az alábbi francia szabályokkal:
   - főnév névelővel (`le chien`, `la maison`, `l'école`, `les parents`); `l'` névelőnél a `hu` jelzi a nemet (`iskola (nn.)`);
     **spec-pontosítás (S5, 2026-11-15):** a `(hn.)`/`(nn.)` jelölés a `hu` mezőből egységesen kikerült, mert a
     játékban a `hu` válaszlehetőség, és a csak az `l'`-es főneveken álló jelölés elárulta a megoldást
     (`docs/measurements/2026-11-15-szobank-fr-vakmegoldo.md`);
   - **nem törő szóköz** `?`, `!`, `:`, `;` előtt, a forrásban `\u00A0` escape-pel (`"Comment ça va\u00A0?"`);
   - ékezetek helyesen (`é è ê à ç ô û ï`), az aposztróf egyenes `'` (U+0027); ragozott igealak a példában → `alt`;
   - standard (franciaországi) francia.
3. Ütközés-kezelés és kvóta-ellenőrzés: K.8.6 `--lang fr`.
4. Vak megoldó: K.8.7 `--lang fr`, szintenként; kanári 10/10; valódi hiba 0.
5. Jegyzőkönyv: `docs/measurements/2026-11-15-szobank-fr-vakmegoldo.md` a K.8.7/6 formátumában.
6. Élesítés: `fr/stage.ts` → `"full"` (K.8.8).

**Tesztek:** új nincs; a `vocab-bank-validate.test.ts` élesen fut a franciára.

**Parancsok és elvárt kimenet:**
- `cd source && node --import tsx scripts/vocab-bank.ts report --lang fr` → `total ≥ 2000`, minden cella teljesül, 0 hiba.
- `cd source && node --import tsx --test tests/vocab-bank-validate.test.ts tests/vocab-question-generator.test.ts` → `# fail 0`.
- `npm run build` → `vocab-fr-*.js` mérete a PR-ba. K.1/2 hat kapuja.

**Elfogadás:** A1 (francia), A2 (francia), A9 (francia jegyzőkönyv).

**Tiltások:** más nyelv vagy kód módosítása; mintabejegyzés törlése / átnevezése; a `data/wordLadder/fr.ts` módosítása;
`stage` `"full"` a kvóta és a vak megoldó előtt.


---

## S6 — Szólétra mobilra + központi szóbank

**Állapot:** nincs elkezdve. Kanban #23. Modell: Opus. Függőség: S1 és S2 összevonva.

- **Cél:** a terv 4.5 keret és 4.6/2: nagy, hüvelykujjal elérhető válaszgombok, látványos lépés- és zuhanás-animáció,
  mindhárom nyelv kérdései a központi szóbankból is (A7), a meglévő bankok megmaradnak.
- **Ág:** `feat/jatekok-s6-szoletra`.
- **Módosítható fájlok:** `source/client/src/pages/WordLadderHuEn.tsx`, `source/client/src/game-engine/scenes/LadderScene3D.tsx`,
  `source/tests/game-mobile-cases/word-ladder-hu-en.ts`, `source/tests/vocab-wiring-cases/word-ladder-hu-en.ts`,
  új: `source/tests/word-ladder-vocab.test.ts`, képernyőképek `docs/measurements/jatekok-mobil/S6/`.
- **Ellenőrzött horgonyok (`WordLadderHuEn.tsx`, ha nincs más jelölve):**
  - gyökér: 713. sor `className="game-shell-fixed …"`, `data-testid="wordladder-root"` 718. sor;
  - nyelv: `AVAILABLE_LANGUAGES` 240, `lang` állapot 322, `pickLanguage` 324–328; szerver-bank `useQuery` 330–338
    (`/api/games/quiz-bank/word-ladder-hu-en`); `useMaterialQuizzes(userGrade, "english")` 342;
  - `tiers` `useMemo` 348–369 (de/fr: csak a bank `dedupeTiersByContent`-tel, 350; en: bank + szerver 0–2. szint +
    tananyag 1. szint, 362–368);
  - ismétlésszűrés: `seenRef` 289, nullázás 438, bővítés 570; `pickUnseen(tiersRef.current, ladderTierIndex(grade, band), seenRef.current)` 425–428, hívói `startGame` 456 és `onAnswer` 618;
  - lépés-lánc: `REVEAL_MS=900`, `STEP_MS=620` (73–75), `runStepChain` 514–552; DOM-mászó `motion.div` 921–937; `Confetti` 171; `wl-fall` keyframe 1108–1112;
  - válaszgombok 990–1025 (`wl-answers relative grid gap-2`), 2D gomb 996 (`min-h-[44px] … text-sm sm:text-base`), 3D gomb 995 (`min-h-[44px] … text-[20px]`), számjelvény 1015 (`w-6 h-6 … text-xs`);
  - apró szövegek: `text-[10px]` 788, 841, 974; `text-xs` 748, 848, 1015, 1064, 1066;
  - hang: `sfxSuccess`, `sfxError`, `sfxLevelUp` import 23, hívás 602, 579, 484; rezgés NINCS; `useReducedMotion` 243;
  - menü 792–887 (`wl-menu` 793, `wl-lang-picker` 818, `wl-grade-picker` 847, `wl-start` 878–885); győzelem 1051–1080 (`wl-won` 1052, `wl-restart` 1069); `ClassroomGateModal` 722;
  - `LadderScene3D.tsx`: `setupLadderScene` 298; hop/slip indítás 674–694 (fel 0,48 s, le 0,55 s); interpoláció és billegés 700–714; `reducedMotion` 303, 677, 717.
  - index.css a Szólétrához: 482–488 (`wl-quiz` gombok min. 44 px), 500 (`wl-answers` 2 oszlop alacsony fekvőben).

**Lépések:**
1. Első commit: e fejezet `**Állapot:**` sora (K.2).
2. Keret: a 713. sori gyökér-`div` helyett `<GameShell gameId="WordLadderHuEn" state={…} onAutoPause={pause}>`
   (a `data-testid="wordladder-root"` a GameShell gyermekeként egy belső burkolóra kerül, változatlan névvel);
   `state`: menü → `"start"`, játék → `"playing"`, szünet → `"paused"`, győzelem → `"result"`.
   Szünet-állapot új (`paused` `useState`); szünetben a lépés-lánc időzítői (`runStepChain`) és a kérdésóra (ha
   van) állnak; `PauseMenu` (`onRestart` = `startGame`, `onExit` = vissza a menübe).
3. HUD: `GameHud` a fejléc (748–756. sor: XP `wl-total-xp`, sorozat `wl-streak`) értékeivel — a testid-k a stat
   értéket tartalmazó elemen maradnak; `onPause`.
4. Kezdőképernyő: `StartScreen` (`startTestId="wl-start"`, `startLabel` tartalmazza az „Indítás” szót,
   `menuKey="ladder"`), a nyelv-, évfolyam- és pályaválasztó a `settings` alá (alapértékkel kitöltve) — a
   `wl-lang-picker`, `wl-lang-${l}`, `wl-grade-picker` testid-k megmaradnak.
5. Válaszgombok: a 995–996. sori osztályok `min-h-[44px]` → a `game-answer-btn` osztály (56 px, `var(--game-answer-font)`);
   álló tájolásban a `wl-answers` a képernyő alsó felében, 1 oszlop ≤ 390 px szélességig, 2 oszlop fölötte; a
   számjelvény `w-8 h-8 text-sm`. A 788, 841, 974. sori `text-[10px]` és a 748, 848, 1064, 1066. sori `text-xs` → `text-sm`
   (14 px) vagy nagyobb.
6. Visszajelzés: jó válasz → `haptics("success")` + meglévő `sfxSuccess`; rossz → `haptics("error")` + `sfxError`.
7. Animáció (`LadderScene3D.tsx`, a `three-look` keretén belül): a hop (674–694) végén guggolás-nyújtás
   (y-skála 0,85 → 1,08 → 1, 160 ms) és porfelhő (`SparkleField` `emit`, `Math.round(24 × budget.particleScale)`
   részecske a fok szélén); a slip/zuhanás forgó bukfenccel (z-forgás 0 → 2π a 0,55 s alatt) és rövid kameraremegéssel
   (amplitúdó 0,06, 250 ms) — `reducedMotion` mellett forgás és remegés nélkül, csak elmozdulás. A DOM-mászó
   (921–937) ugyanezt 2D-ben (`rotate` és `scale`), `useReducedMotion` mellett nélküle.
8. Szóbank (A7): `const vocab = useVocabQuizSource(lang, true)`. A `tiers` `useMemo` (348–369) után egy
   `vocabTiers` `useMemo` `[vocab, lang, runSeq]` függéssel, ahol a `runSeq` egy új `useState` számláló, amelyet a
   `startGame` MINDEN futáskezdetkor (első indítás és „Újra” is) eggyel növel — így a készlet futásonként újraépül,
   és a `buildPool` a tartós napló szerint a még nem látott bejegyzéseket adja (review #419: a laponként egyszer
   épített készlet az „Újra” után már látott szavakat adott volna vissza, miközben a bankban még volt új). Új
   teszteset a `word-ladder-vocab.test.ts`-ben: két egymást követő futás készlete (a köztes `markAsked` hívásokkal)
   nem tartalmazza az első futásban megkérdezett bejegyzéseket, amíg a szinten van nem látott. Ha `vocab` van, `[0,1,2,3,4].map(l => vocab.buildPool(l, 60).map(q => vocab.toLadderItem(q)))`;
   a végső szintlista `dedupeTiersByContent(tiers.map((t, i) => [...t, ...vocabTiers[i]]))` (a meglévő tételek
   elöl). Amikor a kiválasztott tétel (`pickUnseen` eredménye, 425–428) szóbankos (`id` `vocab:` előtagú), a
   megjelenítéskor `vocab.markAsked({ vocabId })` (a `vocabId` az azonosító 2. mezője). Ha a tétel kézi, a helyes
   opcióra `vocab?.markExternal(item.options[item.correctIndex])`. A `seenRef` logika változatlan.
9. Esetfájlok: `game-mobile-cases/word-ladder-hu-en.ts` → `status: "full"`, `playReady`: `wl-quiz` látható,
   `answerWrong`: a `[data-testid^="wl-option-"][data-correct="false"]` első elemére kattint (ha a lap nem ad
   `data-correct`-et, a `correctDataAttrs` hívást hozzá kell adni a `wl-option-${idx}` gombhoz — `game-engine/game-test-hooks.ts:54`).
   `vocab-wiring-cases/word-ladder-hu-en.ts` → `wired: true`.

**Megírandó teszt (`word-ladder-vocab.test.ts`):** szintetikus szóbankkal (`tests/support/vocab-fixture.ts`) a
`buildPool` + `toLadderItem` + `dedupeTiersByContent` + `pickUnseen` lánc: 5 szint × 60 vocab-tétel + a meglévő
`ladderTiersFromBank(WORD_LADDER_DE)` (`data/wordLadder/banks.ts:18`) — 300 húzás között nincs ismétlődő `id` és
normalizált prompt; minden `LadderItem` `category` `"word"` vagy `"phrase"`, `tier` = a szint; `isPlayableQuestion` igaz.

**Zöldnek maradó meglévő tesztek:** `word-ladder-en-bank`, `word-ladder-de`, `word-ladder-fr`, `word-ladder-validate`,
`word-ladder-levels`, `word-ladder-logic`, `word-ladder-3d-wiring`, `word-ladder-3d-review`, `game-bank-no-repeat-content`,
`game-feedback-wiring-guard` (120. sor: a kártya bezárása indítja a lépést), `game-quiz-explanations`, `quiz-bank-integrity`,
`audit-2026-09-static`, `home-practice-games-catalog` (`.test.ts`); e2e: `game-win-paths.spec.ts` (`wl-won`),
`game-viewport-experience.spec.ts` (`wl-start`), `games-touch-controls.spec.ts`, `game-explanation-pause.spec.ts`.

**Parancsok:** `cd source && node --import tsx --test tests/word-ladder-vocab.test.ts tests/vocab-game-wiring.test.ts tests/word-ladder-*.test.ts tests/game-feedback-wiring-guard.test.ts` → `# fail 0`;
`cd source && npx playwright test -c playwright.game-mobile.config.ts -g word-ladder` → passed;
`cd source && npx playwright test -c playwright.game-release.config.ts`; `npm run test:e2e -- tests/game-explanation-pause.spec.ts tests/games-touch-controls.spec.ts`; K.1/2.

**Elfogadás:** A7; M1–M4, M6–M11 a Szólétrára (M5: nincs érintővezérlője — a válaszgomb minden eszközön látszik);
M12/2 (nagy gombok, animáció, három nyelv a szóbankból); P2.

**Tiltások:** a `data/wordLadder/*` bankok módosítása; testid átnevezése; más játék fájlja; közös fájl (K.1/8).

---

## S7 — Gyors matek sprint mobilra

**Állapot:** nincs elkezdve. Kanban #24. Modell: Opus. Függőség: S1 és S2 összevonva. Nyelvi kérdés nincs (terv 4.6/4).

- **Cél:** 4.5 keret; érintésre szabott nagy válaszrács, időcsík, sorozat- és kombó-visszajelzés, csökkentett mozgás.
- **Ág:** `feat/jatekok-s7-matek-sprint`.
- **Módosítható fájlok:** `source/client/src/pages/SpeedQuizMath.tsx`, `source/client/src/components/MathTowerScene3D.tsx`,
  `source/tests/game-mobile-cases/speed-quiz-math.ts`, új `source/tests/speed-quiz-mobile.test.ts`, képernyőképek `docs/measurements/jatekok-mobil/S7/`.
- **Ellenőrzött horgonyok (`SpeedQuizMath.tsx`):**
  - gyökér 1716 (`game-shell-fixed`); menü 1772–1814, évfolyamrács `grid-cols-3 sm:grid-cols-5` 1774 (`sq-grade-picker`),
    `sq-start` 1795–1804, `GradeLevelPicker` 1805–1812, alapértelmezett évfolyam 4 (1344);
  - időzítő: egy 1 s-os `setInterval` 1555–1596, `if (feedback) return` 1559, kérdés lejárta 1569–1587;
    idők: `speedQuizTiming.ts` `ROUND_SECONDS` 8, `QUESTION_SECONDS` 22, `MIN_QUESTION_SECONDS=20` 50, `questionSecondsForBand` 56;
  - időcsíkok `h-1.5`: kör `runProgress` 1850–1852, kérdés `qProgress` 1853–1855, számítás 1710–1711;
  - sorozat: `streak`, `bestStreak` 1358–1359; kombóbónusz `streak*8` 1633; megjelenés 1739, 1833, 1844, 1917;
  - válaszrács 1877–1895 (`math-answers grid grid-cols-2 gap-1.5`, `sq-answers`), gomb 1882 `h-12 text-lg font-black`;
    `correctDataAttrs` 1890; index.css `.math-answers button { min-height: 44px; }` 450, 451–457 (700 px felett jobb oszlop);
  - `wrongFlash` 220 ms 1612–1613; hang import 12, hívás 1538, 1610, 1628; rezgés NINCS; `useReducedMotion` az oldalon NINCS
    (a `MathTowerScene3D.tsx` kezeli: 164, 428, 448);
  - apró szöveg: `text-[11px]` 1768, 1818, 1868; `text-[10px]` 1832, 1872; `text-xs` 1731, 1825, 1920, 1922;
  - vége 1899–1936 (`sq-won`/`sq-over` 1902), „Új futam” gomb testid nélkül 1925; magyarázókártya 1941–1947.

**Lépések:**
1. Első commit: `**Állapot:**` sor (K.2).
2. Keret: `GameShell gameId="SpeedQuizMath"`; `state` a menü / játék / szünet / vége szerint; szünet állapot új,
   szünetben a 1555. sori intervallum nem csökkent időt (a meglévő `if (feedback) return` mellé `if (paused) return`);
   `useAutoPause`-on át a GameShell `onAutoPause`; `PauseMenu`.
3. `StartScreen` (`startTestId="sq-start"`), az évfolyamrács és a `GradeLevelPicker` a `settings` alá; alapérték 4.
4. HUD: `GameHud` pont (`sq-score` testid a stat értékén), sorozat, élet; `progress` = a kérdés időcsíkja
   (`qProgress`), `tone: "warn"` 30% alatt, `"bad"` 15% alatt; a kör-időcsík a HUD alatt `h-2.5`.
5. Válaszrács: a 1882. sori gombok `game-answer-btn` osztályt kapnak (min. 56 px, `text-2xl font-black`), rács
   `grid-cols-2 gap-2`; 844×390 fekvőben is 2×2 a játéktér jobb oldalán (az index.css 451–457 szabálya ezt adja 700 px
   felett — ellenőrizni képernyőképpel).
6. Kombó: `streak ≥ 3` → „Kombó ×<streak>” felirat 600 ms-ig a rács fölött (`motion` skála 0,8 → 1; reduced motion
   mellett csak megjelenik), `haptics("success")`; rossz válasz → `haptics("error")`; a `wrongFlash` (1612–1613)
   `useReducedMotion()` mellett nem villan, helyette a gomb kerete piros.
7. Apró szövegek: 1768, 1818, 1868, 1832, 1872, 1731, 1825, 1920, 1922 → legalább `text-xs` (12 px), a HUD-ban
   `var(--game-hud-font)`.
8. Vége: `ResultScreen` `testId={won ? "sq-won" : "sq-over"}`, `correct`/`total` a futás számlálóiból,
   `best` a `useBestScore("speed-quiz-math")`-ból, `onRetry` = a meglévő újrakezdés, `onBack` → `/games`.
9. Esetfájl `game-mobile-cases/speed-quiz-math.ts` → `"full"`, `playReady`: `sq-answers` látható,
   `answerWrong`: `[data-testid="sq-answers"] [data-correct="false"]` első gombja.

**Megírandó teszt (`speed-quiz-mobile.test.ts`, forrásőr, kommentek nélkül):** a lap használja a `GameShell`,
`GameHud`, `PauseMenu`, `ResultScreen`, `useHaptics`, `useReducedMotion` elemeket; a válaszgombokon `game-answer-btn`;
az intervallum-callback tartalmazza a `paused` feltételt; `sq-won`, `sq-over`, `sq-start`, `sq-answers` testid megvan.

**Zöldnek maradó meglévő tesztek:** `speed-quiz-explanations`, `game-difficulty` (131), `game-levels-wiring` (131, 166–167),
`game-bank-no-repeat-content`, `quiz-bank-integrity`, `audit-2026-09-static`, `home-practice-games-catalog`; e2e:
`game-win-paths` (`sq-won`), `game-viewport-experience` (`sq-start`, „Matek sprint: indítás, válaszok …”), `games-touch-controls`.

**Parancsok:** `cd source && node --import tsx --test tests/speed-quiz-mobile.test.ts tests/speed-quiz-explanations.test.ts tests/game-difficulty.test.ts tests/game-levels-wiring.test.ts` → `# fail 0`;
`npx playwright test -c playwright.game-mobile.config.ts -g speed-quiz-math`; `npx playwright test -c playwright.game-release.config.ts`; K.1/2.

**Elfogadás:** M1–M4, M6–M11 a játékra (M5: nincs érintővezérlő); M12/4 (nagy rács, időcsík, kombó, csökkentett mozgás); P2.

**Tiltások:** a `TEACHER_BANK`, `generatedTaskForGrade` és a pontozás módosítása; közös fájl.

---

## S8 — Brain Rot Lopás mobilra + szóbank

**Állapot:** nincs elkezdve. Kanban #25. Modell: Opus. Függőség: S1 és S2 összevonva.

- **Cél:** 4.5 keret; a lények mérete és élettartama a képernyőhöz és az évfolyamhoz igazodik; látványosabb lények;
  angol kérdések a szóbankból (A8).
- **Ág:** `feat/jatekok-s8-brain-rot`.
- **Módosítható fájlok:** `source/client/src/pages/BrainRotSteal.tsx`, `source/client/src/game-engine/scenes/BrainRotArena3D.tsx`,
  új `source/client/src/lib/brainRotTuning.ts`, `source/tests/game-mobile-cases/brain-rot-steal.ts`,
  `source/tests/vocab-wiring-cases/brain-rot-steal.ts`, új `source/tests/brainrot-tuning.test.ts`, képernyőképek `docs/measurements/jatekok-mobil/S8/`.
- **Ellenőrzött horgonyok (`BrainRotSteal.tsx`):**
  - konstansok: `ROUND_LIMIT = 90` 101, `STREAK_GOAL = 7` 102, `SPAWN_INTERVAL_BASE = 2200` 103, `SPAWN_INTERVAL_MIN = 900` 104,
    `BRAIN_ROT_LIFETIME = 6000` 105, `MAX_BRAIN_ROTS = 8` 106, `BRAIN_ROT_CLEAR_CATCHES = 10` 108;
  - `spawnBrainRot(boardW, boardH)` 241: `const size = randInt(60, 80);` 243, pozíció 244–245, `speed = 0.3 + Math.random() * 1.2` 246;
  - spawn ütem 654–658 (`paceScale = 1.4 - difficultyRef.current * 0.55`); kezdő sáv `startingDifficulty(userGrade ?? 4)` 330, `levelStartBand` 595;
  - lejárat `Date.now() - spawnTime` 683 → `escaping`, elszökés 707–713; `stepBrainRot` 691; újrarajzolás 100 ms (668);
    **a kor a kvíz alatt is telik** (a mozgatóciklus 638-ban áll, a 683. sori kor nem);
  - lények: `<motion.button` 1068, `width/height: rot.size` 1074–1075, `padding: "2px"` 1087, `onClick` 1091; XP-címke `text-[9px]` 1104; figyelmeztető ikon `w-3.5 h-3.5` 1114;
  - évfolyam: `useClassroomGrade` 328, `useGradeLevel("brainrot", userGrade)` 333, `GradeLevelPicker` 975;
  - kérdések: `ENGLISH_QUIZZES` 128–154, `MATH_QUIZZES` 156–182, `HUNGARIAN_QUIZZES` 184–210, `ALL_QUIZZES` 212;
    `useMaterialQuizzes(userGrade, undefined, coupon.lessonId)` 369; `fullQuizPool` 372–391 (ismeretlen téma → `"english"`, 377);
    `pickQuiz` 400: `pickUnseenMaterial` 405 → `pickGradeQuiz` 410 → `pickRandom(fullQuizPool)` 423; `gradeSeenRef` 394, nullázás 596;
  - időzítő `setInterval` 620–634; rAF 637–748 (`if (phase !== "play") return;` 638); `visibilitychange` NINCS; `Phase` 98 (`"menu" | "play" | "quiz" | "over"`);
  - hang 21, `sfxError` 490, `sfxWarning` 499, `sfxSuccess` 527, `sfxLevelUp` 561; rezgés NINCS; DOM-részecskék `spawnParticles` 427–443 (max 80), rajz 1122;
    villanás 560–563, réteg 843–854; rázás a kvízkártyán 492–493, `animate-brshake` 1266, keyframe 1347–1352; `useReducedMotion` 466, csak 1081-ben hat;
  - menü 924–983 (indítógomb 966–973 „Vadászat indítása!”), `data-game-menu="brain"` 925; vége 1189–1248 (`br-over` 1190), „Újra!” 1234–1240, „Lista” 1241–1245; gyökér 811;
  - apró szöveg: `text-[9px]` 1104; `text-[10px]` 919, 954, 958, 962, 1002, 1182, 1211, 1215, 1219, 1223, 1276, 1283, 1290; `text-[11px]` 1332, 1335; `text-xs` 864, 944, 1228, 1230, 1273, 1325;
  - `BrainRotArena3D.tsx`: `LOOK_BUDGET[tier]` 343, `SparkleField` 601, gyűrű a lény alatt 676–690 (méret `rot.size` 680), robbanás 722–726.

**Lépések:**
1. Első commit: `**Állapot:**` sor (K.2).
2. `lib/brainRotTuning.ts` (tiszta):
   - `brainRotSizeFor({ grade, boardW, boardH }, rng)`: `base = clamp(round(min(boardW, boardH) × 0.16), 64, 112)`;
     évfolyam-szorzó ≤ 4 → 1,25; 5–6 → 1,1; 7–8 → 1,0; ≥ 9 vagy ismeretlen → 0,9; eredmény `round(base × szorzó × (0,9 + rng() × 0,2))`, legalább 56.
   - `brainRotLifetimeFor(grade)`: ≤ 4 → 9000; 5–6 → 7500; 7–8 → 6500; ≥ 9 vagy ismeretlen → 6000 (ms).
   - `brainRotSpeedScaleFor(grade)`: ≤ 4 → 0,6; 5–6 → 0,8; különben 1.
3. A 243. és 246. sor a hangolóból számol (a `spawnBrainRot` kap egy `grade` paramétert); a 683. sori lejárat
   `BRAIN_ROT_LIFETIME` helyett `brainRotLifetimeFor(userGrade)`; a kor számítása a szünet- és kvízidőt kihagyja:
   új `pausedAtRef` / `pausedTotalRef`, a kor `Date.now() - spawnTime - (pausedTotal − rot.pausedTotalAtSpawn)`.
4. Keret: `GameShell gameId="BrainRotSteal"`; szünet-állapot (a `Phase` típus változatlan, külön `paused` `useState`);
   szünetben a 620. sori időzítő és a 637. sori rAF áll; `PauseMenu`; `useAutoPause` a GameShell-en át.
5. `StartScreen` (`startLabel="Vadászat indítása!"` — illeszkedik a `game-viewport-experience.spec.ts:22` regexére,
   `menuKey="brain"`), `GradeLevelPicker` a `settings` alá.
6. HUD: `GameHud` (idő, pont, sorozat, elkapott); `progress` = hátralévő idő a `ROUND_LIMIT`-ből.
7. Lények látványa (a lény min. 56 px, M2): 1068. sori gomb kap `game-touch` célterületet (a látható emoji körül
   átlátszó, legalább 56×56 px-es kattintható doboz); megjelenéskor „pop” (skála 0 → 1,15 → 1, 220 ms), lejárat előtti
   1,5 s-ban pulzáló piros glória (a 1110–1112. sori pulzálás helyett), elkapáskor 3D robbanás az arénában (a meglévő
   722–726. sori robbanás `particleScale`-lel) és DOM-részecskék (427–443); `useReducedMotion` mellett nincs pop,
   pulzálás és villanás (560–563), a kvízkártya rázása (492–493) elmarad, a menü-lény billegése (928–932) áll.
8. Apró szövegek: a felsorolt `text-[9px]`, `text-[10px]`, `text-[11px]` sorok → legalább `text-xs`; HUD `var(--game-hud-font)`.
9. Visszajelzés: elkapás → `haptics("hit")`; jó válasz → `"success"`; rossz → `"error"`.
10. Szóbank (A8): `const vocab = useVocabQuizSource("en", true)`. A `pickQuiz`-ben (400) a `pickUnseenMaterial` (405)
    ág UTÁN, a `pickGradeQuiz` (410) ELŐTT: ha a kiválasztott kategória `"english"` és `vocab` van →
    `vocab.next(vocabLevelForGrade(userGrade, difficultyRef.current))`; ha nem `null`, `markGradeQuizSeen(gradeSeenRef.current, q)` és visszaadja.
    A kategória-választás helye: a `pickQuiz` mostani kategória-logikája (400–423; a `science`/`history` csak a
    közös bankból, 53–54) — UNKNOWN, hogy a kategóriát a 400. sor előtt vagy benne sorsolja; a végrehajtó a
    `pickQuiz` törzsének elolvasásával döntse el, és a szóbankos ágat oda tegye, ahol a kategória már ismert.
    Kézi `ENGLISH_QUIZZES` kérdés kiadásakor `vocab?.markExternal(q.options[q.correctIndex])`. A kuponos „csak
    tananyag” ág (402–403) változatlan.
11. Vége: `ResultScreen testId="br-over"`, `retryLabel="Újra!"`, `onBack` → `/games` (a „Lista” gomb helyett a „Vissza a játékokhoz”).
12. Esetfájlok: `game-mobile-cases/brain-rot-steal.ts` → `"full"`, `playReady`: a játéktér (`[data-collectible-world]`, 1031) látható,
    `answerWrong`: `forceState({ phase: "quiz" })`, majd az első `[data-correct="false"]` gomb (a `correctDataAttrs` 1323-ban van);
    ha a `forceState` (273–284) nem kezeli a `"quiz"` fázist, a lap tesztes API-ját kell bővíteni (saját fájl).
    `vocab-wiring-cases/brain-rot-steal.ts` → `wired: true`.

**Megírandó teszt (`brainrot-tuning.test.ts`):** `brainRotSizeFor` 3. évfolyam 360×640 táblán (rng 0,5): `base = clamp(round(360 × 0,16)=58, 64, 112) = 64`, × 1,25 × 1,0 = 80; 10. évfolyam 1366×768: `clamp(123, 64, 112) = 112` × 0,9 = 101; minden eredmény ≥ 56;
`brainRotLifetimeFor(3|5|7|11)` → 9000/7500/6500/6000; `brainRotSpeedScaleFor` → 0,6/0,8/1; monotonitás: kisebb évfolyam ≥ méret és élettartam.

**Zöldnek maradó meglévő tesztek:** `brainrot-physics`, `coupon-claim-wiring-guard`, `game-feedback-wiring-guard`, `game-quiz-explanations` (119),
`game-difficulty` (131), `game-levels-wiring` (113, 165), `grade-quiz-select` (226, 246), `quiz-bank-integrity` (22), `audit-2026-09-static`,
`home-practice-games-catalog`; e2e: `game-win-paths` (`br-over`), `game-viewport-experience`, `games-touch-controls`.

**Parancsok:** `cd source && node --import tsx --test tests/brainrot-tuning.test.ts tests/brainrot-physics.test.ts tests/vocab-game-wiring.test.ts tests/game-quiz-explanations.test.ts tests/grade-quiz-select.test.ts` → `# fail 0`;
`npx playwright test -c playwright.game-mobile.config.ts -g brain-rot-steal`; `npx playwright test -c playwright.game-release.config.ts`; K.1/2.

**Elfogadás:** A8 (Brain Rot); M1–M4, M6–M11 (M5: nincs külön érintővezérlő — a lények koppinthatók minden eszközön); M12/5; P2.

**Tiltások:** a `lib/brainRotPhysics` és a kérdésbankok tartalmának módosítása; közös fájl.

---

## S9 — Szökőár szökés mobilra + szóbank

**Állapot:** review — ág feat/jatekok-s9-szokoar, munkafa .claude/worktrees/jatekok-s9, kanban #26. Eltérések: a szóbank
angol ÉS vegyes módban is be van kapcsolva (a vegyes kör is ad angol kérdést); a mobil-eset `path`-ja
`/games/tsunami-english?difficulty=easy` (a játéklistán a Szökőárnak csak nehézség-linkjei vannak); az új jelvények a
közös toast (10–11 px) helyett az eredménykártyán; a szünet- / eredménykártya gombjai a lapon 56 px-esek (a rugós
belépő 0,92-es méretén is ≥ 48 px).

- **Cél:** 4.5 keret; érintővezérlés csak érintős eszközön; a könnyű grafika az eszköz képességétől függ, nem a
  szélességtől; látványosabb hullám, part és futó; ismétlés-szűrés a teljes futásra; angol kérdések a szóbankból (A8).
- **Ág:** `feat/jatekok-s9-szokoar`.
- **Módosítható fájlok:** `source/client/src/pages/TsunamiEscapeEnglish.tsx`, `source/client/src/game-engine/scenes/TsunamiScene3D.tsx`,
  `source/tests/game-mobile-cases/tsunami-english.ts`, `source/tests/vocab-wiring-cases/tsunami-english.ts`,
  új `source/tests/tsunami-mobile.test.ts`, képernyőképek `docs/measurements/jatekok-mobil/S9/`.
- **Ellenőrzött horgonyok (`TsunamiEscapeEnglish.tsx`):**
  - `lightGraphics` állapot 617; `isLowEnd` 919–935: `matchMedia("(hover: none)")` vagy `"(pointer: coarse)"` vagy
    `window.innerWidth < 1024` (922–924), reduced motion 925, `deviceMemory <= 4` 926–928, `resize` figyelő 933;
    használat: háttér `slice(0, lightGraphics ? 3 : 6)` 1289, `Array(lightGraphics ? 6 : 12)` 1654, jelenet-prop `light={lightGraphics}` 1467;
  - vezérlők: csak `phase === "play"` (1688), nincs mutató-feltétel; billentyű-súgó `hidden md:block` 1690; `tsunami-controls` 1697–1704;
    `<VirtualJoystick label="Futás iránya" radius={52}` 1711, `joystickToDirections` 1715; Sprint gomb `h-[104px] w-[104px]` 1720–1731, `pressStart` 974, `pressEnd` 983; index.css 494;
  - kérdések: `QUIZ_BANK` 81, `HARD_QUIZ_EXTRA` 254, `QUIZ_ADDITIONAL_MED` 305, `QUIZ_HARD` 392, `QUIZ_MED` 480; szerver-bank `useQuery` 673, `splitBankItemsByTier` 699;
    `useMaterialQuizzes(userGrade, undefined, coupon.lessonId)` 688; összefésülés 711–717 (`TSUNAMI_SUBJECT_QUIZ_BANKS`, `data/tsunamiSubjectQuizBanks.ts:48`, sorrend `TSUNAMI_SUBJECT_ORDER` :13);
    `pickQuiz` 767: 3–12. évfolyamon `pickUnseenMaterial` 783, `pickGradeQuiz` 793, `markGradeQuizSeen` 785/795 (futásra szól, nullázás `startGame` 864);
    régi szintes ág 821–832: `recentQuizIdsRef`, `recent.slice(-4)` 832 → **csak az utolsó 5-öt szűri**; nullázás 863;
  - `startGame` 836, `setPhase("play")` 873; `gameLoop` 994 (`if (phase !== "play") return;` 996), RAF 1080, indítás/leállítás 1085–1093; kvízóra `setInterval` 1188–1195, időtúllépés 1198; `paused` NINCS; `visibilitychange` NINCS;
  - hang import 27, `sfxError` 1116, `sfxSuccess` 1142, `sfxLevelUp` 1168; rezgés NINCS; rázás `setWrongShake(true)` 1117, `animate-shake` 1834, keyframes 1877–1883 (reduced motion nélkül); `useReducedMotion` az oldalon NINCS;
  - menü 1363–1443 (indítógomb 1365–1372, `button-tsunami-start` 1369; tárgy 1379, nehézség 1405–1431, `GradeLevelPicker` 1435); győzelem 1736–1737 (`ts-won`), `button-tsunami-retry-won` 1761; vereség `endGame` 897–898, JSX 1775 („Utolért a hullám!” 1778), `button-tsunami-retry` 1798 (vereség-testid NINCS); kvíz 1816–1871, válaszgombok 1857–1860;
  - apró szöveg: `text-[10px]` 1394, 1523, 1538, 1838; `text-[11px]` 1359, 1400, 1527, 1690, 1845, 1846, 1850, 1868; `text-xs` 1322, 1377, 1395, 1403, 1747, 1751, 1755, 1788, 1792, 1841;
  - gyökér 1277; `link-tsunami-back-games` 1316;
  - `TsunamiScene3D.tsx`: `setupTsunami` 579 (`LOOK_BUDGET[tier]` 584, `particleScale = budget.particleScale * (light ? 0.5 : 1)` 585, `lean = light || tier === "low"` 586);
    hullám `waveHeight` 82, `buildWaterSurface` 183, `buildWaterFront` 211, `surfaceMat` 729, `frontMat` 797, hab 782; terep `buildTerrain(hw, light)` 235; pálma 313, ház 353, világítótorony 365; futó `buildKid` 392, mozgatás 1076–1085; eső 888, `SparkleField` 945; `useThreeScene(…, [props.light])` 1186.

**Lépések:**
1. Első commit: `**Állapot:**` sor (K.2).
2. Könnyű grafika: az `isLowEnd` (919–935) új képlete: `detectLookTier() === "low"` (`three-look/tier.ts:102`) VAGY
   reduced motion VAGY `deviceMemory <= 4`; a `hover: none`, `pointer: coarse` és `innerWidth < 1024` feltétel és a
   `resize` figyelő kikerül (a `light` így futás közben nem vált, a jelenet nem épül újra — 1186).
3. Érintővezérlés: `const touch = useTouchCapable()`; a 1688. sori feltétel `phase === "play" && touch`; nem érintős
   eszközön a billentyű-súgó (1690) látszik `hidden md:block` nélkül. A joystick `radius="auto"`, a Sprint gomb
   `HoldButton size="auto"`-ra cserélve (a `pressStart`/`pressEnd` 974/983 a `onHoldStart`/`onHoldEnd`); a vezérlősáv
   `game-touch-layer` osztályt és `data-game-controls` attribútumot kap; `data-testid="tsunami-touch-controls"` új (a
   `tsunami-controls` osztály marad).
4. Ismétlés-szűrés a teljes futásra: a régi szintes ág (821–832) `recentQuizIdsRef` + `slice(-4)` helyett a
   `pickUnseen(tiersForSubject, preferredTier, runSeenRef.current)` (`game-engine/no-repeat.ts:40`), ahol `runSeenRef`
   a futás összes kiadott kérdése (`{ id, prompt }`), `startGame`-ben (863–864) nullázva.
5. Szóbank (A8): `const vocab = useVocabQuizSource("en", subject === "english")` (a tárgyválasztó állapota a 1379.
   sornál; UNKNOWN a változó pontos neve — a végrehajtó a 1379. sori választóból olvassa ki). A `pickQuiz`-ben (767)
   a `pickUnseenMaterial` (783) UTÁN, a `pickGradeQuiz` (793) ELŐTT, ha a tárgy angol és `vocab` van:
   `vocab.next(vocabLevelForGrade(userGrade, band))`; a régi szintes ágban (821–832) is a pool előtt. Kézi angol
   kérdés kiadásakor `vocab?.markExternal(…)`; minden kiadott kérdés a `runSeenRef`-be és a `gradeSeenRef`-be.
6. Keret: `GameShell gameId="TsunamiEscapeEnglish"` (a gyökér mostani értéke, 1276. sor; a mostani `data-playing`
   `phase === "play" || phase === "quiz"` — ugyanez a `state === "playing"` leképezés), `state` a fázisból
   (`menu` → start, `play`/`quiz` → playing, új `paused`, `won`/`over` → result); szünetben a `gameLoop` (996) és a
   kvízóra (1188–1195) áll; `PauseMenu`; `StartScreen` (`startTestId="button-tsunami-start"`, a felirat „Indítás: …”
   marad, illeszkedik a `game-viewport-experience.spec.ts:21` regexére), tárgy, nehézség, `GradeLevelPicker` a `settings` alá.
7. HUD: `GameHud` (távolság a hullámtól, pont, élet); a 1523–1538, 1838–1850. sori `text-[10px]`/`text-[11px]` → ≥ `text-xs`.
8. Vége: `ResultScreen` győzelemre `testId="ts-won"` `retryTestId="button-tsunami-retry-won"`, vereségre
   `testId="ts-over"` (új) `retryTestId="button-tsunami-retry"`, cím „Utolért a hullám!”.
9. Rázás: a 1117/1834. sori `animate-shake` csak `!useReducedMotion()` mellett; rossz válasz → `haptics("error")`, jó → `"success"`.
10. Látvány (`TsunamiScene3D.tsx`, `three-look` keretén belül, `lean` ágon kisebb mennyiséggel):
    - hullám: a homlokzat (`buildWaterFront` 211, `frontMat` 797) tetején fehér tajték-sáv (a `surfaceMat` shaderben a
      `waveH` meredeksége szerinti habszín), a front előtt permet-részecskék (`SparkleField` emit, `Math.round(60 × particleScale)` / s);
    - part: nedves homok sáv a vízvonalnál (a `buildTerrain` színezése a `terrainHeight` közelében sötétebb), a hab (782) szélesebb;
    - futó (`buildKid` 392): futás-ciklus (a lábak / kar szinusz-lengése a 1076–1085. sori mozgatásban, frekvencia a sebességgel), lépésnyomokban por;
    - `reducedMotion` mellett: nincs permet és por, a futó lengése 30%.
11. Esetfájlok: `game-mobile-cases/tsunami-english.ts` → `"full"`, `touchControlsTestId: "tsunami-touch-controls"`,
    `playReady`: a `tsunami-touch-controls` vagy a billentyű-súgó látható, `answerWrong`: `forceState({ phase: "quiz" })`
    (ha a teszt-API nem kezeli: bővíteni a saját lapon), majd az első `[data-correct="false"]` válaszgomb (ha a
    válaszgombokon nincs `correctDataAttrs`, hozzáadni — 1857–1860). `vocab-wiring-cases/tsunami-english.ts` → `wired: true`.

**Megírandó teszt (`tsunami-mobile.test.ts`, forrásőr):** az `isLowEnd` törzsében nincs `innerWidth`, `hover: none`, `pointer: coarse`;
van `detectLookTier`; a vezérlősáv feltétele tartalmazza a `useTouchCapable` eredményét; a régi szintes ágban nincs `slice(-4)`
és van `pickUnseen(`; az `animate-shake` a reduced motion feltételhez kötött.

**Zöldnek maradó meglévő tesztek:** `tsunami-think-time`, `game-levels-wiring` (80, 84, 171), `grade-quiz-select` (228–259), `quiz-bank-integrity` (27),
`coupon-claim-wiring-guard` (19), `game-feedback-wiring-guard` (39), `game-touch-controls` (118: `touchAction: "none"` és nincs `onPointerLeave`-elengedés),
`audit-2026-09-static`, `home-practice-games-catalog`, `single-choice-wiring` (25); e2e: `remaining-learning.spec.ts` (91), `game-win-paths` (`ts-won`),
`game-viewport-experience`, `games-touch-controls` (163).

**Parancsok:** `cd source && node --import tsx --test tests/tsunami-mobile.test.ts tests/tsunami-think-time.test.ts tests/game-touch-controls.test.ts tests/vocab-game-wiring.test.ts tests/grade-quiz-select.test.ts` → `# fail 0`;
`npx playwright test -c playwright.game-mobile.config.ts -g tsunami-english`; `npx playwright test -c playwright.game-release.config.ts`;
`npm run test:e2e -- tests/remaining-learning.spec.ts tests/games-touch-controls.spec.ts`; K.1/2.

**Elfogadás:** A8 (Szökőár); M1–M11; M12/1; P2.

**Tiltások:** a kérdésbankok tartalma; a `tsunamiTiming.ts`; közös fájl.

---

## S10 — Galaktikus Aszteroida mobilra + szóbank

**Állapot:** nincs elkezdve. Kanban #27. Modell: Opus. Függőség: S1 és S2 összevonva.

- **Cél:** 4.5 keret; képernyőhöz méretezett joystick és tűzgomb, automatikus célzássegéd érintésnél, látványosabb
  robbanások; angol kérdések a szóbankból (A8).
- **Ág:** `feat/jatekok-s10-aszteroida`.
- **Módosítható fájlok:** `source/client/src/pages/SpaceAsteroidQuiz.tsx`, `source/client/src/lib/spaceAsteroid/physics.ts`
  (csak új export, meglévő változatlan), új `source/client/src/lib/spaceAsteroid/aimAssist.ts`, `source/client/src/game-engine/scenes/spaceBackdrop.ts`,
  `source/tests/game-mobile-cases/space-asteroid-quiz.ts`, `source/tests/vocab-wiring-cases/space-asteroid-quiz.ts`,
  új `source/tests/space-asteroid-aim-assist.test.ts`, képernyőképek `docs/measurements/jatekok-mobil/S10/`.
- **Ellenőrzött horgonyok (`SpaceAsteroidQuiz.tsx`):**
  - importok: `VirtualJoystick` 51, `HoldButton` 52, `joystickToDirections` 53, `useCoarsePointer` 55, `useReducedMotion` 50, hang 45, `SparkleField` 59;
  - `const coarsePointer = useCoarsePointer();` 732, `{coarsePointer ? (` 2565; vezérlők `sa-touch-controls` 2566–2568 (a vászon ALATT; vászon 2520–2522);
    joystick 2576–2578 `radius={54}`, `onChange` 2579–2587; tűzgomb `HoldButton label="Tűz"` 2589–2600, `h-[108px] w-[108px]` 2597; billentyű-súgó `sa-keyboard-hint` 2603;
  - lövés 1410–1419 (csak felfelé `vx: 0` 1414, hármas lövés ±3,0 1416–1417); `BULLET_SPEED = 14`, `BULLET_COOLDOWN = 0.18`, `BULLET_TRIPLE_COOLDOWN = 0.10` 182–184; célzássegéd NINCS;
  - robbanás 1884–1892 (`count: Math.round(42 * Math.max(0.5, refs.reducedParticles))`), `EXPLOSION_COLORS` 98, boss 1775–1776, találat 1906, bomba 1991–1992; részecskemező `new SparkleField(scene, Math.round(900 * budget.particleScale) + 120)` 1242; `reducedParticles = budget.particleScale` 1297;
  - rázás `shakeRef` 829, értékek 1770/1894/1901/1985, csillapítás 1632, kamera 2214–2216 (`!reducedMotionRef.current`); `reducedMotionRef` 833–835;
  - `paused` 765, `pausedRef` 818, szinkron 971–973, visszaállítás 1093, csak P billentyű 2243–2244; nincs szünet-overlay; `visibilitychange` NINCS; `blur` 2262–2271 (a `touchRef`-et nem nullázza); rAF 1331–1345, `tick` kihagyás 1371–1372;
  - kérdések: `gradeQuiz` importok 3–9, tananyag `useQuery` 887–898 (`/api/games/material-quizzes?…&limit=3`), pool 900–916, `FALLBACK_QUIZZES` 188–205, `pickQuiz` 929 (tananyag 934 → `pickGradeQuiz` 939 → régi pool), `gradeSeenRef` 921, `recentQuizPromptsRef`/`RECENT_WINDOW = 12` 918–919, 955–961;
  - képernyők: évfolyamválasztó 2421–2442 (`h-12` gombok 2432), intro 2444–2512, `sa-start` 2487–2494; eredmény `sa-over` 2639–2651; kvíz 2657–2732 (válaszgombok `min-h-[44px] … text-[15px]` 2701–2706, `correctDataAttrs` 2714); teszt-API `installGameTestApi` 773; gyökér 2395;
  - kis vezérlők: bomba `button-bomb` 2622–2631 (szövegméretű), „Kör vége” `size="sm" … text-xs px-3 py-1` 2635, „Más osztály választása” `text-[11px]` 2503–2509;
  - apró szöveg: `text-[10px]` 2470, 2474, 2478, 2482, 2524, 2531, 2537, 2613, 2615, 2678; `text-[11px]` 2438, 2460, 2462, 2471, 2475, 2479, 2483, 2505, 2603, 2689, 2722, 2725; `text-xs` 2405, 2486, 2556, 2635, 2644, 2685;
  - `lib/spaceAsteroid/physics.ts`: `GAME_W/H` 10–11, `PLAYER_HALF_WIDTH` 39, `visibleHalfWidth` 42, `playerXLimit` 53, `integratePlayer` 109.

**Lépések:**
1. Első commit: `**Állapot:**` sor (K.2).
2. `lib/spaceAsteroid/aimAssist.ts` (tiszta): `aimAssistVx(ship: { x: number; y: number }, targets: ReadonlyArray<{ x: number; y: number; alive?: boolean }>, opts = { coneDeg: 25, maxVx: 6, speed: BULLET_SPEED })`:
   a hajó fölötti (`t.y > ship.y`) élő célok közül, amelyek a függőlegestől `coneDeg`-en belül vannak, a legközelebbi felé
   mutató `vx = clamp(speed × (dx / dist), −maxVx, maxVx)`; nincs cél → 0.
3. Lövés (1410–1419): ha `touch` (az új `useTouchCapable()`) igaz, a középső lövedék `vx`-e `aimAssistVx(...)`; a hármas
   lövés oldalsó lövedékei a középsőhöz képest ±3,0. Billentyűzetnél változatlan.
4. Vezérlés: a 732. sori `useCoarsePointer()` → `useTouchCapable()` (az import is); a joystick `radius="auto"`, a tűzgomb
   `HoldButton size="auto"` (a 2597. sori fix `h-[108px] w-[108px]` kikerül); a vezérlősáv `game-touch-layer` +
   `data-game-controls`, a vászon alatti elhelyezés marad; a bomba gomb (2622–2631) a vezérlősávba kerül `game-action-btn`-ként
   (`button-bomb` testid marad); a „Kör vége” (2635) a `PauseMenu` „Kilépés”-e lesz.
5. Szünet: a meglévő `paused`/`pausedRef` (765/818) köti a `PauseMenu`-t (`open={paused}`), `GameHud onPause` → `setPaused(true)`;
   `GameShell onAutoPause` → `setPaused(true)`; szünet indulásakor a `touchRef.current` irányai és a `fire` nullázva
   (a `blur` 2262–2271 hiányát is pótolja).
6. Robbanások: a 1884–1892. sori részecskeszám `× motionScale(reduced).particles` (`useReducedMotion.ts:57`), plusz egy
   táguló lökéshullám-gyűrű (additív sprite, 0 → 2,2× sugár 260 ms alatt, átlátszóság 0,8 → 0) ellenségre, bossra (1775) és bombára (1991);
   találatnál `haptics("hit")`, robbanásnál `"hit"`, jó válasz `"success"`, rossz `"error"`; rázás változatlanul csak reduced motion nélkül.
7. Szóbank (A8): `const vocab = useVocabQuizSource("en", true)`; a `pickQuiz`-ben (929) a tananyag-ág (934) UTÁN, a
   `pickGradeQuiz` (939) ELŐTT: ha a kérdés-hely angol (a régi pool `topic: "english"` tételei; a közös bankban a tárgy) és
   `vocab` van → `vocab.next(vocabLevelForGrade(sharedGrade, adaptiveRef.current.band))`; a kérdés `markGradeQuizSeen`-nel
   a `gradeSeenRef`-be (921). UNKNOWN: a 929–961. sor között hol dől el, hogy a kérdés angol legyen; a végrehajtó a
   `pickQuiz` törzsét elolvasva a szóbankos ágat a tárgy-döntés utánra teszi; ha nincs tárgy-döntés, az angol hely
   = a régi pool `FALLBACK_QUIZZES` választása (a 955–961. sori ág), a szóbank annak az ágnak az elejére kerül.
   Kézi `FALLBACK_QUIZZES` kérdésnél `vocab?.markExternal(…)`.
8. Keret és képernyők: `GameShell gameId="SpaceAsteroidQuiz"`; `StartScreen` (`startTestId="sa-start"`), az évfolyamválasztó
   (2421–2442) a `settings` alá; `GameHud` (hullám, idő, pont, bomba, a 2524–2537 és 2613–2615 jelvények helyett);
   `ResultScreen testId="sa-over"`, `won` = a 2642. sori feltétel; a felsorolt apró szövegek → ≥ `text-xs`; a kvíz válaszgombjai
   (2701–2706) `game-answer-btn`.
9. Esetfájlok: `game-mobile-cases/space-asteroid-quiz.ts` → `"full"`, `touchControlsTestId: "sa-touch-controls"`,
   `playReady`: `sa-touch-controls` vagy `sa-keyboard-hint` látható, `answerWrong`: `forceState({ phase: "quiz" })` (ha a 773. sori
   API nem kezeli, bővíteni), majd `[data-correct="false"]`. `vocab-wiring-cases/space-asteroid-quiz.ts` → `wired: true`.

**Megírandó teszt (`space-asteroid-aim-assist.test.ts`):** cél egyenesen fölötte → `vx` 0; cél 20°-ra jobbra → `vx > 0` és `≤ 6`;
cél 40°-ra → 0 (kúpon kívül); cél a hajó alatt → 0; két cél közül a közelebbi felé; halott cél kihagyva; forrásőr: a lövés-ág
`aimAssistVx`-et csak érintős ágon hívja.

**Zöldnek maradó meglévő tesztek:** `space-asteroid-physics`, `space-asteroid-visible-bounds`, `space-asteroid-wiring-guard`, `game-touch-controls` (116),
`grade-quiz-select` (224, 241), `quiz-bank-integrity` (24), `remaining-quiz-explanations` (8), `quiz-explanation-export` (52), `game-feedback-wiring-guard` (40),
`game-levels-wiring` (101), `coupon-claim-wiring-guard` (21), `audit-2026-09-static`, `home-practice-games-catalog`; e2e: `games-pointer-controls` (70, 98 —
fine: `sa-touch-controls` 0 db és `sa-keyboard-hint` látható; coarse: ≥ 44 px), `games-touch-controls` (159), `game-viewport-experience` (`sa-start`),
`game-win-paths` (`sa-over`), `remaining-learning.spec.ts` (40, 46), `coupon-lesson.browser.ts`, `learning-flow.browser.ts`.

**Parancsok:** `cd source && node --import tsx --test tests/space-asteroid-aim-assist.test.ts tests/space-asteroid-*.test.ts tests/game-touch-controls.test.ts tests/vocab-game-wiring.test.ts` → `# fail 0`;
`npx playwright test -c playwright.game-mobile.config.ts -g space-asteroid-quiz`; `npx playwright test -c playwright.game-release.config.ts`;
`npm run test:e2e -- tests/games-pointer-controls.spec.ts tests/games-touch-controls.spec.ts tests/remaining-learning.spec.ts`; K.1/2.

**Elfogadás:** A8 (Aszteroida); M1–M11; M12/6; P2.

**Tiltások:** a meglévő fizikai konstansok és exportok módosítása; közös fájl.

---

## S11 — Kockavadász kvíz mobilra + szóbank

**Állapot:** nincs elkezdve. Kanban #28. Modell: Opus. Függőség: S1 és S2 összevonva.

- **Cél:** 4.5 keret; nagyobb akciógombok (ugrás, bányászás, lerakás ≥ 56 px), kétujjas vezérlés (bal: mozgás, jobb:
  körbenézés), olvasható HUD; angol kérdések a szóbankból (A8).
- **Ág:** `feat/jatekok-s11-kockavadasz`.
- **Módosítható fájlok:** `source/client/src/pages/BlockCraftQuiz.tsx`, `source/tests/game-mobile-cases/block-craft-quiz.ts`,
  `source/tests/vocab-wiring-cases/block-craft-quiz.ts`, új `source/tests/blockcraft-mobile.test.ts`, új
  `source/tests/blockcraft-two-finger.spec.ts`, képernyőképek `docs/measurements/jatekok-mobil/S11/`.
- **Ellenőrzött horgonyok (`BlockCraftQuiz.tsx`):**
  - `useCoarsePointer` import 53, `const coarsePointer = useCoarsePointer();` 1107, `{coarsePointer ? (` 2707; `bc-touch-controls` 2710; `bc-keyboard-hint` 2737;
  - joystick `<VirtualJoystick label="Mozgás" radius={52}` 2719–2729 (`joystickToDirections` → `keysRef`); akciógombok rácsa `grid grid-cols-2 gap-1.5 flex-1 max-w-[260px]` 2730;
    Ugrás 2731 (`size="sm" … py-3 text-xs col-span-2`, `onPointerDown={(e) => startHold(e, "jump")}`), Bányász 2732 (`onClick={tryMineLook}`), Lerak 2733 (`onClick={tryPlaceLook}`, `disabled`); `startHold`/`endHold` 2429–2441;
    a `Button size="sm"` = `h-9` (36 px) — `components/ui/button.tsx:32`;
  - körbenézés: `touchLookRef` 2484, `setPointerCapture` 2501–2502, azonos `pointerId` 2509, yaw `dx*0.006`, pitch `dy*0.005` ±1,45 (2516–2517), 12 px alatti mozgás = koppintás-bányászás 2525, raycast 2531–2542, pointercancel 2551–2553; vászon-kezelők 2643–2650 (`touch-none`);
    egér: `requestPointerLock` 2491–2498, egérmozgás 1566–1571;
  - HUD: pályacímke `text-[10px]` 2663, „3D FP” 2670, alsó tippek 2678–2681, célkereszt 2654–2657, „+XP” 2658–2661; hotbar gombok `px-1.5 py-1 text-[10px]` 2692; idő-/statisztikasáv `h-2` 2743, `text-[10px]` 2746, 2748, láng ikon 2751;
    egyéb `text-[11px]` 2591, 2610–2611, 2737, 2814–2819, 2843; kvízablak 2831; „Kör vége” `size="sm" … text-xs px-3 py-1` 2763;
  - kérdések: távoli bank `useQuery … ["/api/games/quiz-bank/block-craft-quiz"]` 1251–1252, `useMaterialQuizzes(userGrade, undefined, coupon.lessonId)` 1264, `bank` 1266–1298 (régi tételek `subject: "english"` 1294; kupon: csak tananyag 1297), `QUIZ_FALLBACK` 214;
    `pickQuiz` 1372: `gradeForGame` 1376, `pickUnseenMaterial` 1380, tárgy-körforgás a `GRADE_SUBJECTS`-en `pickGradeQuiz`-zel 1385–1397, tárgysorrend 1307 (`["english","english-math","math","nature","hungarian"]`); `gradeSeenRef` 1316, `recentPromptsRef`/`RECENT_WINDOW = 16` 1313–1314, `rebuildSubjectPools` 1320, 1426–1429;
  - ciklus: rAF 1997, 2143; futtatás 2189–2200 (`shouldRun = phase === "play" || phase === "quiz"`, `lastTRef.current = null` 2198); visszaszámláló 1349–1362; pointer lock elengedése csak unmountkor 2151; `blur` 1572–1582; `visibilitychange` és `paused` NINCS; `Phase` 1103;
  - hang import 29, `sfxError` 2222, `sfxWarning` 2230, `sfxSuccess` 2254, `sfxLevelUp` 2325; rezgés NINCS; `SparkleField` 1678, bányász-szikra 1965–1984; renderer 1612, `detectLookTier()` 1614;
  - `useReducedMotion` 1220–1225; rázás `wrongShake` 1157, 2223–2224, `animate-shake` 2831 (reduced motion nélkül), keyframes 2848;
  - képernyők: menü 2593–2626 (`bc-start` 2595 `min-h-[44px]`, `GradeLevelPicker` 2599); pálya kész `bc-level-complete` 2769–2801; vége `bc-over` 2803–2827; teszt-API `installGameTestApi` 1184; gyökér 2557; `game-play-stack` 2640.

**Lépések:**
1. Első commit: `**Állapot:**` sor (K.2).
2. Érintés: 1107 → `useTouchCapable()` (a `useCoarsePointer` S2 óta ugyanezt adja; a csere egyértelműsít).
3. Akciógombok (2730–2733): az Ugrás `HoldButton size="auto" label="Ugrás"` (`onHoldStart`/`onHoldEnd` a `startHold`/`endHold`
   logikájával; a `startHold(e, …)` szignatúrát egy esemény nélküli belső függvényre kell bontani), a Bányász és a Lerak
   `<button className="game-action-btn …">` (min. 56 px, ikon + 14 px-es felirat), `touch-action: none`; elrendezés: jobb
   alsó sarok, ív alakban (Ugrás legnagyobb, `--game-action-size × 1,15`); a vezérlősáv `game-touch-layer` + `data-game-controls`.
4. Kétujjas vezérlés: a joystick (bal fél) és a körbenézés (a vászon) már külön `pointerId`-t követ (2509) — ezt kell
   igazolni és rögzíteni: a körbenézés csak a vászon JOBB 60%-án indulhat érintéssel (a bal oldali érintés a joystické;
   a joystick `radius="auto"` a bal alsó sarokban); a koppintás-bányászás (2525) marad. A teszt-API (1184) `probe`-ja
   adja vissza a `yaw` és a `moveFwd` (a `keysRef.current.fwd`) értékét.
5. HUD: `GameHud` (idő, pont, sorozat, blokkok); a hotbar (2692) gombjai min. 48×48, `text-xs`; a felsorolt
   `text-[10px]`/`text-[11px]` sorok → ≥ `text-xs`; az idősáv `h-2` → `GameHud progress`.
6. Szünet: új `paused` állapot; `shouldRun` (2189–2200) `&& !paused`, a visszaszámláló (1349–1362) szünetben áll,
   szünetkor `document.exitPointerLock?.()` és a `keysRef` nullázása; `PauseMenu` (a „Kör vége” 2763 a „Kilépés” lesz);
   `GameShell onAutoPause`.
7. Visszajelzés: bányászás → `haptics("tap")`, jó válasz `"success"`, rossz `"error"`; a rázás (2831) csak reduced motion nélkül.
8. Szóbank (A8): `const vocab = useVocabQuizSource("en", true)`; a tárgy-körforgásban (1385–1397), amikor az aktuális tárgy
   `"english"` és `vocab` van → `vocab.next(vocabLevelForGrade(userGrade, adaptiveRef.current.band))`, `markGradeQuizSeen(gradeSeenRef.current, q)`;
   `null` esetén a meglévő `pickGradeQuiz`. A régi `QUIZ_FALLBACK`/távoli bank angol tételének kiadásakor `vocab?.markExternal(…)`.
   A kupon-ág (1297) változatlan.
9. Keret és képernyők: `GameShell gameId="BlockCraftQuiz"`; `StartScreen` (`startTestId="bc-start"`), `GradeLevelPicker` és a
   pályalista a `settings` alá; `ResultScreen` `testId="bc-level-complete"` (pálya kész, `won: true`) és `testId="bc-over"` (vége).
10. Esetfájlok: `game-mobile-cases/block-craft-quiz.ts` → `"full"`, `touchControlsTestId: "bc-touch-controls"`, `playReady`:
    `bc-touch-controls` vagy `bc-keyboard-hint` látható, `answerWrong`: `forceState({ phase: "quiz" })`, majd `[data-correct="false"]`
    (a válaszgombokon a `correctDataAttrs` 2842-ben megvan). `vocab-wiring-cases/block-craft-quiz.ts` → `wired: true`.

**Megírandó tesztek:**
- `blockcraft-mobile.test.ts` (forrásőr): az akciógombokon `game-action-btn` vagy `HoldButton size="auto"`; nincs `size="sm"` az
  Ugrás / Bányász / Lerak gombon; a `shouldRun` feltételben `paused`; van `useTouchCapable`.
- `blockcraft-two-finger.spec.ts` (Playwright, `test.use({ serviceWorkers: "block" })`, Pixel 7, 390×844, `/api/**` csonkolva a
  `game-viewport-experience.spec.ts:28–43` mintájára): `bc-start` után CDP-munkamenettel (`page.context().newCDPSession(page)`,
  `Input.dispatchTouchEvent`) két érintés egyszerre: az 1. a joystick közepén indul és felfelé 40 px-t mozdul, a 2. a vászon
  jobb részén indul és 80 px-t mozdul jobbra; 300 ms után `window.__websuliGame.probe()` → `moveFwd === true` ÉS a `yaw`
  megváltozott (> 0,2 rad); felengedés után `moveFwd === false`.

**Zöldnek maradó meglévő tesztek:** `blockcraft-subject-mapping`, `coupon-claim-wiring-guard` (22), `game-difficulty`, `game-feedback-wiring-guard` (41),
`game-levels-wiring` (107), `game-touch-controls` (117), `grade-quiz-select` (225, 252, 255), `lesson-experience` (106), `quiz-bank-integrity` (23, 110),
`remaining-quiz-explanations` (8), `audit-2026-09-static`, `home-practice-games-catalog`; e2e: `games-pointer-controls` (52: fine → `bc-touch-controls` 0 db,
`bc-keyboard-hint` látható, vászon ≥ 60%; 82: coarse → az első gomb ≥ 44 px), `games-touch-controls` (162), `game-viewport-experience` (`bc-start`), `game-win-paths` (`bc-level-complete`).

**Parancsok:** `cd source && node --import tsx --test tests/blockcraft-mobile.test.ts tests/blockcraft-subject-mapping.test.ts tests/game-touch-controls.test.ts tests/vocab-game-wiring.test.ts` → `# fail 0`;
`npm run test:e2e -- tests/blockcraft-two-finger.spec.ts tests/games-pointer-controls.spec.ts tests/games-touch-controls.spec.ts`;
`npx playwright test -c playwright.game-mobile.config.ts -g block-craft-quiz`; `npx playwright test -c playwright.game-release.config.ts`; K.1/2.

**Elfogadás:** A8 (Kockavadász); M1–M11; M12/3; P2.

**Tiltások:** a világ-generálás, a pontozás és a kérdésbankok tartalma; közös fájl.

---

## S12 — Tornado Hunter 200 mobilra + szóbank

**Állapot:** nincs elkezdve. Kanban #29. Modell: Opus. Függőség: S1 és S2 összevonva.

- **Cél:** 4.5 keret; érintővezérlés csak érintős eszközön; minden gomb ≥ 48 px (a kilépés is); a HUD 9–11 px-es szövegei
  olvasható méretre; fekvő tájolás ajánlása; angol kérdések a szóbankból (A8).
- **Ág:** `feat/jatekok-s12-tornado`.
- **Módosítható fájlok:** `source/client/src/pages/TornadoHunter200.tsx`, `source/client/src/lib/tornado/questions.ts`,
  `source/client/src/tornado/buildMeshes.ts` (csak effekt-paraméter), `source/tests/game-mobile-cases/tornado-hunter-200.ts`,
  `source/tests/vocab-wiring-cases/tornado-hunter-200.ts`, új `source/tests/tornado-mobile-shell.test.ts`, képernyőképek `docs/measurements/jatekok-mobil/S12/`.
- **Ellenőrzött horgonyok (`TornadoHunter200.tsx` = TH, `lib/tornado/questions.ts` = Q):**
  - `function TouchControls(props: {` TH:2246, gyökér `data-testid="tornado-touch-controls"` TH:2279, `VirtualJoystick` `radius={52}` TH:2263,
    `⚓` és `Cam` gomb TH:2270–2273; `function TouchBtn` TH:2306, méret TH:2319 (`props.small ? "w-12 h-12 text-xs" : "w-14 h-14 text-sm"`);
  - hívás: `<TouchControls` TH:2071 — **feltétel nélkül** minden play-fázisban; nincs `useCoarsePointer`;
    `tests/tornado-mobile-controls.test.ts:26–44` csak a `function TouchControls` … `function TouchBtn` közötti blokkot vizsgálja
    (nincs `sm:hidden`, `md:hidden`, `lg:hidden`, önálló `hidden`, `coarse:flex`; van `flex`); index.css 440–442 (`.tornado-pedals`);
  - kis gombok: kilépés TH:1896 `<Button variant="ghost" size="sm" className="… -ml-1 h-7" onClick={props.onExit}>` („Szintek”, 28 px);
    TH:583, 589, 977 `size="sm"`; TH:657 `w-full h-8`; TH:276 `AudioToggleButton size="icon"` (44 px);
  - apró szöveg — HUD/játék: TH:1895 `text-[11px] sm:text-xs`, 1922, 1940, 1949, 1983 `text-[11px]`, 1974 `text-[10px]`, kvíz 2011, 2041 `text-[11px]`,
    eredmény 2098, 2102 `text-[10px]`, 2319 `text-xs`; menü 275, 393, 417, 421 `text-xs`, 415, 456 `text-[11px]`; garázs 549–698, szintválasztó 733–772,
    beállítások 796–861, statisztika 911–964 (`text-[10px]`/`text-[11px]`/`text-xs`);
  - ciklus: rAF TH:1323–1330; `pausedRef` TH:1088; `PlayPhase` TH:195 (`"paused"` is); Escape-szünet TH:1414–1420 (`escAction`, `lib/tornado/controls.ts:58`);
    szünet-overlay TH:2047–2062 („Folytatás” 2054–2060, „Szintek” 2062); `visibilitychange` TH:1449–1452 csak `releaseAll()`; érintéses szünetgomb NINCS;
  - tájolás-kezelés NINCS (csak `ResizeObserver`/`resize` TH:1308–1321);
  - kérdések: `pickQuestion` Q:424, `PickArgs` Q:376; sorrend Q:418–419 (tananyag nem látott → bármely tananyag → 7–12.: `pickGradeQuiz` Q:440–448 → saját bank nem látott → bármely); `QUESTION_BANK` Q:359, `ENG_1…ENG_6` Q:281, 294, 307, 320, 333, 346, összefűzés Q:366–371, `OWN_BANK_MAX_GRADE = 6` Q:26;
    tananyag `useQuery` TH:1055–1059 (`/api/games/material-quizzes?…&limit=3`), `materialToQuestions` Q:163; hívás TH:1163 `const q = pickQuestion({`; `recentQuizRef` TH:1173 (`slice(-8)`), `markGradeQuizSeen` TH:1174;
  - hang TH:54–61; rezgés NINCS; `useReducedMotion` TH:53, 1146–1148; képernyőrázás NINCS (TH:1845 megjegyzés); minőség kézi `props.progress.settings.quality` TH:1019 (nincs `detectLookTier`);
    részecskék TH:1282 `buildRain(quality)`, TH:1287 `SparkleField`, tölcsér/törmelék `tornado/buildMeshes.ts:463`, 481, minőségprofilok `buildMeshes.ts:58–60`;
  - képernyő: `useState<Screen>("menu")` TH:215; „Vadászat indítása” TH:428 → `setScreen("levels")` TH:289 → szintválasztás → `setScreen("play")` TH:313–318 (2 érintés); évfolyampálya `tornado-level-start` TH:448–449 (1 érintés, ha `props.levels.active`);
    eredmény `setResult`/`setPhase` TH:1500–1501, JSX TH:2083–2111 (`th-result` 2084, „Újra (R)” 2108, „Szintek” 2111); gyökér TH:256–257 (`data-game="TornadoHunter200" data-playing={screen === "play"} data-fixed-screen={screen !== "menu"}`);
  - testid-k: `tornado-coins` 277, `tornado-grade-levels` 439, `tornado-level-start` 449, `tornado-school-levels` 797, `tornado-target-marker` 1968, `th-result` 2084, `tornado-touch-controls` 2279.

**Lépések:**
1. Első commit: `**Állapot:**` sor (K.2).
2. Érintés-gate a HÍVÁS helyén (a `TouchControls` blokkja nem kap `hidden` osztályt, így a `tornado-mobile-controls.test.ts`
   változatlanul zöld): `const touch = useTouchCapable();` és TH:2071 → `{touch && <TouchControls … />}`. A joystick
   `radius="auto"`; a `TouchBtn` (2319) mérete `small ? "w-12 h-12 text-sm" : "game-action-btn text-base"`.
3. Gombok ≥ 48 px: TH:1896 `h-7` → `min-h-12 min-w-12 px-3` (a felirat „Szintek” marad), TH:583, 589, 977 `size="sm"` → `className`-ben `h-12`;
   TH:657 `h-8` → `min-h-12`; TH:276 `AudioToggleButton` → `className="h-12 w-12"`. Az érintéses szünetgomb a `GameHud onPause`-ból jön
   (`pausedRef.current = true; setPhase("paused")` — a TH:1414–1420. sori Escape-ág logikájával azonosan).
4. Apró szövegek: a HUD/játék/kvíz/eredmény felsorolt sorai (1895, 1922, 1940, 1949, 1974, 1983, 2011, 2041, 2098, 2102) → legalább
   `text-xs`, a HUD-értékek `var(--game-hud-font)`; a menü, garázs, szintválasztó, beállítások és statisztika `text-[10px]`/`text-[11px]`
   sorai → `text-xs` (M2/M3 a kezdőképernyőn is mér).
5. Szünet és háttérbe kerülés: `GameShell onAutoPause` → ugyanaz, mint a 3. pont szünete; a TH:1449–1452 `releaseAll()` marad.
   A TH:2047–2062. sori szünet-overlay helyett `PauseMenu` (`onResume` = a „Folytatás” logikája, `onRestart` = a TH:1427 `r` ág
   logikája, `onExit` = a „Szintek” logikája, `exitLabel="Szintek"`); a beállítások (balkezes mód, minőség) a `children`-be.
6. Tájolás: `GameShell orientation="landscape"` → álló nézetben játék közben `RotateHint` („Így is játszom” után a futás végéig nem jön elő).
7. Minőség: a kézi beállítás (TH:1019) marad; ha a felhasználó nem állított minőséget (UNKNOWN: a `progress.settings.quality`
   alapértéke — `lib/tornado/progress.ts`-ben kell megnézni), az alapérték `detectLookTier()` (`three-look/tier.ts:102`) eredménye.
8. Visszajelzés: jó válasz `haptics("success")`, rossz `"error"`, tornádó-befogás `"hit"`; látvány: befogáskor a tölcsér körül
   törmelék-kitörés (`buildMeshes.ts:481` törmelék `× 2` részecske 600 ms-ig, `particleScale`-lel), a célpontjelölő (1968) pulzálása;
   `useReducedMotion` mellett a kitörés 0,4× (`motionScale`), pulzálás nincs.
9. Eredmény: `ResultScreen testId="th-result"`, `won` a `result.won`-ból, `score` = `result.score`, `extra` = Storm Coin sor
   (a TH:2098–2102 tartalma `text-sm`-mel), `retryLabel="Újra"`, `onBack` → `/games`; a „Szintek” a `PauseMenu`-ben és a `StartScreen`-en érhető el.
10. Kezdőképernyő: `StartScreen` `startLabel="Vadászat indítása"` (illeszkedik a `game-viewport-experience.spec.ts:24` regexére),
    `onStart` = a TH:289 mostani útja; ha `props.levels.active`, a `tornado-level-start` gomb a `secondary`-ban elöl marad (1 érintés);
    a Garázs és a Statisztika a `secondary`-ban.
11. Szóbank (A8): `const vocab = useVocabQuizSource("en", true)` a TH-ban; a `pickQuestion` (Q:424) `PickArgs`-a (Q:376) új, opcionális
    mezőt kap: `vocabNext?: () => Question | null`; a sorrendben a tananyag-ágak (Q:418–419 első kettő) UTÁN és a `pickGradeQuiz`
    (Q:440–448) ELŐTT hívódik, ha az évfolyam ≤ `OWN_BANK_MAX_GRADE` (Q:26) és a saját bank angol tételt adna, VAGY ha a
    `pickGradeQuiz` angol tárgyú tételt adna. Pontos elhelyezés: a Q:418–463 törzs elolvasása után; a `vocabNext` eredménye
    `Question` alakra képezve (UNKNOWN: a `Question` típus mezői — Q fájl eleje; a végrehajtó a típusdefinícióból képezi le).
    A TH:1163 hívásnál `vocabNext: vocab ? () => mapVocab(vocab.next(vocabLevelForGrade(grade, adaptiveBand))) : undefined`;
    a TH:1173–1174 naplózás változatlan; kézi angol kérdésnél `vocab?.markExternal(…)`.
12. Esetfájlok: `game-mobile-cases/tornado-hunter-200.ts` → `"full"`, `orientation: "landscape"`, `touchControlsTestId: "tornado-touch-controls"`,
    `playReady`: a `tornado-touch-controls` (érintős) látható; `answerWrong`: `forceState({ screen: "play", phase: "quiz" })` (ha a teszt-API — TH:33 import —
    nem kezeli, bővíteni), majd az első rossz válaszgomb (`correctDataAttrs` hozzáadása a kvíz gombjaihoz, ha hiányzik).
    `vocab-wiring-cases/tornado-hunter-200.ts` → `wired: true`, `materialFirstFile: "client/src/lib/tornado/questions.ts"`.

**Megírandó teszt (`tornado-mobile-shell.test.ts`, forrásőr, kommentek nélkül):** a `<TouchControls` hívás egy `useTouchCapable()` eredményéhez
kötött feltételben áll; a TH-ban nincs `h-7` és `h-8` osztály gombon; a play/kvíz/eredmény JSX-ben nincs `text-[9px]`, `text-[10px]`, `text-[11px]`;
a `GameShell` `orientation="landscape"`-et kap; a `pickQuestion` törzsében a tananyag-ágak a `vocabNext` hívás előtt állnak.

**Zöldnek maradó meglévő tesztek:** `tornado-mobile-controls` (változatlan!), `tornado-touch-drive`, `tornado-input-release`, `tornado-controls`, `tornado-gamepad`,
`game-touch-controls`, `virtual-joystick-reset`, `tornado-questions`, `game-quiz-contract`, `grade-quiz-select`, `remaining-quiz-explanations`, `tornado-levels`,
`tornado-grade-levels`, `game-levels-wiring`, `grade-levels`, minden `tornado-*` fizika/világ teszt, `tornado-vehicles`, `tornado-progress`, `tornado-wiring-guard`,
`coupon-claim-wiring-guard`, `game-feedback-wiring-guard`, `audit-2026-09-static`, `home-practice-games-catalog`; e2e: `tornado-hunter-render.spec.ts`,
`game-viewport-experience`, `game-win-paths` (`th-result`, gombok ≥ 44 px), `games-touch-controls`.

**Parancsok:** `cd source && node --import tsx --test tests/tornado-*.test.ts tests/game-touch-controls.test.ts tests/vocab-game-wiring.test.ts tests/grade-quiz-select.test.ts` → `# fail 0`;
`npm run test:e2e -- tests/tornado-hunter-render.spec.ts tests/games-touch-controls.spec.ts`;
`npx playwright test -c playwright.game-mobile.config.ts -g tornado-hunter-200`; `npx playwright test -c playwright.game-release.config.ts`; K.1/2.

**Elfogadás:** A8 (Tornado); M1–M11; M12/7; P2.

**Tiltások:** a `tornado-mobile-controls.test.ts` módosítása; a vezetés-fizika, a járművek, a szintek; közös fájl.

---

## S13 — Játéklista és főoldali kártyák arculata, teljes mátrix, verify, átfogó review, retro

**Állapot:** nincs elkezdve. Kanban #30. Modell: Opus. Függőség: S1–S12 mind összevonva.

- **Cél:** közös arculat a játéklistán és a főoldali kártyákon; a mobil mátrix mind a 7 játékra `"full"`, a szóbank mindhárom
  nyelven `"full"`, a szóbank-bekötés mind a 6 nyelvi játékban — őr-tesztekkel; `npm run verify` zöld; átfogó review
  PR-kommentként; retro; csapdák.
- **Ág:** `feat/jatekok-s13-zaras`.
- **Módosítható fájlok:** `source/client/src/pages/Games.tsx`, `source/client/src/components/HomePracticeGames.tsx`,
  `source/client/src/index.css` (csak a `.game-card` 1224–1330 körüli szabályai a közös változókra),
  új `source/tests/game-mobile-complete.test.ts`, `docs/agent-csapdak.md` (új C-bejegyzés), új retro-fájl (lent),
  képernyőképek `docs/measurements/jatekok-mobil/S13/`.
- **Ellenőrzött horgonyok:** `Games.tsx` 647 sor: játéklista-adat 163–215 (azonosítók 163, 171, 179, 186, 193, 200, 208), kártyák
  `Link` 390–537 (Szökőár nehézség-linkek 390–396), `export default function Games()` 217; `HomePracticeGames.tsx` 105 sor:
  `GameCardBody` 8, rács `grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-fr` 52, kártyák 54–95 (`game-card`,
  `accent()` 6), Szökőár `game-diffs` 58–61; index.css `.games-head` 1184, `.game-card` 1224, `.game-icon` 1250, `.game-title` 1272,
  `.game-cta` 1286, `.game-diffs` 1297, `.game-diff` 1305–1321. Korábbi retró-fájl a repóban NINCS (`git ls-files | grep -i retro` → 0;
  a `docs/**/*.md`-ben a „retro” szó csak a tervben áll) — ezért a retró helye: `docs/handoffs/2026-<hh>-<nn>-jatekok-mobil-szobank-retro.md`
  (a `docs/handoffs/` a futásjelentések mappája) ÉS összefoglaló a PR-kommentben.

**Lépések:**
1. Első commit: `**Állapot:**` sor (K.2).
2. Arculat: a `.game-card`, `.game-cta`, `.game-diff` színei, lekerekítése és betűméretei a K.7.3 változóira (`--game-surface-2`,
   `--game-radius`, `--game-accent`); a kártya és a nehézség-linkek (`game-diff`, 390–396 / 58–61) érintési célja ≥ 48 px; a kártyacím ≥ 16 px,
   a leírás ≥ 14 px. M8: a kártya egy koppintással a játék kezdőképernyőjére visz (a `Link` útvonala változatlan).
3. `game-mobile-complete.test.ts` (node): mind a 7 `tests/game-mobile-cases/*.ts` `status === "full"` és mindegyiknek van `answerWrong`-ja
   és `playReady`-je; mind a 6 `tests/vocab-wiring-cases/*.ts` `wired === true`; `VOCAB_EN_STAGE`, `VOCAB_DE_STAGE`, `VOCAB_FR_STAGE` mind `"full"`.
4. Teljes futás: `npm run test:e2e -- tests/game-mobile-quality.spec.ts` (alap konfiguráció, épített szerver) → 7 × 3 nézet + nem-érintős és
   érintős-laptop esetek mind passed; képernyőkép játékonként 390×844 játék közben (7 db) a `docs/measurements/jatekok-mobil/S13/` alá.
5. `npm run verify` a munkafa gyökeréből (`doctor:arch && check && lint && check:test && test && build`) → exit 0 (P1). Ezen felül a
   teljes e2e: `npm run test:e2e` → a futás összegző sora a PR-ba (NOT RUN esetén ok + kockázat).
6. Átfogó review (P3; AGENTS.md „Review guidelines”): független Opus-alügynök a TELJES funkcióra (S1–S13 diffje `git diff 3e9df145..HEAD`
   a munkafában) a kötelező szempontokkal: adatszerződés (a K.7 típusai a hívókban), biztonság/adatvédelem (a `localStorage` napló nem tárol
   személyes adatot; nincs titok), regresszió (névtelen látogató — nincs pontszám-szinkron, a helyi legjobb működik; bejelentkezett felhasználó;
   leckéből indított játék `?lessonId=` és kupon-HUD; régi anyag), időzóna (a napló időbélyege ms, nem dátum), indítás / e2e-mód (teszthookok
   csak `VITE_ENABLE_GAME_TEST_HOOKS=1` mellett). Finding csak `fájl:sor` + hibaforgatókönyv; kritikus findingnál cáfoló kör. A review szövege
   PR-kommentként: `gh pr comment <n> --body-file <scratchpad fájl>`. A megerősített findingok javítása ebben a szeletben.
7. Csapdák: `docs/agent-csapdak.md` új bejegyzés `## C-30 — Játékok mobilra + szóbank (2026-<hh>-<nn>)` a futás mért hibáiból
   (tünet → gyökérok → megelőzés), Edit eszközzel.
8. Retro (globális CLAUDE.md „KÖTELEZŐ futás utáni retro”): mért tények (szeletenként PR-szám, CI-körök száma, bukott kapuk és okuk,
   vak megoldó jelzett / valódi hiba darabszám, időráfordítás, ha mérve), mi ment rosszul és mennyibe került, milyen javítást végeztünk
   el ebben a futásban (módosított fájl megnevezésével), mi került kanbanba; legalább egy konkrét javítás a repó tudásába (a C-30 vagy
   QA-szkript).

**Zöldnek maradó meglévő tesztek:** `home-practice-games-catalog.test.ts` (a 7 útvonal a katalógusban), minden korábbi szelet tesztje.

**Parancsok:** `cd source && node --import tsx --test tests/game-mobile-complete.test.ts tests/home-practice-games-catalog.test.ts` → `# fail 0`;
`npm run test:e2e -- tests/game-mobile-quality.spec.ts`; `npm run verify` → exit 0; K.1/2.

**Elfogadás:** A1 (mindhárom nyelv `"full"` őrrel), A7/A8 (6/6 `wired`), M1–M11 mind a 7 játékra (teljes mátrix), M12 (játékonként, a lenti
táblázat szerint), P1, P2, P3, P4 (retro + csapda; a kanban- és munkafa-higiénia az orkesztrátoré).

**Tiltások:** játékoldal érdemi módosítása (csak a review megerősített findingja javítható, a PR-ban megnevezve); meglévő teszt gyengítése.

---

## F — Függőségi gráf és hullámterv

```
S0 ──┬──> S1 ──┬──> S3 (en) ──┐
     │         ├──> S4 (de) ──┤
     │         ├──> S5 (fr) ──┤
     │         └──┐           │
     └──> S2 ─────┴──> S6 … S12 (S1 + S2 után) ──┴──> S13
```

| Hullám | Párhuzamosan futó szeletek | Feltétel | Ütközés-kezelés |
|---|---|---|---|
| 0 | S0 | — | — |
| 1 | S1 ‖ S2 | S0 a `main`-en | S1 és S2 fájljai diszjunktak (S2 egyedül módosítja az `index.css`-t és a négy közös komponenst; S1 a `tsconfig.test.json`-t) |
| 2 | S3 ‖ S4 ‖ S5 ‖ S6 ‖ S7 ‖ S8 ‖ S9 ‖ S10 ‖ S11 ‖ S12 | S1 ÉS S2 a `main`-en | mindegyik csak a saját fájljait, a saját esetfájljait és e fájlban a saját `**Állapot:**` sorát módosítja; a tartalomszeletek nyelvenként külön mappában; a játékszeletek a szóbank mintakészletével is működnek |
| 3 | S13 | S1–S12 a `main`-en | — |

A 2. hullámban a merge-sorrend tetszőleges; minden merge előtt az ág frissítése a `main`-re (`git rebase origin/main` a munkafában,
majd újra a K.1/2 kapui) és az aktív futások őre (terv D2).

---

## T — Elfogadási pontok és bizonyítékaik

| Pont | Szelet | Bizonyíték (teszt / mérés) |
|---|---|---|
| A1 | S1 (mechanizmus), S3/S4/S5 (élesítés), S13 (őr) | `vocab-bank-validate.test.ts` „darabszám-minimum a nyelv állapota szerint” `stage: "full"` mellett; `game-mobile-complete.test.ts` (mindhárom `"full"`) |
| A2 | S1, S3, S4, S5 | `vocab-bank-validate.test.ts` „nulla hiba mindhárom nyelven” |
| A3 | S1 | `vocab-question-generator.test.ts` |
| A4 | S1 | `vocab-seen-history.test.ts` (10 futás × 20 kérdés; 2000 futásos szimuláció) |
| A5 | S1 | `vocab-seen-history.test.ts` (két forrás, egy tároló) |
| A6 | S1 | `vocab-seen-history.test.ts` (kivételt dobó tároló, sérült JSON, `null`) |
| A7 | S6, S13 | `vocab-game-wiring.test.ts` (Szólétra `wired: true`, `buildPool`/`markAsked`), `word-ladder-vocab.test.ts` |
| A8 | S8, S9, S10, S11, S12, S13 | `vocab-game-wiring.test.ts` (5 eset `wired: true`, tananyag-elsőbbség), `game-mobile-complete.test.ts` |
| A9 | S3, S4, S5 | `docs/measurements/2026-11-15-szobank-{en,de,fr}-vakmegoldo.md` (kanári 10/10 szintenként, valódi hiba 0) |
| M1 | S6–S12 (játékonként), S13 (mátrix) | `game-mobile-quality.spec.ts` `measureOverflow` 4 állapotban × 3 nézet |
| M2 | S6–S12, S13 | `smallTargets` (48 px) 4 állapotban; `games-touch-controls.spec.ts` (44 px) változatlanul |
| M3 | S6–S12, S13 | `smallFonts` (12 px) játék-, szünet-, eredményállapotban |
| M4 | S2 (változók), S6–S12, S13 | `emulateSafeArea` + `safeAreaViolations` |
| M5 | S2 (`detectTouchCapable`), S9, S10, S11, S12, S13 | `game-mobile-shell.test.ts` igazságtábla; spec „nem érintős” / „érintős laptop”; `games-pointer-controls.spec.ts` |
| M6 | S2 (`attachAutoPause`), S6–S12, S13 | `game-mobile-shell.test.ts`; spec `hideAndShowPage` → `game-pause-menu` |
| M7 | S2 (`ResultScreen`), S6–S12, S13 | spec `forceState(resultForce)` → `[data-game-result]`, csillagok, Újra, Vissza; `game-win-paths.spec.ts` |
| M8 | S2 (`StartScreen`), S6–S12, S13 | spec: `/games` → kártya → start = 2 koppintás után `playReady` |
| M9 | S6–S12, S13 | spec `emulateMedia({ reducedMotion: "reduce" })` + `answerWrong` → nincs `shake|flash` animáció |
| M10 | S2 (`useHaptics`), S6–S12, S13 | spec `stubVibrate` + `answerWrong` → `[30,40,30]`; hang: a lapok meglévő `sfx*` hívásai (forrásőrök) |
| M11 | S6–S12, S13 | spec konzol- és WebGL-hiba gyűjtés; `game-win-paths.spec.ts` zöld |
| M12/1 Szökőár | S9 | `tsunami-mobile.test.ts`; képernyőképek S9 |
| M12/2 Szólétra | S6 | `word-ladder-vocab.test.ts`; képernyőképek S6 |
| M12/3 Kockavadász | S11 | `blockcraft-mobile.test.ts`, `blockcraft-two-finger.spec.ts`; képernyőképek S11 |
| M12/4 Matek sprint | S7 | `speed-quiz-mobile.test.ts`; képernyőképek S7 |
| M12/5 Brain Rot | S8 | `brainrot-tuning.test.ts`; képernyőképek S8 |
| M12/6 Aszteroida | S10 | `space-asteroid-aim-assist.test.ts`; képernyőképek S10 |
| M12/7 Tornado | S12 | `tornado-mobile-shell.test.ts`, `tornado-mobile-controls.test.ts` (változatlan); képernyőképek S12 |
| P1 | S13 | `npm run verify` exit 0 a `main`-en az utolsó merge után (az orkesztrátor a merge után megismétli) |
| P2 | S2, S6–S13 | `docs/measurements/jatekok-mobil/S<n>/*.jpg` |
| P3 | S13 | PR-komment az átfogó reviewval |
| P4 | S13 + orkesztrátor | retro-fájl, C-30, kanban #17–#30 `done` bizonyítékkal, munkafák eltávolítva |

## U — Nyitott kérdések (UNKNOWN) és felderítésük

1. Képernyőképek csatolásának módja a PR-hoz: a repóban nincs gyakorlat (`git ls-files` szerint a `docs/` alatt egyetlen png van:
   `docs/design/Websuli_Koncepcio_Egy_Platform.png`). Alapértelmezés: commitolt JPEG (K.4); eltérésről az orkesztrátor dönt.
2. Brain Rot: a kérdés-kategória sorsolásának helye a `pickQuiz`-ben (400–423) — a végrehajtó a függvény törzséből derítse ki (S8/10).
3. Szökőár: a tárgyválasztó állapotváltozó neve (a 1379. sori választó) — a JSX `onClick`/`value` kötéséből (S9/5).
4. Aszteroida: hol dől el a `pickQuiz`-ben (929–961), hogy a kérdés angol — a törzs elolvasásával (S10/7).
5. Tornado: a `progress.settings.quality` alapértéke (`lib/tornado/progress.ts`) és a `Question` típus mezői (`lib/tornado/questions.ts` eleje) (S12/7, S12/11).
6. A játékok teszt-API-ja (`installGameTestApi`) kezeli-e a `forceState({ phase: "quiz" })`-t — játékonként a `forceState` törzséből; ha nem, a játékszelet
   bővíti a saját lapján (S6–S12, esetfájl-lépés).
