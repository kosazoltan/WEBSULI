import { test } from "node:test";
import assert from "node:assert/strict";
import { DESIGN_ASSET_CATALOG as C } from "../shared/design-asset-catalog";
import { heroFitsSubject, pickLessonArt, resolveStoredArt } from "../shared/design-assets";

// Spec 2026-11-08-borito-blokkcimkek: a 9–10. sáv hídja (fizikai kép) csak fizikához, matematikához és földrajzhoz; más tantárgy saját
// borító híján a korosztály semleges sávképét kapja.
const bio9 = { subject: "Biológia", title: "Harasztok, nyitvatermők és zárvatermők" };
const math9 = { subject: "Matematika", title: "Oszthatóság" };
const bridge = C.find(a => a.id === "hero-laboratory")!;

test("A1: a 9. osztályos biológialecke nem a hidat kapja, hanem semleges, korosztályos sávképet", () => {
  for (const seed of ["b8b28383", "x1", "x2", "x3"]) {
    const art = pickLessonArt({ ...bio9, seed }, "laboratory", C);
    assert.equal(art.cover, undefined);
    assert.ok(art.hero, "van kép");
    assert.notEqual(art.hero!.id, "hero-laboratory", seed);
    assert.deepEqual(art.hero!.subjects, [], "semleges (tantárgy nélküli) hős");
  }
});

test("A1: matematika (tulajdonosi döntés 2026-10-19), fizika és földrajz (2026-11-08) továbbra is a hidat kapja", () => {
  for (const subject of ["Matematika", "Fizika", "Földrajz", "foldrajz"]) assert.ok(heroFitsSubject(bridge, subject), subject);
  for (const subject of ["Biológia", "biologia", "Kémia", "Történelem"]) assert.ok(!heroFitsSubject(bridge, subject), subject);
  assert.equal(pickLessonArt({ ...math9, seed: "m" }, "laboratory", C).hero?.id, "hero-laboratory");
});

test("A2: a tárolt híd a biológialeckén nem marad (friss választás), a matematikaleckén igen", () => {
  assert.equal(resolveStoredArt({ picture: "hero-laboratory" }, "laboratory", C, bio9), null);
  assert.equal(resolveStoredArt({ picture: "hero-laboratory" }, "laboratory", C, math9)?.hero?.id, "hero-laboratory");
});

test("ismeretlen / üres tantárgynál a régi viselkedés: a sáv hőse", () => {
  assert.equal(pickLessonArt({ subject: "", title: "Ismeretlen", seed: "x" }, "laboratory", C).hero?.id, "hero-laboratory");
});
