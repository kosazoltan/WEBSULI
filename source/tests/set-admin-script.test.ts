/**
 * docs/specs/2026-11-16-valodi-cimek-ki.md (V2): a `server/scripts/setAdmin.ts` a címet KÖTELEZŐ argumentumként kapja —
 * beégetett cím / név nincs; argumentum nélkül vagy hibás címmel érthető hibával kilép, mielőtt adatbázishoz nyúlna.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = "server/scripts/setAdmin.ts";

function runScript(args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", SCRIPT, ...args], {
    cwd: SOURCE,
    encoding: "utf8",
    timeout: 60_000,
    // Elérhetetlen adatbázis: ha a szkript mégis lekérdezne, nem 1-es „Használat” kimenettel állna le.
    env: { ...process.env, DATABASE_URL: "postgresql://nobody:nobody@127.0.0.1:1/none", LOG_LEVEL: "debug" },
  });
}

describe("setAdmin szkript — kötelező cím-argumentum", () => {
  it("argumentum nélkül / hibás címmel: exit 1, használati üzenet", () => {
    for (const args of [[], [""], ["nincs-kukac"], ["mailto:tulaj@pelda.hu"], ["a@b"]]) {
      const r = runScript(args);
      assert.equal(r.status, 1, `${JSON.stringify(args)}: ${r.stderr}`);
      assert.match(`${r.stdout}${r.stderr}`, /Használat: node --import tsx server\/scripts\/setAdmin\.ts <email>/, JSON.stringify(args));
    }
  });

  it("a forrásban nincs beégetett e-mail-cím és személynév", () => {
    const src = readFileSync(fileURLToPath(new URL(`../${SCRIPT}`, import.meta.url)), "utf8");
    assert.doesNotMatch(src, /['"`][^'"`\s]+@[^'"`\s]+\.[a-z]{2,}['"`]/i, "sztringliterálban e-mail-cím");
    assert.doesNotMatch(src, /first_name|last_name/, "beégetett név (az új sor nevét a Google-belépés tölti ki)");
    assert.match(src, /const email = normalizeAdminEmail\(process\.argv\[2\]\);/);
  });
});
