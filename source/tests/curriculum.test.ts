import { test } from "node:test";
import assert from "node:assert/strict";
import { schoolYearPosition } from "../shared/school-calendar";
import { buildIndex, matchMaterial, normalizeTokens, sameStem, seasonalMatch, subjectsOfTitle, type TanmenetData } from "../server/curriculum/match";
import { curriculumSort, isCurrent, NOW_WINDOW } from "../client/src/lib/curriculum-order";
import tanmenet from "../server/data/tanmenet-2020.json";

// Tananyaglista a NAT 2020 tanítási menetrendje szerint (docs/specs/2026-10-17-tanmenet-rendezes.md).
const d = (iso: string) => new Date(`${iso}T12:00:00`);
const index = buildIndex(tanmenet as TanmenetData);

test("tanév: első nap ~0, utolsó ~1, monoton; szünet és hétvége az előző tanítási nap értéke; nyáron 0", () => {
  assert.ok(schoolYearPosition(d("2026-09-01")) < 0.01);
  assert.ok(schoolYearPosition(d("2027-06-18")) > 0.99);
  let prev = -1;
  for (let t = d("2026-09-01").getTime(); t <= d("2027-06-18").getTime(); t += 86_400_000) {
    const p = schoolYearPosition(new Date(t));
    assert.ok(p >= prev, `monoton: ${new Date(t).toISOString()}`);
    prev = p;
  }
  assert.equal(schoolYearPosition(d("2026-10-28")), schoolYearPosition(d("2026-10-22")), "őszi szünet = a szünet előtti utolsó nap");
  assert.equal(schoolYearPosition(d("2026-10-18")), schoolYearPosition(d("2026-10-16")), "vasárnap = péntek");
  assert.equal(schoolYearPosition(d("2026-07-20")), 0, "nyári szünet: a tanév eleje");
  assert.equal(schoolYearPosition(d("2030-01-10")), 0, "ismeretlen tanév: 0");
  const mid = schoolYearPosition(d("2027-01-22"));
  assert.ok(mid > 0.45 && mid < 0.55, `félév vége a tanév közepén: ${mid}`);
});

test("szavak: ékezet nélkül, általános szavak és tantárgynevek nélkül; tőegyezés a magyar toldalékokra, a rövid tő nem laza", () => {
  assert.deepEqual(normalizeTokens("5. osztály - Matematika: Törtek – Interaktív tananyag"), ["tortek"]);
  assert.ok(sameStem("tort", "tortek"));
  assert.ok(sameStem("hossz", "hosszusagmeres"), "összetett szó");
  assert.ok(sameStem("gorogorszag", "gorogok"), "közös 6 betűs eleje");
  assert.equal(sameStem("szam", "szamiras"), false, "a 4 betűs tő csak arányos hosszon");
});

test("tantárgy a címből: angol (magyar „angolul” és angol szavak), matematika, ismeretlen", () => {
  assert.deepEqual(subjectsOfTitle("3. osztály - Daily Routines - Napi Rutinok Angolul"), ["angol"]);
  assert.deepEqual(subjectsOfTitle("3. osztály - VEGETABLES & FRUITS"), ["angol"]);
  assert.deepEqual(subjectsOfTitle("Kivonás 10-es átlépéssel - 3. osztály"), ["matematika"]);
  assert.equal(subjectsOfTitle("Medve Szabadtéri Csapatverseny"), null);
});

test("illesztés a valódi OH mintatanmenetre: a téma a helyére kerül; gyenge egyezés, 0. évfolyam és nyelvi anyag nem illeszkedik", () => {
  const romai = matchMaterial({ title: "5. osztály - A számírás fejlődése - Római számok", classroom: 5 }, index);
  assert.ok(romai && /római/i.test(romai.label) && romai.pos < 0.15, JSON.stringify(romai));
  const test4 = matchMaterial({ title: "4. osztály - Testrészek, érzékszervek", classroom: 4 }, index);
  assert.ok(test4 && /Testrészek/.test(test4.label), JSON.stringify(test4));
  const egyiptom = matchMaterial({ title: "Az ókori Egyiptom", classroom: 5 }, index);
  assert.ok(egyiptom && /Egyiptom/.test(egyiptom.label) && egyiptom.pos < 0.5, JSON.stringify(egyiptom));
  const legzes = matchMaterial({ title: "8. osztály - 🫁 Légzőrendszer - Interaktív Tananyag", classroom: 8 }, index);
  assert.ok(legzes && /légzőrendszer/i.test(legzes.label), JSON.stringify(legzes));
  assert.equal(matchMaterial({ title: "Negatív számok kivonása", classroom: 7 }, index), null, "csak év végi ismétlésre illene — küszöb alatt");
  assert.equal(matchMaterial({ title: "Informatika - ChatGPT Használata Kezdőknek", classroom: 0 }, index), null);
  assert.equal(matchMaterial({ title: "Have Got - Angol 5. osztály", classroom: 5 }, index), null, "nincs OH nyelvi tanmenet");
});

test("ünnep és hónapnév: rögzített pozíció (Halloween az őszi szünet előtt, karácsony decemberben, „Októberi” október közepén)", () => {
  const h = seasonalMatch("4. osztály - Halloween Poems - Angol Nyelv Lecke");
  assert.ok(h && h.pos > schoolYearPosition(d("2026-10-15")) && h.pos <= schoolYearPosition(d("2026-10-22")), JSON.stringify(h));
  const x = matchMaterial({ title: "I Built a Little Snowman - Angol 3. osztály", classroom: 3 }, index);
  assert.ok(x && x.kind === "seasonal" && x.label === "karácsony");
  const okt = matchMaterial({ title: "4. osztály - Októberi Matek Gyakorló 4.", classroom: 4 }, index);
  assert.ok(okt && okt.label === "október");
});

test("rendezés: a mai témához legközelebbi elöl, a jövő előnyt kap a múlttal szemben, az illesztetlen hátul legújabb elöl; „Most tanuljuk” ±2 hét", () => {
  const today = 0.2;
  const files = [
    { id: "nincs-regi", createdAt: "2026-01-01", curriculum: null },
    { id: "multbeli", createdAt: "2026-02-01", curriculum: { pos: 0.14, label: "" } },
    { id: "mai", createdAt: "2025-01-01", curriculum: { pos: 0.21, label: "" } },
    { id: "kozelgo", createdAt: "2025-01-01", curriculum: { pos: 0.26, label: "" } },
    { id: "nincs-uj", createdAt: "2026-09-01" },
    { id: "evvege", createdAt: "2026-09-02", curriculum: { pos: 0.95, label: "" } },
  ];
  assert.deepEqual(curriculumSort(files, today).map(f => f.id), ["mai", "kozelgo", "multbeli", "evvege", "nincs-uj", "nincs-regi"]);
  assert.ok(isCurrent({ pos: today + NOW_WINDOW * 0.9, label: "" }, today));
  assert.equal(isCurrent({ pos: today + NOW_WINDOW * 1.5, label: "" }, today), false);
  assert.equal(isCurrent(null, today), false);
});
