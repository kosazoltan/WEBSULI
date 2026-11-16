/**
 * JM0 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md, JM0; terv JM-A1, JM-A2): adatvédelmi őrök.
 * Más játékosnak sosem látszhat a gyerek valódi neve vagy e-mail-címe (ranglista-válasz, napló).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { displayHandle } from "../server/lib/display-handle";
import { maskEmail } from "../server/lib/mask-email";
import { ScoreRunDedup } from "../server/lib/score-run-dedup";
import { toLeaderboardEntries } from "../server/lib/leaderboard-entries";

const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "server");

const OPERATOR_CLI_TOOLS = new Set(["create-admin.ts", "scripts/importWithRemap.ts"]);

function serverFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return serverFiles(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

/** Megjegyzések nélküli forrás (a megjegyzésben szereplő példák ne adjanak téves találatot). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** A logger.* hívások szövege a hívás elejétől a záró `);`-ig. */
function loggerStatements(source: string): string[] {
  const code = stripComments(source);
  const out: string[] = [];
  const start = /logger\.(?:debug|info|warn|error)\(/g;
  let m: RegExpExecArray | null;
  while ((m = start.exec(code))) {
    const end = code.indexOf(");", m.index);
    out.push(code.slice(m.index, end === -1 ? undefined : end + 2));
  }
  return out;
}

describe("JM0 — ranglista: a valódi név és e-mail nem kerül a válaszba", () => {
  const REAL_NAMES = ["Kovács", "Anna", "Szabó", "Béla"];
  const EMAIL_PATTERN = /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i;

  it("a ranglista-lekérdezés nem kér firstName / lastName / email mezőt, és nem köti a users táblát", () => {
    const source = stripComments(readFileSync(join(SERVER_DIR, "gameScoreService.ts"), "utf8"));
    const start = source.indexOf("export async function getLeaderboard");
    const end = source.indexOf("export async function submitGameScore");
    assert.ok(start > 0 && end > start, "getLeaderboard blokk megtalálva");
    const block = source.slice(start, end);
    assert.doesNotMatch(block, /firstName|lastName|users\.|\.email|innerJoin/);
  });

  it("a ranglista-sorok válaszában nincs valódi név- vagy e-mail-minta, akkor sem, ha a forrássor szélesebb", () => {
    // A „szélesebb sor” azt a hibát modellezi, amikor egy select * vagy egy új mező valódi nevet is hoz.
    const wideRows = [
      { userId: "u-1", bestRunXp: 900, bestStreak: 12, bestRunSeconds: 100, firstName: "Anna", lastName: "Kovács", email: "anna.kovacs@example.com" },
      { userId: "u-2", bestRunXp: 800, bestStreak: 9, bestRunSeconds: 90, firstName: "Béla", lastName: "Szabó", email: "bela@iskola.hu" },
    ];
    const body = JSON.stringify(toLeaderboardEntries(wideRows));
    for (const name of REAL_NAMES) assert.ok(!body.includes(name), `a válasz nem tartalmazhatja: ${name}`);
    assert.doesNotMatch(body, EMAIL_PATTERN);
    assert.doesNotMatch(body, /firstName|lastName|email|userId/);
    const entries = toLeaderboardEntries(wideRows);
    for (const e of entries) assert.match(e.displayName, /^Játékos #\d{4}$/);
    assert.deepEqual(Object.keys(entries[0]!).sort(), ["bestRunSeconds", "bestRunXp", "bestStreak", "displayName", "rank"]);
  });

  it("displayHandle: stabil, a titokhoz kötött, formátuma Játékos #xxxx", () => {
    const env = { SESSION_SECRET: "teszt-titok-1" } as NodeJS.ProcessEnv;
    const other = { SESSION_SECRET: "teszt-titok-2" } as NodeJS.ProcessEnv;
    assert.match(displayHandle("user-1", env), /^Játékos #\d{4}$/);
    assert.equal(displayHandle("user-1", env), displayHandle("user-1", env));
    // 10 000 lehetséges érték: 40 azonosítóra a két kulcs eredménye nem lehet végig azonos.
    const ids = Array.from({ length: 40 }, (_, i) => `user-${i}`);
    assert.ok(ids.some((id) => displayHandle(id, env) !== displayHandle(id, other)));
    assert.ok(new Set(ids.map((id) => displayHandle(id, env))).size > 30);
  });
});

describe("JM0 — e-mail a naplókban", () => {
  it("maskEmail: a cím nem fejthető vissza, hibás bemenet nem szivárog", () => {
    assert.equal(maskEmail("anna@example.com"), "a***@e***.com");
    assert.equal(maskEmail("  Zoli.Kosa@iskola.edu.hu "), "Z***@i***.hu");
    assert.equal(maskEmail("nincs-kukac"), "***");
    assert.equal(maskEmail("@example.com"), "***");
    assert.equal(maskEmail("anna@"), "***");
    assert.equal(maskEmail(undefined), "***");
    assert.equal(maskEmail(null), "***");
    assert.equal(maskEmail(42), "***");
    assert.doesNotMatch(maskEmail("anna@example.com"), /anna|example/);
  });

  it("a server/ alatt nincs maszkolatlan e-mailt naplózó logger-hívás (spec-minta: email} / ${email)", () => {
    const offenders: string[] = [];
    for (const file of serverFiles(SERVER_DIR)) {
      // Üzemeltetői parancssori eszközök (nem a webszerver naplója): külön szelet / ORKESZTRÁTOR-KÉRÉS tárgya.
      if (OPERATOR_CLI_TOOLS.has(relative(SERVER_DIR, file).replaceAll("\\", "/"))) continue;
      for (const stmt of loggerStatements(readFileSync(file, "utf8"))) {
        if (/\$\{\s*email\b|\bemail\}|\bemail\.trim\(\)\}/.test(stmt) && !/maskEmail\(/.test(stmt)) {
          offenders.push(`${relative(SERVER_DIR, file)}: ${stmt.split("\n")[0]}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("auth.ts és routes.ts: egyetlen naplósor sem ír címet maszkolás nélkül (szigorúbb, kis-nagybetűtől független minta)", () => {
    const offenders: string[] = [];
    for (const name of ["auth.ts", "routes.ts"]) {
      for (const stmt of loggerStatements(readFileSync(join(SERVER_DIR, name), "utf8"))) {
        const inTemplate = /\$\{(?![^}]*maskEmail\()[^}]*\b(?:email|userEmail|recipientEmail)\b[^}]*\}/.test(stmt);
        const asArgument = /(?:,|(?<!maskEmail)\()\s*(?:[\w.]*\.)?(?:email|userEmail|recipientEmail)\s*[,)]/.test(stmt);
        const googleValue = /profile\.emails/.test(stmt) && !/maskEmail\(/.test(stmt);
        if (inTemplate || asArgument || googleValue) offenders.push(`${name}: ${stmt.split("\n")[0]}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe("JM0 — ScoreRunDedup (runId-dedup)", () => {
  it("azonos kulcs + azonos tartalom: egyszer ír, a második ugyanazt az eredményt kapja", async () => {
    const dedup = new ScoreRunDedup<{ n: number }>();
    let writes = 0;
    const write = async () => ({ n: ++writes });
    const first = await dedup.run("u|r1", "fp", write);
    const second = await dedup.run("u|r1", "fp", write);
    assert.deepEqual(first, { kind: "created", value: { n: 1 } });
    assert.deepEqual(second, { kind: "duplicate", value: { n: 1 } });
    assert.equal(writes, 1);
  });

  it("párhuzamos azonos küldés is csak egy írás", async () => {
    const dedup = new ScoreRunDedup<number>();
    let writes = 0;
    const write = async () => {
      await new Promise((r) => setTimeout(r, 10));
      return ++writes;
    };
    const [a, b] = await Promise.all([dedup.run("u|r", "fp", write), dedup.run("u|r", "fp", write)]);
    assert.equal(writes, 1);
    assert.deepEqual([a.kind, b.kind].sort(), ["created", "duplicate"]);
  });

  it("azonos kulcs, eltérő tartalom: conflict, nincs új írás", async () => {
    const dedup = new ScoreRunDedup<number>();
    let writes = 0;
    await dedup.run("u|r", "fp-1", async () => ++writes);
    const second = await dedup.run("u|r", "fp-2", async () => ++writes);
    assert.deepEqual(second, { kind: "conflict" });
    assert.equal(writes, 1);
  });

  it("sikertelen írás után a kulcs újrapróbálható", async () => {
    const dedup = new ScoreRunDedup<number>();
    await assert.rejects(dedup.run("u|r", "fp", async () => { throw new Error("db"); }), /db/);
    const retry = await dedup.run("u|r", "fp", async () => 7);
    assert.deepEqual(retry, { kind: "created", value: 7 });
  });

  it("a másik felhasználó azonos runId-je független (a hívó a kulcsba teszi a userId-t)", async () => {
    const dedup = new ScoreRunDedup<number>();
    const a = await dedup.run("u1|r", "fp", async () => 1);
    const b = await dedup.run("u2|r", "fp", async () => 2);
    assert.equal(a.kind, "created");
    assert.equal(b.kind, "created");
  });

  it("TTL után a kulcs lejár; a méret a korlát alatt marad", async () => {
    const dedup = new ScoreRunDedup<number>(1000, 3);
    await dedup.run("k1", "fp", async () => 1, 0);
    const later = await dedup.run("k1", "fp", async () => 2, 1500);
    assert.deepEqual(later, { kind: "created", value: 2 });
    for (let i = 0; i < 10; i++) await dedup.run(`n${i}`, "fp", async () => i, 1600 + i);
    assert.ok(dedup.size <= 3, `méret: ${dedup.size}`);
  });
});

describe("JM0 — a hét játék kliense menetenként runId-t küld", () => {
  const PAGES_DIR = join(SERVER_DIR, "..", "client", "src", "pages");
  const GAMES = ["BlockCraftQuiz", "TsunamiEscapeEnglish", "SpaceAsteroidQuiz", "SpeedQuizMath", "BrainRotSteal", "TornadoHunter200", "WordLadderHuEn"];
  for (const game of GAMES) {
    it(`${game}: a /api/games/score hívás runId: newScoreRunId()-t tartalmaz`, () => {
      const source = stripComments(readFileSync(join(PAGES_DIR, `${game}.tsx`), "utf8"));
      assert.match(source, /import \{ newScoreRunId \} from "@\/lib\/gameScoreRunId";/);
      assert.match(source, /\/api\/games\/score/);
      assert.match(source, /runId: newScoreRunId\(\)/);
    });
  }
});
