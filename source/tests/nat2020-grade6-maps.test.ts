import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { knowledgeMapSchema } from "../shared/knowledge-map-schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mapsDir = path.join(root, "docs/knowledge/nat2020-6/maps");
const extractsDir = path.join(root, "docs/knowledge/nat2020-6/extracts");

// The delivered set — an interrupted or partial delivery must not pass (review #391).
const EXPECTED_MAPS = [
  "Digitalis_kultura_F.json",
  "Etika_F.json",
  "Magyar_nyelv_es_irodalom_F.json",
  "Matematika_F.json",
  "OH-MAT06TA_matematika_6_tanmenet.json",
  "Termeszettudomany_5_6.json",
  "Tortenelem_F.json",
  "elo_idegen_nyelv_F_egyben.json",
];
const EXTRACT_NAME = /^[A-Za-z0-9_-]+(?:_[0-9]+)*\.grade6\.txt$/;
const norm = (text: string) => text.replace(/\s+/g, " ").trim();

function readExtract(name: string): string {
  assert.match(name, EXTRACT_NAME, `nem kivonat-fájlnév: ${name}`);
  const file = path.resolve(extractsDir, name);
  assert.equal(path.dirname(file), extractsDir, `a kivonat a mappán kívülre mutat: ${name}`);
  // Git stores LF; a Windows checkout may have CRLF — quotes are compared line-ending independently.
  return fs.readFileSync(file, "utf8").replace(/\r\n?/g, "\n");
}

test("NAT 2020 6. évfolyam: a várt térképek, sémásak, 6. osztályosak, ≥ 5 fogalom", () => {
  const files = fs.readdirSync(mapsDir).filter((name) => name.endsWith(".json")).sort();
  assert.deepEqual(files, [...EXPECTED_MAPS].sort());
  for (const name of files) {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(mapsDir, name), "utf8"));
    const parsed = knowledgeMapSchema.safeParse(raw);
    assert.equal(parsed.success, true, `${name}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
    if (!parsed.success) continue;
    assert.equal(parsed.data.classroom, 6, name);
    assert.ok(parsed.data.concepts.length >= 5, `${name} fogalmak: ${parsed.data.concepts.length}`);
  }
});

test("NAT 2020 6. évfolyam: minden idézet a deklarált kivonat szó szerinti szelete, és alátámasztja a definíciót", () => {
  for (const name of EXPECTED_MAPS) {
    const raw: unknown = JSON.parse(fs.readFileSync(path.join(mapsDir, name), "utf8"));
    const map = knowledgeMapSchema.parse(raw);
    // Only declared sources are readable — Studio's verification resolves declared files only (review #391).
    const extracts = new Map(map.sourceFiles.map((file) => [file.name, readExtract(file.name)]));
    for (const concept of map.concepts) {
      const label = `${name}/${concept.id}`;
      const text = extracts.get(concept.sourceRef.file);
      assert.ok(text !== undefined, `${label}: a forrás (${concept.sourceRef.file}) nincs a sourceFiles között`);
      assert.ok(text.includes(concept.quote.replace(/\r\n?/g, "\n")), `${label}: az idézet nincs a kivonatban`);
      assert.ok(norm(concept.quote).includes(norm(concept.definition)), `${label}: a definíciót nem támasztja alá az idézet`);
    }
  }
});

test("NAT 2020 6. évfolyam: a tanmenet-térkép minden témakört lefed (a TÖRTEK is)", () => {
  const raw: unknown = JSON.parse(fs.readFileSync(path.join(mapsDir, "OH-MAT06TA_matematika_6_tanmenet.json"), "utf8"));
  const headings = knowledgeMapSchema.parse(raw).concepts.map((concept) => concept.quote.split(/\r?\n/)[0].trim());
  for (const topic of ["EGÉSZ SZÁMOK, OSZTHATÓSÁG", "TÖRTEK", "GEOMETRIA, TENGELYES TÜKRÖZÉS", "ARÁNY, SZÁZALÉK, SZÖVEGES FELADATOK",
    "KERÜLET, TERÜLET, FELSZÍN, TÉRFOGAT", "STATISZTIKA", "ÉV VÉGI ISMÉTLÉS"]) {
    assert.ok(headings.includes(topic), `hiányzó témakör: ${topic}`);
  }
});

test("NAT 2020 6. évfolyam: a kivonatban nincs 7–8. évfolyamos blokk", () => {
  for (const name of fs.readdirSync(extractsDir)) {
    assert.doesNotMatch(readExtract(name), /A 7–8\. évfolyam tananyaga/, name);
  }
});

test("NAT 2020 6. évfolyam: a kivonat-útvonal nem léphet ki a mappából", () => {
  assert.throws(() => readExtract("../maps/Etika_F.json"));
  assert.throws(() => readExtract("..\\..\\SOURCE.md"));
});
