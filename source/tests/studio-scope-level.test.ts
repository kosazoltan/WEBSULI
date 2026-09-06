import assert from "node:assert/strict";
import test from "node:test";

import { inferScope, scopeRequestParams } from "../server/studio/one-step";

/**
 * #196 — az osztályt a FORRÁS TARTALMA határozza meg, nem találgatás.
 *
 * MÉRVE ÉLESBEN (Kristóf, 2026-09-06): a feltöltött 7–8. osztályos geometria
 * (T = a·ma/2, K = d·π, T = r²π, körgyűrű, (n-2)·180°) alapján a rendszer
 * `classroom: 4`-et állapított meg, és a lecke végig 4. osztályos helyiérték-
 * anyag lett. Két oka volt, mindkettő javítva és itt rögzítve:
 *
 *  1. a prompt találgatásra hívott („most likely written for"), nem a tartalom
 *     legnehezebb fogalmához horgonyzott;
 *  2. a képek `detail: "low"` felbontással mentek, így a kézírásos képletek
 *     olvashatatlanok voltak — a modell csak a lap külalakját látta.
 *
 * A javítás után MÉRVE: a valódi forrásszövegből 7, a valódi képekből is 7.
 */

test("a scope-prompt a tartalom legnehezebb fogalmához horgonyoz, nem találgat", () => {
  const params = scopeRequestParams("teszt/modell", [{ type: "text", text: "minta" }]);
  const system = String(params.messages[0].content);

  assert.doesNotMatch(
    system,
    /most likely written for/i,
    "a találgatásra hívó megfogalmazás nem térhet vissza",
  );
  assert.match(system, /HARDEST concept/i, "a legnehezebb fogalomhoz kell horgonyozni");
  assert.match(system, /HIGHER grade/i, "kétes esetben a magasabb évfolyam a biztonságos default");
  assert.match(
    system,
    /Ignore handwriting quality/i,
    "a kézírás minősége nem jelezhet fiatalabb tanulót",
  );
});

test("a képek NAGY felbontással mennek a scope-hívásba", () => {
  // `low` mellett a kézírásos képletek olvashatatlanok — pontosan ez okozta a
  // 8. osztályos forrás 4. osztályként való besorolását.
  const params = scopeRequestParams("teszt/modell", [
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA", detail: "high" } },
  ]);
  const content = params.messages[1].content as Array<{ type: string; image_url?: { detail: string } }>;
  const image = content.find((p) => p.type === "image_url");
  assert.equal(image?.image_url?.detail, "high");
});

test("a felismert osztályt a modell adja, nem alapértelmezés", async () => {
  const r = await inferScope([{ kind: "text", name: "f.txt", content: "x" }], async () =>
    JSON.stringify({ subject: "Matematika", classroom: 8, title: "Kör" }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.scope.classroom, 8, "a modell által adott évfolyamot kell megtartani");
});

test("hiányzó osztály esetén NINCS néma alapértelmezés — a futás megáll", async () => {
  // Egy csendes `?? 4` pontosan azt a hibát hozná vissza, amit a tulajdonos
  // kifogásolt: valahonnan beállított osztály a dokumentum helyett.
  const r = await inferScope([{ kind: "text", name: "f.txt", content: "x" }], async () =>
    JSON.stringify({ subject: "Matematika", title: "Kör" }),
  );
  assert.equal(r.ok, false, "osztály nélkül nem szabad kitalálni egyet");
});
