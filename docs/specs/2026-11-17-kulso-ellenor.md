# Spec: Külső, más rendszerű ellenőr (Google Gemini) a minőségkapuk mellé

> Dátum: 2026-11-17 · Állapot: JÓVÁHAGYVA (tulajdonosi kiegészítés 2026-11-17) · Előzmény: `docs/specs/2026-11-17-minosegkapuk.md`
> Végrehajtás: `docs/specs/2026-11-17-kulso-ellenor-vegrehajtas.md`

## 1. Cél

A Claude-alügynökös független fejlesztési ellenőr MELLÉ egy második, más rendszerű vélemény: a Google Gemini (`gemini-4-carbon`,
`thinkingLevel: HIGH`) a Gemini API-n át kapja meg a diffet, a spec-fejezetet és az ellenőrzőlistát, és hibát keres. A jelentést az
orkesztrátor második véleményként olvassa be; az állításait a kódból ellenőrizni kell (a külső modell nem lát a repóba).

## 2. NEM cél

- A döntő ítélet nem változik: a Claude-alügynökös ellenőr ítélete + az orkesztrátor dönt. A külső jelentés hiánya nem bukás.
- CI-bekötés (nyilvános repó: kulcs a CI-ban csak külön tulajdonosi döntéssel, `workflow_dispatch` / védett ág).
- A `source/` alkalmazáskód.

## 3. Érintett területek

- Új: `scripts/qa/gates/external-review.mjs` (+ `.test.mjs`), `scripts/qa/gates/external-review/checklist-{game,general}.md`.
- Módosul: `scripts/qa/gates/pre-pr-gate.mjs`, `scripts/qa/gates/pre-merge-gate.mjs` (figyelmeztető lépés), `scripts/qa/gates/lib.mjs`
  (a külső jelentés bizonyítékának olvasása), a `websuli-fejlesztesi-ellenor` skill (mindkét helyen), `AGENTS.md` (egy mondat),
  `docs/minosegkapuk.md`.

## 4. Rögzített döntések

- K1 — Kulcs: KIZÁRÓLAG a `GEMINI_API_KEY` környezeti változó vagy `--env-file <fájl>` (csak a `GEMINI_API_KEY=` sort olvassa). Útvonal
  nem égethető be; a kulcs soha nem kerül kimenetbe, naplóba, jelentésbe vagy bizonyíték-fájlba (`maskSecrets`, az `x-goog-api-key`
  fejlécben megy, nem URL-ben).
- K2 — Nincs kulcs / elfogyott a keret: „KIHAGYVA”, 0-s kilépés; `--strict` mellett 2.
- K3 — Küldés ELŐTT titok-szűrés mindenre (diff, teljes fájlok, spec, lista, kiegészítő anyag); találatnál a szkript megáll (4), a
  jelentésben csak `forrás:sor (fajta)`. Kizárt fájlok: `.env*`, bináris, mérési adatok, lock, `node_modules`, kulcsfájlok.
- K4 — Bizonyíték: a szkript `--record` kapcsolóval `external-<fej>.json`-t ír a bizonyíték-tárba (állapot, modell, token-összegek,
  jelentés útja és SHA-256-ja — kulcs és jelentés-szöveg nélkül). A `pre-pr-gate` / `pre-merge-gate` ezt csak FIGYELMEZTETÉSKÉNT nézi
  (`WARN`, ha hiányzik vagy KIHAGYVA; `PASS`, ha lefutott). Soha nem `FAIL`.
- K6 — Siker CSAK nem üres válasz + `finishReason` STOP + ítélet-fejezet esetén; különben `incomplete` / `blocked` bizonyíték,
  `.hianyos.md`, nem nulla kilépés (a #490 bot-lelete). Minden kapcsolati URL külön vizsgálva, fail-closed (a #490 bot-lelete).
- K7 — A működő állapot (éles futásból): Interactions háttér-mód `max_output_tokens` 131 072-vel (költségfék), az azonosító
  azonnal mentve; időtúllépést / megszakadt kapcsolatot nem ismétel; szint `high`; nyers bank-adat alapból kizárva.
- K5 — A forrásban e-mail-alakú szöveg nincs (a nyilvános repó címőre miatt): az engedélyezett címeket futásidőben rakja össze.

## 5. Edge case-ek

Nincs kulcs; 402 (keret) → KIHAGYVA; 429 / 5xx → legfeljebb 3 újrapróba; túl nagy bemenet → 5 (bontani); titok a diffben → 4;
`--dry-run` → csak `countTokens`; a jelentés csonka (`finishReason` ≠ STOP) → jelölve.

## 6. Elfogadás (EARS)

- WHEN nincs `GEMINI_API_KEY` THEN the script SHALL „KIHAGYVA” jelentést írni és 0-val kilépni (`--strict`: 2).
- WHEN a bemenetben titok-minta vagy nem engedélyezett e-mail van THEN the script SHALL a hálózat elérése nélkül 4-gyel megállni, érték nélkül.
- WHEN a kulcs bármely kimenetbe kerülne THEN the script SHALL helyőrzőre cserélni.
- WHEN a `pre-pr-gate` / `pre-merge-gate` fut THEN SHALL a külső jelentés hiányát `WARN`-ként jelezni, és nem bukni miatta.
- WHEN a CI „Háromfázisú rend” jobja fut THEN SHALL az `external-review.test.mjs`-t is futtatni (a meglévő glob).

## 7. Tesztterv

`external-review.test.mjs` (17 + a bizonyíték-írás esetei), `pre-pr-gate.test.mjs` / `pre-merge-gate.test.mjs` (a figyelmeztető lépés).

## 8. Kockázat

Költség (~0,4–1,5 USD / PR) — csak kézi futtatás. A külső modell hallucinálhat — a skill kötelező visszaellenőrzést ír elő.

## 9. Végrehajtás

- `docs/specs/2026-11-17-kulso-ellenor-vegrehajtas.md`


## 10. C-61 pontosítása (kanban #92)

> Orkesztrátori döntés 2026-11-17: ebben a PR-ban, a #485 utáni beolvasztó pushsal együtt (egy CI-kör megspórolva).

**Cél.** A `pre-merge-gate` C-61 lépése (main elmozdult a PR CI-ja óta + a PR repó-szintű őrt / ellenőrzést érint → FAIL) csak akkor
kérjen új beolvasztást és CI-t, ha a main elmozdulása olyan fájlt érint, amelyet a PR által érintett ellenőrzés ténylegesen olvas.
Egy csak játékkódot hozó main-elmozdulás ne kényszerítsen 1 órás E2E-t egy `scripts/qa`-s PR-ra.

**Nem cél.** A tartalmat minden követett fájlon szkennelő őrök (`*-guard.test.ts`) és a workflow-módosítás szigorának csökkentése;
a többi merge-kapu lépés; a CI.

**Hatókör-táblázat** (`scripts/qa/gates/gates.config.json` → `repoWideScopes`; minden sorhoz indoklás fájl:sorral):

| PR-fájl mintája | A main mely változása számít | Indoklás |
|---|---|---|
| `-guard\.test\.ts$` | `.*` (bármi) | az őrök a `git ls-files` minden fájlját olvassák (pl. `source/tests/no-real-emails-guard.test.ts`) |
| `^scripts/qa/` | `^scripts/qa/`, `^docs/specs/`, `^render\.yaml$`, `^\.agents/skills/`, `^\.claude/skills/`, `^\.github/workflows/` | a `three-phase-check.mjs:38` / `:71` a `docs/specs/` tartalmát olvassa; a `verify-render-settings.test.mjs:22` a `render.yaml`-t; a `skills-sync-check.test.mjs:33–34` és a CI `skills-sync-check` lépése (`.github/workflows/ci.yml:30`) a valódi skill-fájlokat; a workflow (`ci.yml:24`, `:28`, `:32`) határozza meg, mi fut |
| `^\.github/workflows/` | `.*` | a workflow minden jobot újradefiniál |

**Fail-closed szabályok.** FAIL, ha a main-elmozdulás fájllistája (`gh api repos/{o}/{r}/compare/{ciBase}...{mainSha}` → `files`)
nem olvasható; csonka (≥ 300 fájl — a végpont legfeljebb ennyit ad); üres, miközben a SHA eltér; vagy a PR-fájl illeszkedik egy
mintára, és a hozzá tartozó hatókör bármely main-fájlra illik. Hiányzó vagy hibás hatókör-bejegyzés → `.*`. Csak ha nincs metszet:
WARN, a két fájllistával.

**Elfogadás (EARS).**
- C1 WHEN a main elmozdult, a PR `scripts/qa/`-t érint, és a main csak `source/client/**`-t változtatott THEN SHALL WARN (nem FAIL).
- C2 WHEN a main `scripts/qa/**`, `docs/specs/**`, `render.yaml`, skill-fájl vagy `.github/workflows/**` változást hozott, és a PR `scripts/qa/`-t érint THEN SHALL FAIL.
- C3 WHEN a PR `*-guard.test.ts`-t vagy `.github/workflows/`-t érint, és a main bármit változtatott THEN SHALL FAIL.
- C4 WHEN a fájllista nem olvasható, csonka (≥ 300) vagy üres eltérő SHA mellett THEN SHALL FAIL.
- C5 WHEN a main SHA-ja egyezik a CI alapjával THEN SHALL PASS (változatlan).


## 11. A hook fail-closed viselkedése időtúllépéskor (kanban #100)

> Blokkoló lelet (két független ellenőr terhelt gépen mérte, az orkesztrátor a kódból megerősítette): a
> `check-quality-gates.mjs` `repoInfo()`-ja a `git rev-parse --show-toplevel` BÁRMELY hibájára — a 3 s-os időtúllépésre is —
> „más repó”-t mondott, és a hook bizonyíték nélkül ENGEDETT. Ez ellentmond a „kétség esetén DENY” elvnek.

**Cél.** (1) A hook különböztesse meg a „nem git-repó / a git gyorsan, nem nulla kóddal kilépett” esetet (→ más repó, enged) attól,
amikor a git NEM adott választ (időtúllépés, jelzéssel leállítva, indítási hiba, ENOENT) → DENY „a repó állapota nem állapítható meg
— próbáld újra”. Ha a `cwd` vagy a parancs a WEBSULI-ra utal, és a git nem válaszol / nem repót mond → DENY. (2) Az időkorlát
emelése és konfigurálhatósága (`gates.config.json`: `hookGitTimeoutMs`, `hookGhTimeoutMs`, `hookBudgetMs`); a hook teljes
futása a Claude Code hook-időkorlátja alatt marad (`.claude/settings.json` `timeout`). (3) Az összes `catch` átnézése a hookban és
a kapu-szkriptekben: minden „nem a mi dolgunk / PASS / kihagyás” ág vagy bizonyítottan ártalmatlan (kommenttel), vagy tilt.
(4) A hook ne tagadjon meg olyan parancsot, amely nem `git` / `gh` hívás, csak egy idézett argumentumában szerepel a „push” szó,
ha a parancsszó egy szkriptet futtató értelmező szkriptfájllal (pl. `node kanban.mjs note 5 "… push …"`); a burkoló, alias,
láncolás, változó, `-e` / `-c` kiértékelés továbbra is DENY.

**Nem cél.** A kapu-köteles parancsok engedett alakjainak bővítése; a többi hook.

**Elfogadás (EARS).**
- T1 WHEN a `git rev-parse` időtúllépéssel / jelzéssel / indítási hibával nem ad választ THEN the hook SHALL DENY-t adni
  („a repó állapota nem állapítható meg … próbáld újra”).
- T2 WHEN a git gyorsan, nem nulla kóddal kilép (nem git-repó), és sem a `cwd`, sem a parancs nem utal a WEBSULI-ra THEN the hook
  SHALL nem kimenetet adni (más repó).
- T3 WHEN a `cwd` a WEBSULI-ra utal, és a git nem repót mond THEN the hook SHALL DENY-t adni.
- T4 WHEN a git-hívások összideje elérné a `hookBudgetMs`-t THEN the hook SHALL DENY-t adni, mielőtt a Claude Code hook-időkorlátja lejár.
- T5 WHEN a parancs `node <szkript>.mjs … "… push …"` alakú, `-e` / `-p` / `--eval` nélkül THEN the hook SHALL nem kimenetet adni;
  WHEN `echo x && git push` THEN SHALL DENY.
- T6 WHEN a `check-quality-gates.test.mjs` 20-szor egymás után fut a terhelt fejlesztői gépen THEN SHALL mind a 20 zöld legyen.
