import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonCoverId } from "../shared/lesson-cover";
import { hashWithoutArt, pinnedArt, planPins, verifyPinned, type PinRow } from "../scripts/design-assets/pin-lesson-covers-lib";

// docs/specs/2026-11-03-leckeborito.md — a kézi csere csak az `art.picture`-t írja; minden más bájtra (kanonikusan) változatlan.

const json = (title: string, extra: Record<string, unknown> = {}) => ({ title, subject: "Történelem", classroom: 6, mapId: "m", sections: [{ heading: "H", blocks: [] }], sourceOnly: true, ...extra });
const hunyadi = lessonCoverId({ subject: "Történelem", title: "Hunyadi János, a kormányzó" }, "studio");
const rows: PinRow[] = [
  { id: "a", html_file_id: "f1", json: json("Hunyadi János, a kormányzó", { art: { subjectIcon: "icon-tortenelem-studio", picture: "hero-studio", topic: "x" } }) },
  { id: "b", html_file_id: null, json: json("Hunyadi János – a kormányzó") },
  { id: "c", html_file_id: "f2", json: json("Hunyadi János, a kormányzó", { art: { picture: hunyadi } }) },
  { id: "d", html_file_id: "7900a871-5788-4df1-95d7-77a646a9ffd6", json: json("Hunyadi János, a kormányzó") },
  { id: "e", html_file_id: "f3", json: json("Mátyás király") },
];

test("a terv: a katalógusban lévő kulcsú borító; a már kész, az art nélküli, az Antigoné-anyag és a kulcs nélküli lecke kimarad", () => {
  const plans = planPins(rows, new Set([hunyadi]));
  // Review #382: a „b” (art nélküli) lecke kimarad — csak picture-ös art mellett a lejátszó nem pótolná a kabalát és az ikont.
  assert.deepEqual(plans.map(p => p.id), ["a"]);
  assert.equal(plans[0].from, "hero-studio");
  assert.deepEqual(pinnedArt(plans[0]), { subjectIcon: "icon-tortenelem-studio", picture: hunyadi, topic: "x" }, "az art többi mezője marad");
});

test("az ellenőrzés: csak az art.picture változhat; bármely más eltérés hiba", () => {
  const [p] = planPins(rows, new Set([hunyadi]));
  const after = { ...rows[0].json, art: pinnedArt(p) };
  assert.doesNotThrow(() => verifyPinned(p, after));
  // Kulcssorrend nem számít (a jsonb nem őrzi).
  assert.doesNotThrow(() => verifyPinned(p, Object.fromEntries(Object.entries(after).reverse())));
  assert.throws(() => verifyPinned(p, { ...after, title: "Más cím" }), /art-on kívüli/);
  assert.throws(() => verifyPinned(p, { ...after, sections: [] }), /art-on kívüli/);
  assert.throws(() => verifyPinned(p, { ...after, art: { picture: hunyadi } }), /art mezője/);
  assert.equal(hashWithoutArt(rows[0].json), hashWithoutArt({ ...rows[0].json, art: { picture: "bármi" } }));
});
