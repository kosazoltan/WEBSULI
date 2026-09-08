import assert from "node:assert/strict";
import test from "node:test";

import { probaMessage } from "../client/src/lesson-runtime/probaMessage";

/**
 * M-4 — a kupon-küszöb új esetet szült, és azt nem szabad hazug üzenettel elfedni.
 *
 * A régi felületnek két állapota volt: kupon, vagy „nézd át ezeket" + gyenge fogalmak
 * listája. A küszöb bevezetésével keletkezik egy harmadik: a gyerek MINDENT eltalál, de
 * kevés kérdés volt a szakaszban. A régi ág ilyenkor üres listát mutatna „nézd át
 * ezeket" felirattal — olyat kérne számon, ami nincs.
 */

/** A `coupon` ág szándékosan nem hordoz szöveget — ott nincs mit magyarázni. */
const textOf = (m: ReturnType<typeof probaMessage>): string => ("text" in m ? m.text : "");

const base = {
  correctCount: 3,
  total: 3,
  minCorrectForCoupon: 5,
  hasCoupon: false,
  alreadyRewarded: false,
  weakConceptIds: [] as string[],
};

test("kupon esetén nincs magyarázkodás", () => {
  assert.deepEqual(probaMessage({ ...base, hasCoupon: true }), { kind: "coupon" });
});

test("hibátlan, de kevés válasz: a hiányzó darabszámot mondjuk meg", () => {
  const msg = probaMessage(base);

  assert.equal(msg.kind, "need_more_correct");
  assert.ok(msg.kind === "need_more_correct" && msg.missing === 2, JSON.stringify(msg));
  assert.match(msg.text, /3\/3/, "a saját eredményét lássa");
  assert.match(msg.text, /még 2/, "és azt, mennyi hiányzik");
});

test("hibátlan esetben SOHA nem kérünk átnézést", () => {
  const msg = probaMessage(base);

  assert.notEqual(msg.kind, "review", "nincs mit átnéznie — mindent tudott");
  assert.doesNotMatch(textOf(msg), /Nézd át/);
});

test("gyenge fogalomnál az átnézés fontosabb a darabszámnál", () => {
  const msg = probaMessage({ ...base, correctCount: 1, weakConceptIds: ["kerulet"] });

  assert.equal(msg.kind, "review");
  assert.ok(msg.kind === "review" && msg.weakConceptIds.length === 1);
});

test("ma már jutalmazott szakasz: ezt mondjuk, nem hiányt", () => {
  const msg = probaMessage({ ...base, correctCount: 8, total: 8, alreadyRewarded: true });

  assert.equal(msg.kind, "already_rewarded");
  assert.doesNotMatch(textOf(msg), /hiányzik/);
});

test("a küszöb pontosan teljesül, de kupon mégsincs: nem találunk ki okot", () => {
  const msg = probaMessage({ ...base, correctCount: 5, total: 5 });

  assert.equal(msg.kind, "review");
  assert.ok(msg.kind === "review" && msg.weakConceptIds.length === 0);
  assert.doesNotMatch(textOf(msg), /hiányzik/);
});

test("a küszöb a szerverről jön, nem a lapból", () => {
  const strict = probaMessage({ ...base, minCorrectForCoupon: 10 });
  const loose = probaMessage({ ...base, minCorrectForCoupon: 2 });

  assert.ok(strict.kind === "need_more_correct" && strict.missing === 7);
  assert.notEqual(loose.kind, "need_more_correct", "2-es küszöbnél a 3 helyes már elég lenne");
});

test("negatív hiány nem keletkezhet", () => {
  const msg = probaMessage({ ...base, correctCount: 9, total: 9 });

  assert.notEqual(msg.kind, "need_more_correct");
});
