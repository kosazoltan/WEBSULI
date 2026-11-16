import assert from "node:assert/strict";
import test from "node:test";

import { NICKNAME_ADJECTIVES, NICKNAME_ANIMALS, guestNickname, nicknameProblems } from "../shared/nicknames";

/** JM1 — vendég-becenév és becenév-szűrő (végrehajtás JM-K `nicknames.ts`; terv 10.4, 10.9). */

test("guestNickname: seedelt, azonos seed → azonos név; melléknév + állat a két listából", () => {
  assert.equal(guestNickname("abc"), guestNickname("abc"));
  const names = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const n = guestNickname(`s${i}`);
    const [adj, animal] = n.split(" ");
    assert.ok(NICKNAME_ADJECTIVES.includes(adj!), n);
    assert.ok(NICKNAME_ANIMALS.includes(animal!), n);
    names.add(n);
  }
  assert.ok(names.size > 100, "változatos");
});

test("minden generálható vendég-becenév átmegy a saját szűrőn", () => {
  for (const adj of NICKNAME_ADJECTIVES) {
    for (const animal of NICKNAME_ANIMALS) assert.deepEqual(nicknameProblems(`${adj} ${animal}`), [], `${adj} ${animal}`);
  }
});

test("nicknameProblems: hossz 3–16, csak betű / szám / szóköz", () => {
  assert.deepEqual(nicknameProblems("Bence 2"), []);
  assert.deepEqual(nicknameProblems("Ádám"), []);
  assert.ok(nicknameProblems("ab").length > 0);
  assert.ok(nicknameProblems("abcdefghijklmnopq").length > 0);
  assert.ok(nicknameProblems("Anna!").length > 0);
  assert.ok(nicknameProblems(" Anna").length > 0);
  assert.ok(nicknameProblems("An  na").length > 0);
});

test("nicknameProblems: e-mail-, telefonszám- és URL-szerű minta elutasítva", () => {
  assert.ok(nicknameProblems("a@b.hu").some((p) => p.includes("E-mail")));
  assert.ok(nicknameProblems("anna at gmail pont com").some((p) => p.includes("E-mail")));
  assert.ok(nicknameProblems("06301234567").some((p) => p.includes("Telefonszám")));
  assert.ok(nicknameProblems("Anna 30 123 45").some((p) => p.includes("Telefonszám")));
  assert.ok(nicknameProblems("www.anna.hu").some((p) => p.includes("Weboldal")));
  assert.ok(nicknameProblems("annablog.com").some((p) => p.includes("Weboldal")));
  assert.deepEqual(nicknameProblems("Kati 2015"), [], "négy számjegy (pl. évszám) még nem telefonszám");
});

test("nicknameProblems: trágár szó ékezettel, nagybetűvel, betűhelyettesítéssel is fennakad; a „Szarvas” nem", () => {
  for (const bad of ["Kurva jó", "KÚRVA", "k0csog", "Fasz1", "fuck you", "Sh1t"]) {
    assert.ok(nicknameProblems(bad).some((p) => p.includes("nem megfelelő")), bad);
  }
  for (const ok of ["Szarvas", "Fóka Feri", "Hős Hiúz", "Pingvin"]) assert.deepEqual(nicknameProblems(ok), [], ok);
});
