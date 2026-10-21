import assert from "node:assert/strict";
import test from "node:test";

import { checkGrounding, shortTermExamplePresent } from "../server/studio/grounding";
import type { MapConcept } from "../server/studio/coverage";

/* Spec 2026-10-19-rovid-fogalom-megalapozas — mérve: „Where I Live” (639b5201, 6f1158ce, 55736ce3), a térkép fogalmai szó szerint. */

const articleA = {
  localId: "article-a", term: "a", examWeight: "core",
  definition: "Az a névelő mássalhangzó hang előtt áll: a lamp, a sofa.",
  quote: "a = before consonant sounds: a lamp, a sofa",
} as MapConcept;
const articleAn = {
  localId: "article-an", term: "an", examWeight: "core",
  definition: "Az an névelő magánhangzó hang előtt áll: an armchair, an orange.",
  quote: "an = before vowel sounds: an armchair, an orange",
} as MapConcept;

test("a forrás saját példáját tanító angol blokk megalapozza az „an” címkét", () => {
  assert.equal(checkGrounding("Look! This is an armchair in the living room. It is big and soft.", articleAn), true);
  assert.equal(shortTermExamplePresent("an", articleAn.quote ?? "", "I have an orange for lunch today."), true);
});

test("a definíciót magyarázó blokk megalapozza az „a” címkét, ha a név megkülönböztetően (idézőjelben) áll", () => {
  assert.equal(checkGrounding("Az „a” névelőt mássalhangzó hang előtt használjuk, például: a bed, a chair, a table.", articleA), true);
});

// Review #326 (Copilot): a testvérfogalmak közös definíciószavai („névelő”, „hang”, „előtt”) nem alapozzák meg egymást.
test("az „a”-t tanító blokk nem alapozza meg az „an” címkét, és fordítva", () => {
  assert.equal(checkGrounding("Az „a” névelőt mássalhangzó hang előtt használjuk, például: a bed, a chair, a table.", articleAn), false);
  assert.equal(checkGrounding("Az „an” névelőt magánhangzó hang előtt használjuk, például: an apple, an egg, an ice cream.", articleA), false);
  assert.equal(checkGrounding("Az „an” névelőt magánhangzó hang előtt használjuk, például: an apple, an egg, an ice cream.", articleAn), true);
});

// Review #326 (Codex): a „< 4 szó” védelem a rövid név forráspéldájára is érvényes.
test("egy kétszavas képaláírás („an armchair”) önmagában nem alapoz meg", () => {
  assert.equal(checkGrounding("an armchair", articleAn), false);
});

test("más témájú magyar blokk, benne csak a magyar „a” névelővel: nem megalapozott", () => {
  assert.equal(checkGrounding("A szobában a kanapé mellett áll a kis asztal, és a falon egy kép lóg.", articleA), false);
  assert.equal(checkGrounding("A szobában a kanapé mellett áll a kis asztal, és a falon egy kép lóg.", articleAn), false);
});

test("a magyarázó (=) idézetdarab és az egyszavas darab nem számít példának", () => {
  assert.equal(shortTermExamplePresent("an", "an = before vowel sounds", "an before vowel sounds is the rule here"), false);
  assert.equal(shortTermExamplePresent("a", "a, b, c", "this is a test of the rule"), false);
});

test("rövidítés-fogalom: a kétszavas kifejezés-egyezés változatlanul dönt", () => {
  const c = { localId: "kr", term: "Kr. u. / i. sz.", examWeight: "core" } as MapConcept;
  assert.equal(checkGrounding("Az időszámításunk szerinti évek jele: Kr. u. / i. sz. — például Kr. u. 1000.", c), true);
  assert.equal(checkGrounding("Ez a blokk egészen másról, a vulkánokról és a földrengésekről szól.", c), false);
});

/* Spec 2026-10-21-rovid-fogalom-ekezet — mérve: Az Erdő (job 952d0101) és az időhatározói elöljárószók (job 8bc212f4), a térkép fogalmai
   szó szerint, a blokkok a mentett szerzői körből. */
const oz = {
  localId: "oz", term: "Őz", examWeight: "core",
  definition: "Növényevő; kecses test, hosszú lábak, rövid farok, a hímnek kis agancsa van. Család: bak (hím), suta (nőstény), gida (utód).",
  quote: "Őz: Növényevő. Kecses test, hosszú lábak, rövid farok.",
} as MapConcept;
const prepAt = {
  localId: "prep-at", term: "AT", examWeight: "core",
  definition: "Pontos időpont, étkezés, éjszaka előtt: at 5 o'clock, at noon, at night, at the weekend.",
  quote: "AT = óra, noon, night, weekend.",
} as MapConcept;
const prepIn = {
  localId: "prep-in", term: "IN", examWeight: "core",
  definition: "Hónap, évszak, év, napszak előtt: in July, in summer, in 1997, in the morning.",
  quote: "IN = év, hónap, évszak, napszak.",
} as MapConcept;
const prepOn = {
  localId: "prep-on", term: "ON", examWeight: "core",
  definition: "Napok, dátumok, napszak + nap előtt: on Monday, on 4th July, on Friday morning.",
  quote: "ON = nap, dátum.",
} as MapConcept;

test("ékezetes rövid név („Őz”): az ékezetes alak (ragozva is) megalapozza; ékezet nélkül nem", () => {
  assert.equal(checkGrounding("Az őz növényevő állat: kecses test, hosszú lábak, rövid farok.", oz), true);
  assert.equal(checkGrounding("Tavasszal az őzek a tisztás szélén legelnek, a gidák elbújnak.", oz), true);
  assert.equal(checkGrounding("Az ŐZ kecses, növényevő erdei állat, a hímnek agancsa van.", oz), true);
  assert.equal(checkGrounding("Az oz kecses, növényevő erdei állat, a hímnek agancsa van.", oz), false, "helyesírási hiba nem taníthat");
  assert.equal(checkGrounding("A vaddisznó mindenevő, és éjjel a földet túrja élelem után.", oz), false);
  assert.equal(checkGrounding("Az őz", oz), false, "a „< 4 szó” védelem változatlan");
});

test("AT / ON / IN: a definíció saját példája megalapozza (az idézet csak összefoglaló képlet)", () => {
  assert.equal(checkGrounding("Ebédnél azt mondjuk: at noon, este pedig at night — ez a pontos idő jele.", prepAt), true);
  assert.equal(checkGrounding("Nyáron így mondjuk angolul: in summer, és a hónapnál is: in July.", prepIn), true);
  assert.equal(checkGrounding("A napoknál ezt használjuk: on Monday, és ha napszak is van: on Friday morning.", prepOn), true);
});

test("AT: a nagybetűs „AT:” címke + a definíció szavainak fele megalapozza; kisbetűs köznapi „at” nem", () => {
  assert.equal(checkGrounding("midnight pontos pillanat. AT: Pontos időpont, étkezés, éjszaka előtt használjuk.", prepAt), true);
  assert.equal(checkGrounding("I am at home now, and my sister is at school today.", prepAt), false);
  assert.equal(checkGrounding("I live in London and my friend lives in Paris now.", prepIn), false);
});

test("a mért 40. blokk (job 8bc212f4) mindhárom címkéje megalapozott", () => {
  const block40 = "Ha megmondod, mikor történik valami, az időpont elé gyakran elöljárószó kell. Három időhatározó elöljárószó van: AT, ON és IN.\n\n"
    + "AT: Pontos időpont, étkezés, éjszaka előtt: at 5 o'clock, at noon, at night, at the weekend.\n\nON: Napok, dátumok, napszak + nap előtt: "
    + "on Monday, on 4th July, on Friday morning.\n\nIN: Hónap, évszak, év, napszak előtt: in July, in summer, in 1997, in the morning.";
  for (const c of [prepAt, prepOn, prepIn]) assert.equal(checkGrounding(block40, c), true, c.localId);
});

test("a kisbetűs „a” / „an” a nagybetűs ágra nem jogosult, és a mondat eleji „Az” sem jelölés", () => {
  assert.equal(checkGrounding("A szobában a kanapé mellett áll a kis asztal, és a falon egy kép lóg.", articleA), false);
  const az = { localId: "az", term: "az", examWeight: "core", definition: "Határozott névelő magánhangzó előtt: az alma, az ablak.", quote: "az alma" } as MapConcept;
  assert.equal(checkGrounding("Az erdőben sok fa él. Az ősszel lehulló levelek táplálják a talajt.", az), false);
  assert.equal(checkGrounding("Magánhangzó előtt így mondjuk: az alma, az ablak, az egér.", az), true);
});

// Review #363 (Copilot): a ragozott alak csak ellenőrzött toldalékkal és definíció-bizonyítékkal — a más jelentésű előtag-szó nem alapoz meg.
test("ékezetes rövid név: a más jelentésű, azonos kezdetű szó nem alapoz meg („ősszel” ≠ „ős”, „élőlények” ≠ „él”)", () => {
  const os = { localId: "os", term: "Ős", examWeight: "core", definition: "Régebbi nemzedékbeli előd, akitől a család származik.", quote: "Ős: előd." } as MapConcept;
  const el = { localId: "el", term: "Él", examWeight: "core", definition: "Két lap közös határvonala a testen; a kocka éle szakasz.", quote: "Él: két lap találkozása." } as MapConcept;
  assert.equal(checkGrounding("Ősszel a fák levelei lehullanak a talajra.", os), false);
  assert.equal(checkGrounding("Az élőlények életéhez vízre és levegőre van szükség.", el), false);
  assert.equal(checkGrounding("Az élet a földön sokféle formában jelenik meg mindenhol.", el), false, "a ragozott alak definíció-bizonyíték nélkül nem elég");
  assert.equal(checkGrounding("A kockának tizenkét éle van: minden él két lap határvonala.", el), true);
  assert.equal(checkGrounding("A nagyszüleink szülei a mi őseink, tőlük származik a család.", os), true);
});

test("ékezetes rövid név: a pontos és az ellenőrzötten ragozott alakok („őzek”, „őzet”, „őzzel”, „őzről”)", () => {
  assert.equal(checkGrounding("A gidák az őzzel együtt legelnek a tisztáson reggel.", oz), true);
  assert.equal(checkGrounding("A vadász az őzet messziről figyeli, mert az növényevő.", oz), true);
  assert.equal(checkGrounding("Ma az őzről tanulunk: kecses test, hosszú lábak.", oz), true);
  assert.equal(checkGrounding("Az őzike mese szereplője volt a régi könyvben.", oz), false, "nem ellenőrzött toldalék, definíció-bizonyíték nélkül");
});
