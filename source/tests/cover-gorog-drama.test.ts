import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pickLessonArt } from "../shared/design-assets";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";

// docs/specs/2026-11-02-irodalmi-borito.md — a 9–10. sáv görög drámás leckéje a saját borítóját kapja a sáv koncepcióképe helyett.

const LIT = "Magyar nyelv és irodalom";

test("az Antigoné-lecke (9–10. sáv) a görög dráma borítót kapja", () => {
  const art = pickLessonArt({ subject: LIT, title: "Szophoklész: Antigoné" }, "laboratory", DESIGN_ASSET_CATALOG);
  assert.equal(art.cover?.id, "cover-gorog-drama");
  assert.equal(art.hero, undefined);
  assert.ok(existsSync(`client/public${art.cover!.src}`));
});

test("az Oidipusz és a „görög dráma” cím is ezt kapja; más sáv, más tantárgy, más mű nem", () => {
  for (const title of ["Oidipusz király", "A görög dráma születése"]) {
    assert.equal(pickLessonArt({ subject: LIT, title }, "laboratory", DESIGN_ASSET_CATALOG).cover?.id, "cover-gorog-drama", title);
  }
  assert.notEqual(pickLessonArt({ subject: LIT, title: "Antigoné" }, "studio", DESIGN_ASSET_CATALOG).cover?.id, "cover-gorog-drama", "más sáv");
  assert.notEqual(pickLessonArt({ subject: "Történelem", title: "Antigoné kora" }, "laboratory", DESIGN_ASSET_CATALOG).cover?.id, "cover-gorog-drama", "más tantárgy");
  assert.notEqual(pickLessonArt({ subject: LIT, title: "Az ember tragédiája" }, "laboratory", DESIGN_ASSET_CATALOG).cover?.id, "cover-gorog-drama", "más mű");
});
