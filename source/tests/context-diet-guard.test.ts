import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Kontextus-diéta (tulajdonosi kérés 2026-11-28, docs/specs/2026-11-28-kontextus-dieta.md): a mindig betöltődő vezérlőfájl és a
 * skillek mérete korlátos, és minden Claude-skill hivatkozik a „Felejthető lépés = szkript” szabályra. A méret LF-normalizált
 * UTF-8 bájt (a git így tárolja). Túllépésnél az előzményt / indoklást költöztesd docs/-ba vagy a skill references/ mappájába.
 */

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const CONTROL_LIMIT = 12 * 1024;
const SKILL_LIMIT = 15 * 1024;
const RULE_LINE =
  "> Felejthető lépés = szkript, automatikusan: ismétlődő kézi lépést szkriptbe + hookba/kapuba kötni; a futás végét a Stop hook (`loop.mjs auto` + `check`) zárja — lásd ~/.claude/CLAUDE.md.";

const bytes = (path: string) => Buffer.byteLength(readFileSync(path, "utf8").replace(/\r\n/g, "\n"), "utf8");
const skillFiles = (dir: string) =>
  existsSync(join(ROOT, dir))
    ? readdirSync(join(ROOT, dir))
        .map((name) => `${dir}/${name}/SKILL.md`)
        .filter((rel) => existsSync(join(ROOT, rel)))
    : [];

test("kontextus-diéta: a vezérlőfájlok legfeljebb 12 KB-osak", () => {
  for (const rel of ["AGENTS.md", "CLAUDE.md"]) {
    if (!existsSync(join(ROOT, rel))) continue;
    const size = bytes(join(ROOT, rel));
    assert.ok(size <= CONTROL_LIMIT, `${rel}: ${size} bájt > ${CONTROL_LIMIT} — előzményt / indoklást docs/-ba, mutatóval`);
  }
});

test("kontextus-diéta: minden SKILL.md legfeljebb 15 KB-os", () => {
  const files = [".agents/skills", ".claude/skills", ".hermes/skills"].flatMap(skillFiles);
  assert.ok(files.length > 0, "előfeltétel: van vizsgált skill");
  for (const rel of files) {
    const size = bytes(join(ROOT, rel));
    assert.ok(size <= SKILL_LIMIT, `${rel}: ${size} bájt > ${SKILL_LIMIT} — a részleteket a skill references/ mappájába`);
  }
});

test("kontextus-diéta: minden Claude-skill a frontmatter után hivatkozik a „Felejthető lépés = szkript” szabályra", () => {
  const files = [".agents/skills", ".claude/skills"].flatMap(skillFiles);
  assert.ok(files.length > 0, "előfeltétel: van vizsgált skill");
  for (const rel of files) {
    const text = readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
    const fm = /^---\n[\s\S]*?\n---\n/.exec(text);
    assert.ok(fm, `${rel}: hiányzik a frontmatter`);
    const firstBodyLine = text.slice(fm[0].length).split("\n").find((line) => line.trim() !== "");
    assert.equal(firstBodyLine, RULE_LINE, `${rel}: a frontmatter utáni első sor nem a hivatkozó sor`);
  }
});
