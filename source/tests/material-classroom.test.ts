import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://unit:unit@127.0.0.1:1/unit_never_connects";
const { MATERIAL_ID_PATTERN, MaterialClassroomError, normalizeMaterialIds } = await import("../server/material-classroom");

// docs/specs/2026-11-16-tananyag-evfolyam-modositas.md

test("normalizeMaterialIds: trim, üres kiszűrve, ismétlődés nélkül, sorrendtartó", () => {
  assert.deepEqual(normalizeMaterialIds([" a ", "b", "a", "", "  ", "c"]), ["a", "b", "c"]);
  assert.deepEqual(normalizeMaterialIds([]), []);
});

test("MATERIAL_ID_PATTERN: a meglévő azonosító-formák (UUID, régi) igen, minden más nem", () => {
  for (const ok of ["15d4b54d-a256-4d6a-b42f-fa8e1e28c8f9", "p0zzBVSIV-xty-XWGB2ZC", "e2e-seed-material-0001", "a"]) assert.ok(MATERIAL_ID_PATTERN.test(ok), ok);
  for (const bad of ["", "../x", "a b", "a/b", "x".repeat(65), "ő", "a;drop"]) assert.ok(!MATERIAL_ID_PATTERN.test(bad), bad);
});

test("MaterialClassroomError a HTTP-státuszt hordozza", () => {
  const e = new MaterialClassroomError("nincs", 404);
  assert.equal(e.status, 404);
  assert.ok(e instanceof Error);
});
