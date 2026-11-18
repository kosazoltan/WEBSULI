import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * S12 — Tornado Hunter 200 a közös mobilos keretben (terv 4.5, 4.6/7; végrehajtás S12 „Megírandó teszt”).
 * Forrásőr, kommentek nélkül (#183): a kikommentezett minta nem számít.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const page = stripComments(readFileSync(join(root, "client/src/pages/TornadoHunter200.tsx"), "utf8"));
const questions = stripComments(readFileSync(join(root, "client/src/lib/tornado/questions.ts"), "utf8"));

function block(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `${from} hiányzik`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end > start, `${to} hiányzik ${from} után`);
  return src.slice(start, end);
}

test("érintővezérlés csak érintős eszközön: a <TouchControls hívás a useTouchCapable() eredményéhez kötött", () => {
  const decl = /const\s+(\w+)\s*=\s*useTouchCapable\(\)/.exec(page);
  assert.ok(decl, "nincs useTouchCapable() hívás");
  const name = decl[1]!;
  assert.match(page, new RegExp(`\\{\\s*${name}\\s*&&\\s*\\(?\\s*<TouchControls\\b`), "a <TouchControls nincs a touch-feltétel mögött");
  const calls = page.match(/<TouchControls\b/g) ?? [];
  assert.equal(calls.length, 1, "pontosan egy <TouchControls hívás legyen (feltétel nélküli második ne szivárogjon vissza)");
});

test("gombméret: a lapon nincs h-7 / h-8 osztály, a tárcsa a képernyőhöz méreteződik", () => {
  assert.doesNotMatch(page, /["'`\s]h-[78]["'`\s]/, "28 / 32 px-es elem maradt");
  assert.match(page, /radius="auto"/, "a tárcsa nem a képernyőhöz méreteződik");
  assert.match(page, /game-action-btn/, "a horgony gomb nem a közös akciógomb-méretet kapja");
  assert.match(page, /<AudioToggleButton[^>]*className="h-12 w-12"/, "a hangkapcsoló 44 px maradt");
});

test("olvashatóság: a lapon nincs 8–11 px-es szöveg", () => {
  assert.doesNotMatch(page, /text-\[(?:8|9|10|11)px\]/);
});

test("közös keret: GameShell fekvő tájolással és automatikus szünettel, HUD-szünet, PauseMenu, ResultScreen, StartScreen", () => {
  assert.match(page, /<GameShell\b[\s\S]{0,200}orientation="landscape"/, "a GameShell nem kér fekvő tájolást");
  assert.match(page, /<GameShell\b[\s\S]{0,300}onAutoPause=\{/, "nincs automatikus szünet a háttérbe kerüléskor");
  assert.match(page, /<GameHud\b[\s\S]{0,600}onPause=\{pauseGame\}/, "a HUD szünet gombja nincs bekötve");
  assert.match(page, /<PauseMenu\b[\s\S]{0,200}open=\{paused && !result\}/);
  assert.match(page, /<PauseMenu\b[\s\S]{0,300}exitLabel="Szintek"/);
  assert.match(page, /<ResultScreen\b[\s\S]{0,200}open=\{result != null\}[\s\S]{0,40}testId="th-result"/);
  assert.match(page, /<StartScreen\b[\s\S]{0,300}startLabel="Vadászat indítása"/);
  assert.match(page, /data-testid="tornado-quick-start"/, "nincs egy koppintásos indítás (M8)");
});

test("visszajelzés: rezgés jó / rossz válaszra és befogásra", () => {
  assert.match(page, /const\s+haptics\s*=\s*useHaptics\(\)/);
  for (const kind of ["success", "error", "hit"]) {
    assert.match(page, new RegExp(`haptics\\("${kind}"\\)`), `nincs haptics("${kind}")`);
  }
});

test("elavult időzítők: a fázisváltás játékórán fut, az újrakezdés érvényteleníti a függő időzítőket", () => {
  assert.match(page, /scheduleGame\(advance,\s*750\)/, "a jó válasz utáni továbblépés nem a játékórán fut");
  // SPEC-VÁLTOZÁS 2026-11-17 (docs/specs/2026-11-16-jatekok-jatekelmeny.md 5.7 „Javítás”, J7a): a horgony-fejlesztés
  // a készenléti időt adja — a 2600 ms az alap (`ANCHOR_HOLD_BASE_MS`, `T/tornado-upgrades-effect.test.ts`), a hívás
  // továbbra is játékórán fut és a friss finishRun-t hívja.
  assert.match(page, /scheduleGame\(\(\)\s*=>\s*finishRunRef\.current\(true\),\s*effRef\.current\.anchorHoldMs\)/, "a horgonyzás utáni győzelem nem a játékórán / a friss finishRun-nal fut");
  const finish = block(page, "const finishRun = useCallback(", "const finishRunRef");
  assert.match(
    finish,
    /props\.onProgress\(\(latest\) => applyRunResult\(latest,/,
    "a késleltetett győzelem nem a mentés pillanatában érvényes haladásra épül (review #433)",
  );
  assert.doesNotMatch(page, /scheduleTimeout\(\s*advance\b/);
  assert.doesNotMatch(page, /scheduleTimeout\(\s*\(\)\s*=>\s*finishRun\(/);
  const restart = block(page, "restartRef.current = () => {", "adaptiveRef.current.reset(");
  assert.match(restart, /runIdRef\.current \+= 1/, "az újrakezdés nem vált futás-azonosítót");
  assert.match(restart, /clearPendingTimers\(\)/, "az újrakezdés nem törli a függő időzítőket");
  const step = block(page, "stepRef.current = (dt: number) => {", "const sc = sceneRef.current;");
  assert.match(step, /const halted = pausedRef\.current \|\| rotateBlockRef\.current;/, "a futás-megállítás nem a szünetből / forgatási kérésből számol");
  assert.match(step, /if \(!halted\)/, "a játékóra szünetben is halad");
  assert.match(step, /t\.run === run/, "egy előző futás időzítője is lefuthat");
});

test("review #433: a lap minden haladás-mentése funkcionális frissítés (nincs elavult pillanatképből írás)", () => {
  const calls = [...page.matchAll(/onProgress(?:Ref\.current)?\((.{0,30})/g)].map((m) => m[1]!.trim());
  // SPEC-VÁLTOZÁS 2026-11-18 (docs/specs/2026-11-18-joystick-jobb-kez.md D4, D5): a szünet menü két „Jobbkezes / Balkezes”
  // gombja (2 onProgress-hívás) megszűnt — a joystick oldalát a közös kapcsoló a közös játékbeállításba írja, nem a haladásba.
  // A küszöb a megmaradt hívások száma (a minta-illesztés őre); a „mind funkcionális” állítás változatlanul mindegyikre fut.
  assert.ok(calls.length >= 4, `kevés onProgress-hívás: ${calls.length}`);
  for (const arg of calls) assert.match(arg, /^\(latest\)\s*=>/, `nem funkcionális mentés: onProgress(${arg}…`);
});

test("szünet mindig elérhető: a kvíz-réteg a HUD alatti sávban van, a magyarázó kártya szünetben rejtve", () => {
  const hud = page.indexOf("<GameHud");
  const quiz = page.indexOf('data-testid="tornado-quiz"');
  assert.ok(hud >= 0 && quiz > hud, "a kvíz-réteg nem a HUD után (alatta lévő sávban) áll");
  assert.match(page, /\{feedback && !paused && <QuizFeedbackCard\b/);
});

test("szóbank: a pickQuestion törzsében a tananyag-ág a szóbank-hívás előtt áll", () => {
  const body = block(questions, "export function pickQuestion(", "export function shuffleOptions(");
  const material = body.indexOf("args.material");
  const vocab = body.indexOf("args.vocab?.next(");
  assert.ok(material >= 0, "nincs tananyag-ág");
  assert.ok(vocab >= 0, "nincs szóbank-hívás");
  assert.ok(material < vocab, "a szóbank a tananyag előtt kérdez");
  // SPEC-VÁLTOZÁS 2026-11-15 (docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md S13, orkesztrátori E23): a
  // kiváltott tétel látottnak jelölése a közös `pickGradeSlotWithVocab`-ba költözött (game-engine/gradeQuiz.ts) — a
  // követelmény nem lazul: a Tornado azt hívja, és a közös függvény MINDIG jelöl (a jelölést a brainrot-tuning /
  // space-asteroid-quiz-slot / blockcraft-mobile szimulációs tesztjei mérik, és lent forrásból is ellenőrizzük).
  assert.match(body, /pickGradeSlotWithVocab\(\{/, "a Tornado nem a közös évfolyam-hely választót hívja (E23)");
  const shared = readFileSync(join(root, "client/src/game-engine/gradeQuiz.ts"), "utf8");
  const slotFn = shared.slice(shared.lastIndexOf("export function pickGradeSlotWithVocab"));
  assert.match(slotFn, /if \(item\) markGradeQuizSeen\(args\.seen, item\);/, "a kiváltott évfolyam-banki tétel nincs látottnak jelölve (#424)");
  assert.match(page, /useVocabQuizSource\("en",\s*true\)/);
  assert.match(page, /markExternal\(q\.options\[q\.correctIndex\]!?\)/);
});

test("a komment-szűrő önellenőrzése: kommentben álló minta nem számít", () => {
  const fake = `const a = 1;\n// text-[10px]\n/* h-7 */\n`;
  const stripped = stripComments(fake);
  assert.doesNotMatch(stripped, /text-\[10px\]/);
  assert.doesNotMatch(stripped, /h-7/);
});
