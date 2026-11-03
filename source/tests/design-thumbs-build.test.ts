import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
// @ts-expect-error -- .mjs build script without type declarations
import { buildThumbs, thumbFileName } from "../scripts/build-design-thumbs.mjs";
import { thumbUrlFor } from "../server/design-assets";

// Spec 2026-11-03-fooldal-sebesseg: a build készíti a bélyegképet (tartalom-hash a névben, immutable); futásidőben nincs sharp.
test("borító és hős-kép kap bélyegképet tartalom-hash-es névvel; inkrementális; a régi fájl törlődik; ikon nem", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "thumbs-"));
  try {
    const src = path.join(root, "design"), out = path.join(root, "out");
    mkdirSync(path.join(src, "laboratory"), { recursive: true });
    const img = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#336699" } }).webp().toBuffer();
    writeFileSync(path.join(src, "laboratory", "cover-proba.webp"), img);
    writeFileSync(path.join(src, "laboratory", "hero-laboratory.webp"), img);
    writeFileSync(path.join(src, "laboratory", "icon-fizika-laboratory.webp"), img);
    const logs: string[] = [];
    const manifest = await buildThumbs({ srcDir: src, outDir: out, log: (m: string) => logs.push(m) });
    assert.deepEqual(Object.keys(manifest).sort(), ["cover-proba", "hero-laboratory"]);
    assert.equal(manifest["cover-proba"], thumbFileName("cover-proba", img));
    assert.match(manifest["cover-proba"], /^cover-proba\.[0-9a-f]{8}\.webp$/);
    const meta = await sharp(readFileSync(path.join(out, manifest["cover-proba"]))).metadata();
    assert.deepEqual([meta.width, meta.height, meta.format], [480, 320, "webp"]);
    await buildThumbs({ srcDir: src, outDir: out, log: (m: string) => logs.push(m) });
    assert.match(logs.at(-1)!, /új: 0, meglévő: 2/);
    writeFileSync(path.join(src, "laboratory", "cover-proba.webp"), await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#993366" } }).webp().toBuffer());
    const next = await buildThumbs({ srcDir: src, outDir: out, log: () => {} });
    assert.notEqual(next["cover-proba"], manifest["cover-proba"], "új kép = új név");
    assert.ok(!readdirSync(out).includes(manifest["cover-proba"]), "a régi fájl törlődik");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a manifestben lévő kép statikus URL-t kap, a többi a futásidejű végpontot", () => {
  const manifest = { "cover-gorog-drama": "cover-gorog-drama.e1c9cd69.webp" };
  assert.equal(thumbUrlFor("cover-gorog-drama", manifest), "/design-thumbs/cover-gorog-drama.e1c9cd69.webp");
  assert.equal(thumbUrlFor("cover-auto-123", manifest), "/api/design-assets/cover-auto-123/thumb");
});
