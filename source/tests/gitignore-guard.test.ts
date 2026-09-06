import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * #185 — a 956 MB-os árva Claude-worktree csak a LOKÁLIS .git/info/exclude-ban
 * volt ignorálva, ezért másik gépen újra felhalmozódott volna; a szabály a
 * megosztott .gitignore-ba került. A .gitignore-t elolvasni nem elég: azt kell
 * mérni, hogy a git TÉNYLEG ignorálja-e az útvonalat — és hogy nem lő-e túl.
 *
 * `git check-ignore` nem igényli a fájl létezését, így nem szemetelünk a fába.
 */

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * true, ha VERZIÓKÖVETETT (megosztott) ignore-szabály fedi az útvonalat.
 *
 * Mérve (#185) két lépésben:
 *  1. A puszta `git check-ignore` HAZUG kapu — a lokális, nem verziókövetett
 *     `.git/info/exclude` is illeszkedhet, és elfedi, ha a szabály kimaradt a
 *     commitolt .gitignore-ból (a `.claude/worktrees/` mutáció épp ezért élte túl).
 *  2. Csak a gyökér-.gitignore-t elfogadni viszont túl szűk: a repóban
 *     `source/.gitignore` is van (playwright-report), az szintén megosztott.
 *
 * Ezért a szabály FORRÁSFÁJLJÁT nézzük: bármely `.gitignore` jó, a
 * `.git/info/exclude` nem. A negált szabály (`!.env.example`) szintén
 * `.gitignore:`-ként jön vissza, pedig épp azt jelenti, hogy NEM ignorált —
 * ezért a mintát is meg kell nézni, nem csak a forrást (mérve #185).
 */
function ignored(path: string): boolean {
  try {
    // Alak: "<forrás>:<sor>:<minta>\t<útvonal>"
    const [source, , pattern = ""] = execFileSync(
      "git",
      ["check-ignore", "-v", "--no-index", path],
      { cwd: ROOT, encoding: "utf8" },
    ).split(":", 3);
    return /(^|[/\\])\.gitignore$/.test(source) && !pattern.startsWith("!");
  } catch {
    return false;
  }
}

test("a repo-hízlaló útvonalak ignoráltak (#185)", () => {
  for (const p of [
    ".claude/worktrees/barmi/x.txt", // 956 MB árva worktree
    ".agents/skills/x/__pycache__/y.pyc",
    "tmp/barmi.json",
    "source/dist/index.js",
    "source/test-results/x.png",
    "source/playwright-report/index.html",
    "source/backups/backup_2026-01-01T00-00-00_scheduled.json",
    "source/node_modules/x/index.js",
  ]) {
    assert.ok(ignored(p), `ignorálandó, de követett: ${p}`);
  }
});

test("a titok-mintázatok ignoráltak (#185)", () => {
  for (const p of [
    "client_secret_barmi.json",
    "source/.env",
    ".env",
    ".env.hetzner", // a Hetzner-hozzáférés: sosem kerülhet a repóba
    "configs/secrets.json",
  ]) {
    assert.ok(ignored(p), `titok, de követett: ${p}`);
  }
});

test("a példa-env fájlok NEM ignoráltak (a negált szabály él, #185)", () => {
  for (const p of [".env.example", ".env.local.example"]) {
    assert.ok(!ignored(p), `példafájlnak követettnek kell lennie: ${p}`);
  }
});

test("az ignore nem lő túl: a forrás és a doksi követett marad (#185)", () => {
  for (const p of [
    "source/server/index.ts",
    "source/client/src/pages/admin.tsx",
    "source/tests/memory-index-guard.test.ts",
    "memory/indexes/index.yml",
    "docs/archive/memory-dead-vps-20260906/procedural__deploy__readme-vps.md",
    "RUNBOOK.md",
  ]) {
    assert.ok(!ignored(p), `követendő, de ignorált: ${p}`);
  }
});
