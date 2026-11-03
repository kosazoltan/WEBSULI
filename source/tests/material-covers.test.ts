import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { MATERIAL_COVERS, materialCoverId } from "../shared/lesson-cover";

// docs/specs/2026-11-03-leckeborito-utomunka.md — lecke nélküli anyagok kézi borítója; a 4 kicserélt leckeborító.

test("minden leképezett anyag borítója a katalógusban van, és a WebP-fájl létezik; az Abigél HTML és PDF közös képet kap", () => {
  for (const [fileId, coverId] of Object.entries(MATERIAL_COVERS)) {
    assert.equal(materialCoverId(fileId), coverId, fileId);
    const asset = DESIGN_ASSET_CATALOG.find(a => a.id === coverId)!;
    assert.equal(asset.kind, "cover");
    assert.ok(existsSync(`client/public${asset.src}`), asset.src);
  }
  assert.equal(MATERIAL_COVERS["8eca0ab6-571b-4562-a84d-3fc05dceb1e2"], MATERIAL_COVERS["d1cbfb26-577a-4681-a828-86831a5f9886"]);
});

test("ismeretlen anyag vagy katalógusból hiányzó borító: null (a régi viselkedés)", () => {
  assert.equal(materialCoverId("00000000-0000-0000-0000-000000000000"), null);
  assert.equal(materialCoverId("baf280be-54ea-4707-84e4-048b9f089faa", []), null);
  assert.equal(materialCoverId("constructor"), null, "prototípus-kulcs nem találat");
});

test("a 4 kicserélt leckeborító új, tartalomhű leírást kapott", () => {
  const alt = (id: string) => DESIGN_ASSET_CATALOG.find(a => a.id === id)?.alt ?? "";
  assert.match(alt("cover-l-d0228a7b52eb02a1"), /Fehérlófia/);
  assert.match(alt("cover-l-63c4aa9223a9ede0"), /Talajszelvény/);
  assert.match(alt("cover-l-3494830174e1c34b"), /római számjel/);
  assert.match(alt("cover-l-4de4a74b2884ba6d"), /szív/);
});
