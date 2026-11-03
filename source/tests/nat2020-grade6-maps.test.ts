import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { knowledgeMapSchema } from "../shared/knowledge-map-schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mapsDir = path.join(root, "docs/knowledge/nat2020-6/maps");
const extractsDir = path.join(root, "docs/knowledge/nat2020-6/extracts");

test("NAT 2020 6. évfolyam térképei sémások, 6. osztályosak, idézetük a kivonatban van", () => {
  const files = fs.readdirSync(mapsDir).filter((name) => name.endsWith(".json"));
  assert.ok(files.length >= 6, `legalább 6 térkép kell, van: ${files.length}`);
  for (const name of files) {
    const raw = JSON.parse(fs.readFileSync(path.join(mapsDir, name), "utf8"));
    const parsed = knowledgeMapSchema.safeParse(raw);
    assert.equal(parsed.success, true, `${name}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`);
    if (!parsed.success) continue;
    const map = parsed.data;
    assert.equal(map.classroom, 6, name);
    assert.ok(map.concepts.length >= 5, `${name} fogalmak: ${map.concepts.length}`);
    const extracts = new Map(
      map.sourceFiles.map((file) => {
        const extractName = file.name.endsWith(".txt") ? file.name : file.name.replace(/\.docx$/i, ".grade6.txt");
        const text = fs.readFileSync(path.join(extractsDir, extractName), "utf8");
        return [file.name, text];
      }),
    );
    for (const concept of map.concepts) {
      const sourceName = concept.sourceRef.file;
      const text = extracts.get(sourceName) ?? fs.readFileSync(path.join(extractsDir, sourceName), "utf8");
      assert.ok(text.includes(concept.quote), `${name}/${concept.id} idézet hiányzik a kivonatból`);
    }
  }
});
