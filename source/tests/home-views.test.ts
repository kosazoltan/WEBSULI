import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_VIEW, filterHomeFiles, groupBySubject, matchesHomeSearch, newestFirst, parseHomeView } from "../client/src/lib/home-views";
import { OTHER_SUBJECT, SUBJECT_LABELS, subjectLabel } from "../shared/subjects";
import tanmenet from "../server/data/tanmenet-2020.json";
import nyelvi from "../server/data/nyelvi-tanmenet.json";

// docs/specs/2026-11-03-fooldal-nezetek.md
const f = (id: string, createdAt: string, subject?: string | null) => ({ id, createdAt, subject });

test("legfrissebb: createdAt csökkenő, azonos időnél azonosító szerint stabil, a bemenet változatlan", () => {
  const input = [f("b", "2026-10-01T10:00:00Z"), f("a", "2026-11-02T10:00:00Z"), f("c", "2026-10-01T10:00:00Z"), f("x", "nem dátum")];
  assert.deepEqual(newestFirst(input).map((x) => x.id), ["a", "b", "c", "x"]);
  assert.deepEqual(input.map((x) => x.id), ["b", "a", "c", "x"]);
});

test("tantárgyanként: magyar ábécé (ékezetesen), az alsós/felsős magyar nyelv egy csoport, az „Egyéb” utolsó", () => {
  const groups = groupBySubject(
    [
      f("1", "2026-01-01", "tortenelem"),
      f("2", "2026-01-02", null),
      f("3", "2026-01-03", "enek-zene"),
      f("4", "2026-01-04", "magyar-nyelvtan"),
      f("5", "2026-01-05", "magyar-nyelv-es-irodalom"),
      f("6", "2026-01-06", "angol"),
      f("7", "2026-01-07", "ismeretlen-kulcs"),
      f("8", "2026-01-08", "matematika"),
    ],
    (list) => newestFirst(list),
  );
  assert.deepEqual(groups.map((g) => g.label), ["Angol", "Ének-zene", "Magyar nyelv", "Matematika", "Történelem", OTHER_SUBJECT]);
  assert.deepEqual(groups.find((g) => g.label === "Magyar nyelv")!.files.map((x) => x.id), ["5", "4"]);
  assert.deepEqual(groups.at(-1)!.files.map((x) => x.id).sort(), ["2", "7"]);
});

test("nézet a tárolóból: csak a pontos alak érvényes, minden más az alapnézet", () => {
  assert.deepEqual(parseHomeView(JSON.stringify({ newest: true, bySubject: true })), { newest: true, bySubject: true });
  for (const raw of [null, "", "{", "[]", "null", JSON.stringify({ newest: "igen", bySubject: true }), JSON.stringify({ newest: true })]) {
    assert.deepEqual(parseHomeView(raw), DEFAULT_HOME_VIEW, String(raw));
  }
});

test("minden tanmenet-tantárgykulcsnak van megjelenített neve", () => {
  const keys = new Set([...tanmenet.plans, ...nyelvi.plans].map((plan) => plan.subject));
  for (const key of keys) assert.notEqual(subjectLabel(key), OTHER_SUBJECT, `hiányzó név: ${key}`);
  assert.equal(Object.keys(SUBJECT_LABELS).length >= keys.size, true);
});

test("keresés: cím, leírás és tantárgynév, kis-nagybetűtől és ékezettől függetlenül (tulajdonosi képernyőkép 2026-11-03)", () => {
  const antigone = { title: "Szophoklész: Antigoné", description: "Egy ma is érvényes kérdés", subject: "magyar-irodalom" };
  assert.equal(matchesHomeSearch(antigone, "Irodalom"), true, "a tantárgy neve alapján");
  assert.equal(matchesHomeSearch(antigone, "antigone"), true, "ékezet nélkül a címben");
  assert.equal(matchesHomeSearch(antigone, "ÉRVÉNYES"), true, "a leírásban");
  assert.equal(matchesHomeSearch(antigone, "  "), true, "üres keresés mindent mutat");
  assert.equal(matchesHomeSearch(antigone, "Matematika"), false);
  assert.equal(matchesHomeSearch({ title: "Anyag", description: null, subject: null }, "Egyéb"), false, "tantárgy nélkül nincs tantárgynév-találat");
  assert.equal(matchesHomeSearch({ title: "Ókori Róma", subject: "tortenelem" }, "tortenelem"), true);
});

// docs/specs/2026-11-17-tananyag-cim-osztaly.md (E4–E7): a főoldali kereső az osztályra is talál, a tárolt címtől függetlenül.
test("keresés: az osztály-kifejezés a tananyag osztálya alapján is talál; a korábbi találatok megmaradnak", () => {
  const tortek = { title: "Törtek összeadása", description: "Közös nevezővel", subject: "matematika", classroom: 5 };
  for (const query of ["5. osztály", "5.o", "5 osztaly", "ötödik", "5. osztály törtek", "törtek"]) {
    assert.equal(matchesHomeSearch(tortek, query), true, query);
  }
  for (const query of ["6. osztály", "hatodik", "5. osztály igék", "programozás"]) {
    assert.equal(matchesHomeSearch(tortek, query), false, query);
  }
  assert.equal(matchesHomeSearch({ title: "Python kezdőknek", subject: "informatika", classroom: 0 }, "prog"), true);
  assert.equal(matchesHomeSearch({ title: "Osztály nélküli régi anyag", classroom: 13 }, "13"), false);
  assert.equal(matchesHomeSearch({ title: "Osztály nélküli régi anyag" }, "régi anyag"), true, "osztály-mező nélkül a szöveges keresés működik");
});

// docs/specs/2026-11-17-tananyag-cim-osztaly.md, K1: aktív osztályszűrő mellett a MÁS osztályt megnevező keresés minden osztályban fut.
test("szűrés: a szűrőtől eltérő osztályt megnevező keresés minden osztályban fut; egyébként a szűrő érvényes", () => {
  const list = [
    { id: "a4", title: "Törtek összeadása", description: "", subject: "matematika", classroom: 4 },
    { id: "b4", title: "A víz körforgása", description: "", subject: "kornyezetismeret", classroom: 4 },
    { id: "a5", title: "Törtek szorzása", description: "", subject: "matematika", classroom: 5 },
    { id: "b5", title: "5. osztály - A honfoglalás", description: "", subject: "tortenelem", classroom: 5 },
    { id: "p0", title: "Python kezdőknek", description: "", subject: "informatika", classroom: 0 },
  ];
  const run = (query: string, selected: number | null) => {
    const result = filterHomeFiles(list, query, selected);
    return `${result.files.map((file) => file.id).join(",")}|${result.allClassrooms}`;
  };
  assert.equal(run("", 4), "a4,b4|false", "keresés nélkül a szűrő érvényes");
  assert.equal(run("5. osztály", 4), "a5,b5|true", "a mentett 4. osztály mellett az 5. osztály anyagai látszanak");
  assert.equal(run("ötödik törtek", 4), "a5|true");
  assert.equal(run("programozás", 4), "p0|true");
  assert.equal(run("4. osztály", 4), "a4,b4|false", "ugyanaz az osztály: a szűrő marad");
  assert.equal(run("törtek", 4), "a4|false", "osztály nélküli kifejezés: a szűrő marad (a mostani viselkedés)");
  assert.equal(run("törtek", null), "a4,a5|false");
  assert.equal(run("5. osztály", null), "a5,b5|false", "szűrő nélkül nincs mit átlépni");
  assert.equal(run("7. osztály", 4), "|true", "üres osztály: nincs találat, de a keresés minden osztályban futott");
});
