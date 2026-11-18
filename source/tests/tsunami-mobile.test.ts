import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { pickUnseen, type SeenItem } from "../client/src/game-engine/no-repeat";
import { createGradeQuizSeen, markGradeQuizSeen, pickGradeQuiz } from "../client/src/game-engine/gradeQuiz";
import type { GradeSubject } from "../client/src/data/gradeQuizBank/types";
import { TSUNAMI_SUBJECT_QUIZ_BANKS } from "../client/src/data/tsunamiSubjectQuizBanks";

/**
 * S9 — Szökőár szökés mobilra (terv 4.6/1; végrehajtás S9 „Megírandó teszt”). Forrásőr a lapon, kommentek nélkül
 * (#183: a kikommentezett hívás nem számít bekötésnek), és a teljes futásra érvényes ismétlés-szűrés szimulációja a
 * valós tárgy-bankokon.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const page = stripComments(readFileSync(join(root, "client/src/pages/TsunamiEscapeEnglish.tsx"), "utf8"));

/** Egy függvény törzse a nyitó `{`-tól a párosított `}`-ig. */
function functionBody(src: string, signature: RegExp): string {
  const m = signature.exec(src);
  assert.ok(m, `nem található: ${signature}`);
  const open = src.indexOf("{", m.index + m[0].length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`nincs záró kapcsos zárójel: ${signature}`);
}

test("könnyű grafika: az eszköz képessége dönt, nem az ablak szélessége vagy a mutató", () => {
  const body = functionBody(page, /function isLowEnd\(\)[^{]*\{/);
  assert.doesNotMatch(body, /innerWidth/, "az ablakszélesség nem dönthet a grafikáról");
  assert.doesNotMatch(body, /hover:\s*none/, "a hover: none (mutató fajtája) nem dönthet a grafikáról");
  assert.doesNotMatch(body, /pointer:\s*coarse/, "a pointer: coarse (mutató fajtája) nem dönthet a grafikáról");
  assert.match(body, /detectLookTier\(\)/, "a three-look eszközszintje (detectLookTier) hiányzik");
  assert.match(body, /prefers-reduced-motion/, "a csökkentett mozgás is könnyű grafikát kér");
  assert.match(body, /deviceMemory/, "a kevés memória is könnyű grafikát kér");
});

test("könnyű grafika: egyszer dől el, átméretezésre nem vált (a jelenet nem épül újra)", () => {
  assert.match(page, /useState<boolean>\(isLowEnd\)/, "a light jelzés a betöltéskor, egyszer számolódik");
  assert.doesNotMatch(page, /setLightGraphics\(/, "futás közbeni átkapcsolás maradt");
});

test("érintővezérlés csak érintős eszközön", () => {
  assert.match(page, /const touch = useTouchCapable\(\)/, "nincs useTouchCapable");
  assert.match(page, /phase === "play" && touch && \(/, "a vezérlősáv feltétele nem tartalmazza az érintés-észlelést");
  assert.match(page, /phase === "play" && !touch && \(/, "érintés nélkül a billentyű-súgónak kell látszania");
  assert.match(page, /data-testid="tsunami-touch-controls"/);
  assert.match(page, /data-testid="tsunami-key-hint"/);
  assert.match(page, /className="tsunami-controls game-touch-layer"/, "a vezérlősáv a közös game-touch-layer réteget használja");
  assert.match(page, /data-game-controls/, "a biztonságisáv-méréshez kell a data-game-controls");
  assert.match(page, /radius="auto"/, "a tárcsa mérete a képernyőhöz igazodik");
  assert.match(page, /<HoldButton[\s\S]{0,120}size="auto"/, "a Sprint gomb a képernyőhöz méretezett HoldButton");
  assert.doesNotMatch(page, /hidden md:block/, "a billentyű-súgó ne a szélességtől függjön");
});

/**
 * SPEC-VÁLTOZÁS 2026-11-17 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J1a 5., K.6, D-J1a-8): a `pickQuiz` a
 * director `fresh({ band })` ága (a sávot a közös áramlat-vezérlő adja), és a választó a menet seedelt RNG-jét kapja (a lap
 * játékmenet-kódja sem húz `Math.random`-ot). A forrásrend és az ismétlés-szűrés elvárásai változatlanok.
 */
const PICK_QUIZ = /const pickQuiz = useCallback\(\(band: number = adaptiveRef\.current\.band\): Quiz =>/;

test("ismétlés-szűrés a teljes futásra: nincs slice(-4), van pickUnseen a futás listájával", () => {
  const pick = functionBody(page, PICK_QUIZ);
  assert.doesNotMatch(pick, /slice\(-4\)/, "a régi „utolsó ötöt kerüli” szűrő maradt");
  assert.doesNotMatch(page, /recentQuizIdsRef/, "a régi recent-lista maradt");
  assert.match(pick, /pickUnseen\(\[poolE, poolM, poolH\], tierForProgress\(eff\), runSeenRef\.current, rng\)/);
  assert.match(pick, /const rng = pickRngRef\.current\.next;/, "a választó véletlenje a menet seedelt RNG-je");
  assert.match(pick, /runSeenRef\.current\.push\(/, "a kiadott kérdés nem kerül a futás listájába");
  assert.match(page, /runSeenRef\.current = \[\];/, "a futás listája a startGame-ben nullázódik");
});

test("szóbank (A8): tananyag → szóbank → évfolyam-bank sorrend, kézi angol válasz a naplóba", () => {
  const pick = functionBody(page, PICK_QUIZ);
  const material = pick.indexOf("pickUnseenMaterial(");
  const bank = pick.search(/vocabRef\.current\.next\(/);
  const grade = pick.indexOf("pickGradeQuiz(");
  assert.ok(material >= 0 && bank > material, "a szóbank a tananyag UTÁN jön");
  assert.ok(grade > bank, "a szóbank az évfolyam-bank ELŐTT jön");
  assert.match(pick, /vocabRef\.current\?\.markExternal\(/);
  assert.match(page, /useVocabQuizSource\("en", subject === "english" \|\| subject === "mixed"\)/);
});

/*
 * SPEC-VÁLTOZÁS 2026-11-17 (D-J1a-8; terv 9.): a kvíz-kártya „animate-shake”-je megszűnt (nincs kvíz-kártya); a rázás a közös
 * `feel` (trauma²), amely csökkentett mozgásnál 0 — a meghajtó a `reducedMotion`-t kapja. A jó / rossz válasz rezgését a közös
 * kérdés-horog adja (nem kapcsolható ki), az ütközését a lap.
 */
test("rázás csak csökkentett mozgás nélkül; rezgés jó és rossz válaszra és a víz ugrására", () => {
  const make = functionBody(page, /const makeDriver = \(seed: string \| number, d: GameDifficulty, wavePace: number\): TsunamiDriver =>/);
  assert.match(make, /reducedMotion,/, "a rázás nincs a csökkentett mozgáshoz kötve");
  // SPEC-VÁLTOZÁS 2026-11-18 (docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md, D4): ütközés nincs; a rázás a víz ugrásakor
  // (rossz / lejárt válasz) a meghajtóban, ugyanazon a közös `feel`-en át — a mérce (közös feel, csökkentett mozgásnál 0) marad.
  const water = readFileSync(new URL("../client/src/lib/tsunami/water.ts", import.meta.url), "utf8");
  assert.match(water, /if \(e\.type === "waterSurge"\) \{\s*feel\.addTrauma\(/, "a rázás a közös feel-en át megy");
  assert.match(water, /createFeel\(\{ reducedMotion: opts\.reducedMotion/, "a rázás a csökkentett mozgáshoz kötött");
  assert.doesNotMatch(page, /animate-shake/);
  assert.match(page, /haptics\("hit"\)/);
  const hook = functionBody(page, /const q = usePlayQuestion\(/);
  assert.doesNotMatch(hook, /haptics:\s*false/, "a jó / rossz válasz rezgése nem kapcsolható ki");
});

test("keret: GameShell, szünet, eredményképernyő a meglévő testid-kkel", () => {
  assert.match(page, /<GameShell\s+gameId="TsunamiEscapeEnglish"/);
  assert.match(page, /onAutoPause=\{pauseGame\}/);
  assert.match(page, /<PauseMenu\b/);
  // SPEC-VÁLTOZÁS 2026-11-17 (D-J1a-8): a kvíz-fázis megszűnt; szünetben (és a „Miért?” alatt) a meghajtó a szünet-úton
  // fut: a kérdés-óra és a szimuláció áll (a hurok időskálája 0), a HUD-óra sem jár.
  assert.match(page, /const isPaused = pausedNowRef\.current \|\| whyOpenRef\.current;/, "szünetben a játékciklusnak állnia kell");
  assert.match(page, /driver\.frame\(dt, isPaused, onEvent\)/, "a meghajtó megkapja a szünetet (a kérdés-óra is áll)");
  assert.match(page, /if \(phase !== "play" \|\| paused \|\| explainCard\) return;/, "szünetben a HUD-óra áll");
  assert.match(page, /testId=\{phase === "won" \? "ts-won" : "ts-over"\}/);
  assert.match(page, /retryTestId=\{phase === "won" \? "button-tsunami-retry-won" : "button-tsunami-retry"\}/);
  assert.match(page, /startTestId="button-tsunami-start"/);
  assert.match(page, /startLabel=\{`Indítás: /, "a felirat az e2e-regexekhez „Indítás:”-sal kezdődik");
});

// SPEC-VÁLTOZÁS 2026-11-17 (D-J1a-8): a kérdés-sáv saját szünetgombja (`pauseTestId`) a régi testid-del; a kvíz-fázis
// megszűnt, a szünet a játék („play”) alatt bármikor kérhető — kérdés közben is.
test("review #426: a kérdés-sávon is van szünetgomb", () => {
  assert.match(page, /pauseTestId="ts-quiz-pause"\s+onPause=\{pauseGame\}/);
  assert.match(page, /const pauseGame = useCallback\(\(\) => \{\s*if \(phase !== "play"\) return;/, "játék közben (kérdés alatt is) szüneteltethető");
});

// SPEC-VÁLTOZÁS 2026-11-17 (D-J1a-8): a helyes válasz utáni késleltetett folytatás (setTimeout) megszűnt — a kérdés nem
// állítja meg a játékot. A követelmény (kilépés / újrakezdés után az elhagyott kör semmit nem indíthat) a képkocka-hurokra
// vonatkozik: minden indítás / kilépés új futás-azonosító, és a hurok a saját futásához kötött.
test("review #426: kilépés és újrakezdés után az elhagyott kör képkockája semmit nem indít", () => {
  assert.doesNotMatch(page, /continueTimerRef/, "a régi késleltetett folytatás maradt");
  for (const fn of [/const exitToMenu = useCallback\(\(\) =>/, /const startGame = useCallback\(\(\) =>/]) {
    const body = functionBody(page, fn);
    assert.match(body, /runIdRef\.current \+= 1;/, `${fn}: nem lép új futás-azonosítóra`);
  }
  assert.match(functionBody(page, /const exitToMenu = useCallback\(\(\) =>/), /qRef\.current\.finish\(\);/, "kilépéskor a nyitott kérdés lezárul");
  assert.match(page, /if \(phaseNowRef\.current !== "play" \|\| runIdRef\.current !== runId\) return;/);
  // Review #483: a szünetmenü „Újrakezdés”-e a „play” fázisban marad — a hurok effektje a menet kulcsán is újraindul.
  assert.match(functionBody(page, /const startGame = useCallback\(\(\) =>/), /setRunKey\(\(k\) => k \+ 1\);/);
  assert.match(page, /\}, \[phase, onEvent, runKey\]\);/, "a képkocka-hurok effektje a menet kulcsától is függ");
});

test("review #426: elavult képkocka / hívás nem válthat fázist (szinkron fázis-tükör)", () => {
  // Minden fázis- és szünetváltás a szinkron tükröt is írja: a nyers setter csak a goPhase / goPaused törzsében áll.
  assert.equal((page.match(/\bsetPhase\(/g) ?? []).length, 1, "nyers setPhase( a goPhase-en kívül");
  assert.equal((page.match(/\bsetPaused\(/g) ?? []).length, 1, "nyers setPaused( a goPaused-on kívül");
  // SPEC-VÁLTOZÁS 2026-11-17 (D-J1a-8): a hurok neve `tick` (`requestGameFrame`-mel, #477); a szinkron tükröt olvassa.
  const loop = functionBody(page, /const tick = \(now: number\) =>/);
  assert.match(loop, /if \(phaseNowRef\.current !== "play" \|\| runIdRef\.current !== runId\) return;/, "a képkocka a régi zárlattal futhatna tovább");
  assert.match(loop, /const isPaused = pausedNowRef\.current/, "a szünetet a szinkron tükörből olvassa");
});

test("játék közben nincs 12 px alatti fix betűméret a lapon", () => {
  assert.doesNotMatch(page, /text-\[(?:9|10|11)px\]/);
});

/*
 * A régi ág (`recent.slice(-4)`) egy 20+ kérdéses futásban biztosan ismételt. A teljes futásra érvényes szűrő
 * szabálya (terv 4.6/1, no-repeat.ts): amíg a három szinten van nem látott kérdés, ismétlés nincs — tehát
 * N húzásból min(N, összes) különböző azonosító jön.
 */
test("szimuláció: a valós tárgy-bankokon egy futásban nincs ismétlés, amíg van nem látott kérdés", () => {
  let seed = 7;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  for (const [subject, pools] of Object.entries(TSUNAMI_SUBJECT_QUIZ_BANKS)) {
    const tiers = [pools.easy, pools.med, pools.hard];
    const total = new Set(tiers.flat().map((q) => q.id)).size;
    const draws = Math.min(40, total);
    const seen: SeenItem[] = [];
    for (let i = 0; i < draws; i++) {
      const preferred = i < draws / 3 ? 0 : i < (2 * draws) / 3 ? 1 : 2;
      const q = pickUnseen(tiers, preferred, seen, rng);
      assert.ok(q, `${subject}: nincs kérdés`);
      seen.push({ id: q.id, prompt: q.prompt });
    }
    assert.equal(new Set(seen.map((s) => s.id)).size, draws, `${subject}: ismétlés ${draws} húzáson belül`);
  }
});

/*
 * Kereszt-szeletes hiba (Brain Rot PR, Codex): ha a szóbank egy `pickGradeQuiz` által MÁR KIVÁLASZTOTT angol
 * tételt vált ki, és azt nem jelölik látottnak, a választó örökké ugyanazt az angol tételt húzza → a játék csak
 * angolt kérdez, a többi tantárgy és sáv nem kerül sorra. A Szökőárnál a szóbank-ág a `pickGradeQuiz` ELŐTT áll:
 * angol helyen a banktétel ki sem választódik, így nincs eldobott választás. Az őr ezt a szerkezetet rögzíti, a
 * szimuláció pedig a lap ciklusának tükrével méri, hogy a tantárgyak aránya és a sávok bejárása nem torzul.
 */
test("szóbank-kiváltás: a ciklusban nincs eldobott pickGradeQuiz-választás", () => {
  const pick = functionBody(page, PICK_QUIZ);
  const loop = functionBody(pick, /for \(let i = 0; i < subjects\.length; i\+\+\)\s*\{/);
  const bank = loop.search(/vocabRef\.current\.next\(/);
  const grade = loop.indexOf("pickGradeQuiz(");
  assert.ok(bank >= 0 && grade > bank, "a szóbank-ág a pickGradeQuiz ELŐTT legyen (különben a kiváltott tétel elvész)");
  assert.equal((loop.match(/pickGradeQuiz\(/g) ?? []).length, 1, "egyetlen pickGradeQuiz-hívás a ciklusban");
  assert.match(loop, /if \(!item\) continue;\s*return issue\(/, "a kiválasztott évfolyam-tétel mindig kiadódik (és az issue jelöli látottnak)");
  assert.match(pick, /markGradeQuizSeen\(gradeSeenRef\.current, q\)/, "minden kiadott kérdés látottnak jelölődik");
});

test("szimuláció: vegyes módban a szóbank mellett is egyenletes a tantárgyarány, és minden sáv sorra kerül", () => {
  let seed = 11;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const subjects: GradeSubject[] = ["english", "math", "hungarian", "science"];
  for (const vocabOn of [true, false]) {
    const seen = createGradeQuizSeen();
    let round = 0;
    let vocabN = 0;
    const counts: Record<string, number> = {};
    const tiersBySubject: Record<string, Set<number>> = {};
    const ids = new Set<string>();
    const total = 80;
    for (let n = 0; n < total; n++) {
      // A menet előrehaladtával emelkedő sáv (0 → 1), mint a játék adaptív sávja.
      const band = n / (total - 1);
      // A lap ciklusának tükre (TsunamiEscapeEnglish.tsx pickQuiz, évfolyam-ág).
      for (let i = 0; i < subjects.length; i++) {
        const subject = subjects[round++ % subjects.length]!;
        if (subject === "english" && vocabOn) {
          vocabN++;
          counts.english = (counts.english ?? 0) + 1;
          break;
        }
        const item = pickGradeQuiz({ grade: 5, band, subjects: [subject], seen, rng });
        if (!item) continue;
        markGradeQuizSeen(seen, item);
        assert.ok(!ids.has(item.id), `ismétlődő évfolyam-tétel: ${item.id}`);
        ids.add(item.id);
        counts[subject] = (counts[subject] ?? 0) + 1;
        (tiersBySubject[subject] ??= new Set()).add(item.tier);
        break;
      }
    }
    // Körforgás: négy tantárgy → mindegyikre a húzások negyede (80 / 4 = 20).
    for (const s of subjects) assert.equal(counts[s], total / 4, `${vocabOn ? "szóbankkal" : "szóbank nélkül"}: ${s} aránya torzult`);
    if (vocabOn) assert.equal(vocabN, total / 4);
    // A sáv 0 → 1 emelkedésével a nem angol tantárgyak mindhárom nehézségi szintje sorra kerül.
    for (const s of ["math", "hungarian", "science"]) {
      assert.deepEqual([...(tiersBySubject[s] ?? [])].sort(), [1, 2, 3], `${s}: nem minden sáv került sorra`);
    }
  }
});
