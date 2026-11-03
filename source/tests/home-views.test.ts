import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_HOME_VIEW, groupBySubject, newestFirst, parseHomeView } from "../client/src/lib/home-views";
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
