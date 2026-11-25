import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * P-011 — Szólétra feliratok (docs/specs/2026-11-23-szoletra-felirat.md E1): a rivális nevét tartalmazó mondatok minden
 * névre helyesek. A régi sablon a névhez nyers „t”-t ragasztott („Villámt”); a magyar tárgyrag a hangrendtől, az utolsó
 * hangtól és a szótőtől függ (Villám → Villámot, Kő → Követ, Bence → Bencét), ezért a mondatok úgy vannak megfogalmazva, hogy
 * a név után ne álljon rag. A név utáni első karakter nem lehet betű.
 */

type Captions = {
  overtakeCaption: (by: "player" | "rival", name: string) => string;
  winTitle: (name: string) => string;
  lossLine: (name: string) => string;
  leadCaption: (lead: number, name: string) => string;
};

const NAMES = ["Villám", "Kő", "Ödön", "Bence", "Zsófi", "Rex", "Anna", "Tűz", "Lili", "Bálint", "Ász", "Ernő"];

async function load(): Promise<Captions> {
  const mod = (await import("../client/src/lib/wordLadder/captions").catch(() => null)) as Captions | null;
  assert.ok(mod, "a felirat-mondatok tiszta modulja (lib/wordLadder/captions.ts) létezik");
  return mod;
}

/** A név minden előfordulása után szóköz, írásjel, emoji vagy a mondat vége áll — betű (rag) soha. */
function assertNoSuffix(text: string, name: string, label: string) {
  assert.ok(text.includes(name), `${label}: a mondat tartalmazza a nevet („${text}”)`);
  const glued = new RegExp(`${name}\\p{L}`, "u");
  assert.ok(!glued.test(text), `${label}: a név után nem állhat rag („${text}”)`);
}

test("E1: az előzés-, győzelem-, vereség- és állás-mondat minden névre rag nélküli", async () => {
  const c = await load();
  for (const name of NAMES) {
    assertNoSuffix(c.overtakeCaption("player", name), name, `előzés (játékos) ${name}`);
    assertNoSuffix(c.overtakeCaption("rival", name), name, `előzés (rivális) ${name}`);
    assertNoSuffix(c.winTitle(name), name, `győzelem ${name}`);
    assertNoSuffix(c.lossLine(name), name, `vereség ${name}`);
    assertNoSuffix(c.leadCaption(-3, name), name, `állás (lemaradás) ${name}`);
  }
});

test("E1: a pontos mondatok a játék rivális-nevével (Villám)", async () => {
  const c = await load();
  assert.equal(c.overtakeCaption("player", "Villám"), "Előzés! Villám most mögötted van! 🎉");
  assert.equal(c.overtakeCaption("rival", "Villám"), "Villám előzött — kapaszkodj utána!");
  assert.equal(c.winTitle("Villám"), "🏁 Elérted a csúcsot Villám előtt!");
  assert.equal(c.lossLine("Villám"), "Villám most gyorsabb volt — a visszavágóban utolérheted!");
  assert.equal(c.leadCaption(2.6, "Villám"), "+2 fok előnyöd van");
  assert.equal(c.leadCaption(-1.2, "Villám"), "Villám 1 fokkal előtted");
  assert.equal(c.leadCaption(0.4, "Villám"), "Fej fej mellett!");
});

test("E1 forrás-őr: a Szólétra lapján nincs a rivális-névhez ragasztott sablon, a mondatok a captions modulból jönnek", () => {
  const page = readFileSync(new URL("../client/src/pages/WordLadderHuEn.tsx", import.meta.url), "utf8");
  const glued = page.match(/\$\{RIVAL_NAME\}\p{L}/gu) ?? [];
  assert.deepEqual(glued, [], "a `${RIVAL_NAME}` után közvetlenül nem állhat betű (rag)");
  assert.match(page, /from "@\/lib\/wordLadder\/captions"/u, "a lap a captions modult használja");
});
