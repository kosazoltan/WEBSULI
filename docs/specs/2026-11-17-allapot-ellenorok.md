# Spec: Állapot-ellenőrző szkriptek (memória, kanban, futtatókörnyezet, keresés-pontosság)

> Dátum: 2026-11-17 · Szerző: Claude Code (alügynök) · Állapot: JÓVÁHAGYVA (tulajdonosi utasítás 2026-11-17 este)
> Végrehajtás: `docs/specs/2026-11-17-allapot-ellenorok-vegrehajtas.md`. Kapcsolódik: `docs/minosegkapuk.md` (kapu-regiszter),
> `docs/specs/2026-11-17-kapuk-beepites.md`, `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md` (S2 állítás-ellenőrző — nem ez a PR).

A tulajdonos (Kósa Zoltán, 2026-11-17 este), szó szerint: „Ellenőrizd a memóriákat, kanbantáblákat, a futtatókörnyezetet. Készíts
olyan ellenőrző scripteket, amelyek helyben, a gépen vagy a szerveren megfelelő módon ellenőrzik a keresések pontosságát, a találatok
pontosságát. … minden esetben készíts teszteket, scripteket, hogy a teljes folyamat ne csak egy emberi prózával fantáziálható,
hallucinálható, mellébeszélhető, túlgondolható mesterséges intelligencia ügynökre legyen bízva, hanem kőkemény, helyben futó szkriptekre,
amik ebben a repóban, ebben a projektben a kemény vázát alkotják a folyamatoknak …”

## 1. Cél

Helyben futó, csak olvasó szkriptek döntik el a memória, a kanban-tábla, a futtatókörnyezet és a termék keresőjének állapotát — nem az
ügynök emlékezete. Mindegyik gépi (JSON) és emberi kimenetet ad, determinisztikus kilépési kóddal, és tesztje van.

## 2. NEM cél

- A `source/` alkalmazáskód és a játékok módosítása (kivétel: egy új keresés-pontosság egységteszt a `source/tests/` alatt).
- A `scripts/qa/gates/` meglévő fájljainak módosítása; az S2 állítás-/hivatkozás-ellenőrző és a teszt-integritás kapu (szkriptkapuk-terv).
- Kanban írása, munkafa / ág törlése, a kereső javítása (a hiányosság jegyre megy, mért számokkal).

## 3. Érintett területek

- Új: `scripts/qa/checks/lib.mjs` (közös eredménymodell, kimenet, kilépési kódok, titok-szűrés), `checks.config.json`,
  `memory-check.mjs`, `kanban-check.mjs`, `env-doctor.mjs`, `search-accuracy.mjs`, és mindegyik `*.test.mjs`-e;
  `scripts/qa/checks.test.mjs` (a `scripts/qa` gyökér-tesztlistájába köti a `checks/` tesztjeit, hogy a `gate:stage` / `gate:push` futtassa).
- Új: `source/tests/search-accuracy.test.ts` — aranykészlet a főoldali keresőre (`matchesHomeSearch`), valódi publikus adatból.
- Gyökér `package.json`: `check:memory`, `check:kanban`, `check:env`, `check:search`, `check:all`.
- `.github/workflows/ci.yml` (`three-phase` job): a `scripts/qa/checks/*.test.mjs` futtatása (a szkriptek maguk helyi állapotot
  néznek → a CI-ban csak a tesztjük fut).
- `docs/minosegkapuk.md`: „Állapot-ellenőrzők” szakasz a végén. Új skill: `websuli-allapot-ellenor` (`.agents/skills/` + `.claude/skills/` tükör).
- Futtatókönyvek: `docs/kanban.md` (a kézi söprés helyére `npm run check:kanban`) — a `docs/agent-haromfazisu-munka.md` és a
  `docs/telepites-elotti-or.md` a `chore/kapuk-beepites` ágon módosul, ott egészítendő ki (ütközés elkerülése).

## 4. Rögzített döntések

- Csak Node beépített modulok (`node:fs`, `node:child_process`, `node:sqlite` — Node ≥ 22.5; a CI Node 24); `npm ci` nélkül fut.
- Kilépési kód: 0 = nincs FAIL; 1 = van FAIL; 2 = a szkript nem tudott futni (hiányzó bemenet / kivétel) — a 2 is bukás.
  Szintek: FAIL / WARN / INFO / SKIP (a SKIP nem zöld: a kimenet megnevezi, mi maradt ellenőrizetlen).
- A memória útvonala NEM égethető be (nyilvános repó): `--dir <út>` vagy `WEBSULI_MEMORY_DIR`; ha egyik sincs, a Claude Code
  szabálya szerint számolt alapút (`~/.claude/projects/<a repó útvonala kódolva>/memory`).
- A kanban-tábla: `<git-common-dir>/../.hermes/kanban.db` (a fő checkout gyökere; munkafából is), csak olvasó megnyitással
  (`node:sqlite`, `readOnly: true`). A `gh`-t igénylő ellenőrzés `gh` / hálózat nélkül SKIP.
- Titok: környezeti változónak csak a NEVE és a van / nincs ténye kerül ki; minden kimenet a `redact` szűrőn megy át (e-mail,
  kapcsolati szöveg, token-előtag).
- Keresés: a terméknek két keresője van — a főoldali kliensoldali szűrő (`matchesHomeSearch`, cím + leírás + tantárgynév, ékezet- és
  kisbetű-független, ezt használja a felület) és a `GET /api/html-files/search` (ILIKE a címre és a leírásra, ékezetfüggő; a kliens
  jelenleg nem hívja). Az aranykészlet-teszt a ma teljesülő elvárásokat rögzíti; a mért hiányosságok (elgépelés, ékezet a szerveres
  keresőben, téves tantárgy-besorolás) külön jelentésbe és jegyre mennek — teszt nem gyengül, `expected-fail` nincs.

## 5. Edge case-ek

- Üres / hiányzó memória-könyvtár → 2. Hiányzó kanban-adatbázis → 2. Frontmatter nélküli memória → FAIL.
- Memóriában idézett útvonal helykitöltővel (`<név>`, `*`, `…`) → nem ellenőrzött (INFO), nem FAIL.
- Kanban: jegy nem hivatkozik PR-ra → az (a) ellenőrzés nem vonatkozik rá; több PR-szám → mindegyik.
- Futtatókörnyezet: Windows / Linux útvonalak; `git status` lassúság → WARN (a kapu-hook 3 mp-es git-korlátja, kanban #100).
- Élő keresés (`--url`): csak GET, csak publikus végpont, időkorlát; hálózati hiba → SKIP a lépésre, a kilépési kód 2, ha semmi nem futott.

## 6. Elfogadási kritériumok (EARS)

- WHEN a memória indexe nem létező fájlra mutat, vagy egy memóriafájl hiányzik az indexből THEN `memory-check` SHALL exit 1 a fájl:sor megnevezésével.
- WHEN egy memória nem létező repó-útvonalra / `npm run` szkriptre hivatkozik THEN `memory-check` SHALL report FAIL a pontos sorral.
- WHEN egy `in_progress` / `in_review` jegy PR-ja MERGED / CLOSED THEN `kanban-check` SHALL list it as „lezárandó”; `gh` nélkül SKIP.
- WHEN egy szükséges eszköz hiányzik vagy egy hook-fájl nem létezik THEN `env-doctor` SHALL report FAIL.
- WHEN a bemenet hiányzik (nincs memória-könyvtár / kanban-DB) THEN the script SHALL exit 2.
- WHEN egy környezeti változó vagy idézett szöveg titok-alakú THEN the output SHALL NOT contain the value.
- WHEN a főoldali kereső az aranykészlet ma teljesülő eseteit futtatja THEN every expected id SHALL be among the hits, és a pontosság-
  ellenpróbák (idegen anyag nem talál) SHALL hold.

## 7. Tesztterv

`node --test scripts/qa/checks/*.test.mjs` (ideiglenes könyvtár, hamis memória, hamis kanban-DB `node:sqlite`-tal, hamis futtató);
`node --import tsx --test tests/search-accuracy.test.ts` (a `source/`-ból). Mutációs ellenpróba commit után (egy-egy ellenőrzés
kikapcsolása → a megfelelő teszt bukik; visszaállítás `git restore` helyett a commitból, `cmp`-vel ellenőrizve).

## 8. Kockázatok / visszavonás

- Hamis riasztás a memória-elavulásban (pl. szándékosan történeti állítás) → WARN-szint az időhöz kötött mintákra; a FAIL csak nem létező
  fájlra / szkriptre. Visszavonás: `git revert`.
- A `node:sqlite` kísérleti figyelmeztetése Node 22-n → a CI és a fejlesztői gép Node 24+ (`engines`).

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-17-allapot-ellenorok-vegrehajtas.md`
