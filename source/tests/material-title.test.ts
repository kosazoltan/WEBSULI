import assert from "node:assert/strict";
import test from "node:test";

import {
  TITLE_GRADE_SEPARATOR,
  materialDisplayTitle,
  materialTitleGradePrefix,
  matchesMaterialSearch,
  parseGradeQuery,
  titleNamesClassroom,
} from "../shared/material-title";

// docs/specs/2026-11-17-tananyag-cim-osztaly.md — a mérce a terv (E1–E8 és az edge case-ek), nem a megvalósítás.

const ORDINAL_WORDS = ["első", "második", "harmadik", "negyedik", "ötödik", "hatodik", "hetedik", "nyolcadik", "kilencedik", "tizedik", "tizenegyedik", "tizenkettedik"];

test("E1: a cím elé az osztály kerül — 1–12: „N. osztály · Cím”, 0: „Programozás · Cím”", () => {
  assert.equal(TITLE_GRADE_SEPARATOR, " · ");
  for (let grade = 1; grade <= 12; grade += 1) {
    assert.equal(materialDisplayTitle("Törtek összeadása", grade), `${grade}. osztály · Törtek összeadása`);
    assert.equal(materialTitleGradePrefix("Törtek összeadása", grade), `${grade}. osztály`);
  }
  assert.equal(materialDisplayTitle("Python kezdőknek", 0), "Programozás · Python kezdőknek");
});

test("E2: ha a tárolt cím már megnevez osztályt, nincs előtag (nincs duplázás)", () => {
  const titles = [
    "5. osztály - Törtek", "Törtek (5. osztály)", "5. osztályos törtek", "5.osztály: törtek", "5 osztály törtek", "Törtek 5.o",
    "Törtek 5. o.", "9. évfolyam: Antigoné", "Törtek — ötödik osztály", "Törtek ötödikeseknek", "Olvasás harmadikosoknak",
    "Betűk elsősöknek", "Osztály: 5 — törtek", "5–6. osztály: arányok", "5. OSZTÁLY TÖRTEK", "Tortek 5. osztaly", "12. osztály: érettségi",
  ];
  for (const title of titles) {
    assert.equal(titleNamesClassroom(title), true, title);
    assert.equal(materialDisplayTitle(title, 5), title, title);
    assert.equal(materialTitleGradePrefix(title, 5), null, title);
  }
});

test("E2: a programozási sávban a „programoz…” szót tartalmazó cím elé nem kerül „Programozás”; más osztálynál az osztály igen", () => {
  assert.equal(materialDisplayTitle("Programozási alapismeretek: ciklusok", 0), "Programozási alapismeretek: ciklusok");
  assert.equal(materialDisplayTitle("Bevezetés a programozásba", 0), "Bevezetés a programozásba");
  assert.equal(materialDisplayTitle("Bevezetés a programozásba", 7), "7. osztály · Bevezetés a programozásba");
});

test("a címben szereplő szám vagy sorszámnév önmagában nem osztály — az előtag megjelenik", () => {
  const titles = [
    "Az 5 legfontosabb szabály", "1956 — a forradalom", "12 pont", "A második világháború", "Első lépések", "Elsősegély",
    "Elsősorban a víz", "3/4 rész", "A 15. század", "Osztályozás a biológiában", "Számok 10-ig",
  ];
  for (const title of titles) {
    assert.equal(titleNamesClassroom(title), false, title);
    assert.equal(materialDisplayTitle(title, 4), `4. osztály · ${title}`, title);
  }
});

test("a cím más osztályt nevez meg, mint a mező: nincs előtag (nem lesz „3. osztály · … 2. osztály”)", () => {
  assert.equal(materialDisplayTitle("Matek Aréna 2. osztály", 3), "Matek Aréna 2. osztály");
  assert.equal(materialDisplayTitle("5. osztály - Törtek", 0), "5. osztály - Törtek");
});

test("E3: érvénytelen vagy hiányzó osztálynál nincs előtag; üres címnél sem", () => {
  for (const bad of [13, -1, 2.5, null, undefined, "7", Number.NaN]) {
    assert.equal(materialDisplayTitle("Régi anyag", bad), "Régi anyag", String(bad));
    assert.equal(materialTitleGradePrefix("Régi anyag", bad), null, String(bad));
  }
  assert.equal(materialDisplayTitle("", 5), "");
  assert.equal(materialDisplayTitle("   ", 5), "   ");
});

test("E4: az osztály-kifejezés minden alakja az osztályt adja (1–12)", () => {
  for (let n = 1; n <= 12; n += 1) {
    const forms = [
      `${n}`, `${n}.`, `${n}.o`, `${n}. o.`, `${n}.oszt`, `${n} osztaly`, `${n} osztály`, `${n}. osztály`, `${n}.osztály`, `${n}. osztályos`,
      `${n}. OSZTÁLY`, `${n}. évfolyam`, `${n} evfolyam`, `${n}. évf.`, `osztály ${n}`, `  ${n}. osztály  `,
    ];
    for (const form of forms) assert.deepEqual(parseGradeQuery(form), { grades: [n], rest: [] }, JSON.stringify(form));
    const word = ORDINAL_WORDS[n - 1];
    for (const form of [word, word.toUpperCase(), `${word} osztály`, `${word} évfolyam`]) {
      assert.deepEqual(parseGradeQuery(form), { grades: [n], rest: [] }, JSON.stringify(form));
    }
  }
  for (const form of ["5-ös", "5-ödik", "5.-es", "ötödikes", "ötödikesek", "ötödikeseknek", "otodik", "3-as", "harmadikos", "6-os", "elsős"]) {
    assert.equal(parseGradeQuery(form).grades.length, 1, form);
    assert.deepEqual(parseGradeQuery(form).rest, [], form);
  }
  assert.deepEqual(parseGradeQuery("5-ös").grades, [5]);
  assert.deepEqual(parseGradeQuery("harmadikos").grades, [3]);
});

test("E5: osztály + további szavak — az osztály és a maradék szavak külön", () => {
  assert.deepEqual(parseGradeQuery("5. osztály törtek"), { grades: [5], rest: ["tortek"] });
  assert.deepEqual(parseGradeQuery("törtek 5.o"), { grades: [5], rest: ["tortek"] });
  assert.deepEqual(parseGradeQuery("nyolcadik osztály fizika hang"), { grades: [8], rest: ["fizika", "hang"] });
  assert.deepEqual(parseGradeQuery("4 angol"), { grades: [4], rest: ["angol"] });
  assert.deepEqual(parseGradeQuery("5. és 6. osztály"), { grades: [5, 6], rest: [] });
});

test("E6: „programozás”, „prog” → 0. osztály", () => {
  for (const form of ["programozás", "Programozas", "prog", "prog.", "programozási alapismeretek", "programozás alapok", "0", "0. osztály"]) {
    assert.deepEqual(parseGradeQuery(form), { grades: [0], rest: [] }, form);
  }
  assert.deepEqual(parseGradeQuery("program").grades, [], "a „program” nem a programozási sáv");
});

test("E8: tört, tizedes, tartomány, hosszabb vagy 12-nél nagyobb szám nem osztály", () => {
  for (const query of ["3/4", "3,5", "3.5", "1-2", "5:30", "1956", "100", "13", "15. osztály", "2+3", "a5", "5a", "elsősegély", "elsősorban", "törtek"]) {
    assert.deepEqual(parseGradeQuery(query).grades, [], query);
  }
});

const FILES = [
  { id: "a", title: "Törtek összeadása", description: "Közös nevezővel", subject: "matematika", classroom: 5 },
  { id: "b", title: "5. osztály - A honfoglalás", description: null, subject: "tortenelem", classroom: 5 },
  { id: "c", title: "Törtek szorzása", description: "Gyakorló feladatok", subject: "matematika", classroom: 6 },
  { id: "d", title: "A második világháború", description: "1939–1945", subject: "tortenelem", classroom: 8 },
  { id: "e", title: "Python kezdőknek", description: "Változók és ciklusok", subject: "informatika", classroom: 0 },
  { id: "f", title: "Programozási alapismeretek: elágazás", description: "", subject: null, classroom: 0 },
  { id: "g", title: "Matek Aréna 2. osztály", description: "Szorzótábla", subject: "matematika", classroom: 3 },
  { id: "h", title: "Régi anyag az 5 érzékszervről", description: "", subject: null, classroom: 13 },
  { id: "i", title: "Az időmérés: 5:30 és társai", description: "Óra, perc", subject: "matematika", classroom: 2 },
  { id: "j", title: "Antigoné", description: "Egy ma is érvényes kérdés", subject: "magyar-irodalom", classroom: 9 },
];
const found = (query: string) => FILES.filter((file) => matchesMaterialSearch(file, query)).map((file) => file.id).join("");

test("E4: az osztály-kifejezés az osztály MINDEN anyagát megtalálja, a tárolt címtől függetlenül", () => {
  for (const query of ["5. osztály", "5.o", "5 osztaly", "5. osztályos", "5. évfolyam", "5-ös", "ötödik", "ötödikes", "ÖTÖDIK OSZTÁLY"]) {
    assert.equal(found(query), "ab", query);
  }
  assert.equal(found("6. osztály"), "c");
  assert.equal(found("9.o"), "j");
  // A mező szerinti osztály (3.) ÉS a címben megnevezett osztály (2.) is találat.
  assert.equal(found("3. osztály"), "g");
  assert.equal(found("2. osztály"), "gi");
  assert.equal(found("7. osztály"), "", "üres osztály: nincs találat");
});

test("E4: a puszta szám az osztály anyagait ÉS a számot tartalmazó szövegeket is megtalálja (mint eddig)", () => {
  assert.equal(found("5"), "abdhi");
});

test("E5: osztály + szavak — csak az adott osztály azon anyagai, amelyekben minden szó megvan", () => {
  assert.equal(found("5. osztály törtek"), "a");
  assert.equal(found("törtek 6.o"), "c");
  assert.equal(found("5 törtek"), "a");
  assert.equal(found("ötödik matematika"), "a", "a tantárgy neve is szó");
  assert.equal(found("5. osztály honfoglalás"), "b");
  assert.equal(found("5. osztály szorzása"), "", "a szó csak a 6. osztályos anyagban van");
  assert.equal(found("8. osztály törtek"), "");
});

test("E6: „programozás” / „prog” a 0. osztály minden anyagát megtalálja", () => {
  assert.equal(found("programozás"), "ef");
  assert.equal(found("prog"), "ef");
  assert.equal(found("prog python"), "e");
});

test("érvénytelen osztályú anyag: osztály-kifejezésre nem találat, szövegre igen", () => {
  assert.equal(found("13"), "");
  assert.equal(found("érzékszerv"), "h");
});

test("a megjelenített előtag is kereshető; az üres keresés mindent mutat", () => {
  assert.equal(found("5. osztály · Törtek"), "a");
  assert.equal(found("Programozás · Python"), "e");
  assert.equal(found("   "), "abcdefghij");
});

test("E7: a kereső csak bővül — ami a régi illesztéssel találat, az az újjal is", () => {
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const labels: Record<string, string> = { matematika: "Matematika", tortenelem: "Történelem", informatika: "Digitális kultúra", "magyar-irodalom": "Magyar irodalom" };
  const old = (file: (typeof FILES)[number], query: string) => {
    const q = fold(query.trim());
    return !q || [file.title, file.description ?? "", file.subject ? labels[file.subject] : ""].some((field) => fold(field).includes(q));
  };
  const queries = [
    "törtek", "TORTEK", "második világháború", "második", "5", "5.", "5. osztály", "2. osztály", "osztály", "1939", "5:30", "Irodalom",
    "matematika", "történelem", "python", "programozási", "alapismeretek: elágazás", "aréna 2", "az 5", "érvényes", "o", "a", "-", "·", "13",
  ];
  let checked = 0;
  for (const query of queries) {
    for (const file of FILES) {
      if (!old(file, query)) continue;
      checked += 1;
      assert.equal(matchesMaterialSearch(file, query), true, `${JSON.stringify(query)} → ${file.id}`);
    }
  }
  assert.ok(checked > 40, `az ellenőrzött régi találatok száma: ${checked}`);
});

test("a „második világháború” nem szűkül a 2. osztályra, és nem hozza be a 2. osztály többi anyagát", () => {
  assert.equal(found("második világháború"), "d");
});
