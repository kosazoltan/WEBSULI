import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { lessonStudioView, ONE_STEP_ONLY_FIELDS, oneStepSubmitDisabledReason } from "../shared/studio-ui";

/**
 * LS-8 (#191) — a tulajdonos panasza: „Még mindig külön el kell készítenem a
 * tudástárat ahhoz, hogy tananyagot készíthessek… Én csak annyit szeretnék
 * látni, hogy töltsön föl a képeket, és utána a kész tananyagot."
 *
 * MÉRVE (2026-09-06): a háttérfolyamat ezt már tudta (LS-6 one-step + #189
 * autonóm kapuk) — a hiba TISZTÁN a menüszervezésben volt: az egygombos űrlap
 * (`SourceUploadForm`) a „Tudás-térkép" fül alatt lakott, a „Lecke készítése"
 * fül pedig egy JÓVÁHAGYOTT térkép kiválasztását követelte. Így a kész
 * automatizmus elérhetetlen volt arról a menüpontról, ahol keresni kell.
 */

test("a tananyagkészítés alapértelmezésben feltöltés-módban indul", () => {
  const v = lessonStudioView({ maps: [] });
  assert.equal(v.mode, "upload", "az alapértelmezett út a feltöltés, nem a térkép-választás");
  assert.equal(v.showMapPicker, false, "a térkép-választó nem az elsődleges felület");
});

test("üres tudástár esetén NINCS zsákutca — a feltöltés akkor is működik", () => {
  // A #157-es hiba mintája: egy üres állapot, ami olyan lépésre mutat, ami
  // ezen a felületen nem elérhető.
  const v = lessonStudioView({ maps: [] });
  assert.equal(v.mode, "upload");
  assert.equal(v.emptyStateIsDeadEnd, false);
});

test("a meglévő térképek nem tűnnek el, csak másodlagos útra kerülnek", () => {
  const v = lessonStudioView({ maps: [{ id: "m1", subject: "matek", classroom: 4, title: "Kör" }] });
  assert.equal(v.mode, "upload", "térkép megléte sem viszi vissza a választót elsődlegesbe");
  assert.equal(v.advancedAvailable, true, "a kurátori út megmarad, elrejtve");
  assert.equal(v.mapCount, 1);
});

test("a feltöltéshez CSAK fájl kell — tantárgy/osztály nem kötelező", () => {
  // A gép ismeri fel a scope-ot (inferScope); ha a tulajdonosnak kézzel kellene
  // megadnia, az újra egy emberi kapu lenne.
  assert.deepEqual(ONE_STEP_ONLY_FIELDS, ["files"]);
});

test("a tananyagkészítés fül önmagában tartalmazza a feltöltő űrlapot", () => {
  // Statikus kötés: a panel tényleg rendereli a SourceUploadFormot. Enélkül a
  // fenti nézet-modell igaz lehetne, miközben a UI a régi marad.
  const panel = readFileSync(
    new URL("../client/src/components/studio/LessonStudioPanel.tsx", import.meta.url),
    "utf8",
  );
  const code = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /<SourceUploadForm/, "a Lecke készítése panel rendereli a feltöltő űrlapot");
});

test("üres osztály-mező nem küld NaN-t a szervernek", () => {
  // MÉRVE (böngészős render, 1280px): az osztály-mező `4`-et mutatott, miközben
  // a felirat szerint nem kötelező — ezért üresen hagyhatóvá tettük. Ha viszont
  // a felhasználó tantárgyat ír osztály NÉLKÜL, a payload NaN-t vinne.
  const form = readFileSync(
    new URL("../client/src/components/studio/SourceUploadForm.tsx", import.meta.url),
    "utf8",
  );
  const code = form.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(
    code,
    /\{ \.\.\.\(title\.trim\(\) !== "" \? \{ title: title\.trim\(\) \} : \{\}\), files \}/,
    "a forrásalapú gyártás payloadja sem üres, sem kézzel megadott osztályt nem küld",
  );
});

test("az egylépéses gomb NEM követel tantárgyat/osztályt", () => {
  assert.equal(oneStepSubmitDisabledReason("", Number.NaN, 1), null, "csak fájl kell");
  assert.equal(
    oneStepSubmitDisabledReason("", Number.NaN, 0),
    "Tölts fel legalább egy forrásfájlt.",
    "fájl nélkül viszont blokkol",
  );
});

test("a ?tab=knowledge-maps deep link a tananyagkészítésre irányít, nem esik a 'files' fülre", () => {
  // MÉRVE (m6 túlélő mutáció): enélkül a régi link némán a 'files' fülre esik
  // vissza — a repo ismert hiba-osztálya (validTabs-ból kihagyott érték).
  const admin = readFileSync(new URL("../client/src/pages/admin.tsx", import.meta.url), "utf8");
  const code = admin.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(
    code,
    /tabParam\s*===\s*"knowledge-maps"\s*\?\s*"lesson-studio"/,
    "a knowledge-maps deep linket a lesson-studio fülre kell fordítani",
  );
  assert.match(
    code,
    /initialAdvanced=\{studioAdvancedInitial\}/,
    "a deep link a haladó blokkot nyitva kell megnyissa",
  );
});

test("az admin tab-lista nem kínál külön tudás-térkép menüpontot", () => {
  const admin = readFileSync(new URL("../client/src/pages/admin.tsx", import.meta.url), "utf8");
  const code = admin.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(
    code,
    /<TabsTrigger\s+value="knowledge-maps"/,
    "a tudás-térkép nem külön menüpont többé",
  );
  // A deep link viszont NEM törhet el (repo-tapasztalat: a validTabs-ból
  // kihagyott érték némán a 'files' fülre esik vissza).
  assert.match(code, /"knowledge-maps"/, "a ?tab=knowledge-maps deep link maradjon érvényes");
});
