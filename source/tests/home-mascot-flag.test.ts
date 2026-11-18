import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOME_MASCOT_META, homeMascotOn, withHomeMascotFlag } from "../server/lib/home-flags";

// docs/specs/2026-11-18-kabala-fooldal.md 4.1 (K2): a HOME_MASCOT kapcsoló alapból KI; csak az „on” kapcsol.
test("K2: a kapcsoló alapból KI, és csak az „on” érték kapcsolja be (kis-nagybetűtől, szóköztől függetlenül)", () => {
  assert.equal(homeMascotOn({}), false);
  for (const value of ["", "off", "0", "1", "true", "yes", "onn", "o n"]) assert.equal(homeMascotOn({ HOME_MASCOT: value }), false, value);
  for (const value of ["on", "ON", " On "]) assert.equal(homeMascotOn({ HOME_MASCOT: value }), true, value);
});

test("K2: a meta-sor a </head> elé kerül, pontosan egyszer; a többi bájt változatlan", () => {
  const html = "<!DOCTYPE html>\n<html>\n  <head>\n    <title>x</title>\n  </head>\n  <body><div id=\"root\"></div></body>\n</html>\n";
  const flagged = withHomeMascotFlag(html);
  assert.equal(flagged.split(HOME_MASCOT_META).length - 1, 1);
  assert.ok(flagged.indexOf(HOME_MASCOT_META) < flagged.indexOf("</head>"));
  assert.equal(flagged.replace(`  ${HOME_MASCOT_META}\n  `, ""), html, "a sor eltávolítása után az eredeti marad");
  assert.equal(withHomeMascotFlag(flagged), flagged, "másodszor nem szúr be");
});

test("K2: </head> nélküli szöveg változatlan (nem talál ki helyet)", () => {
  assert.equal(withHomeMascotFlag("<p>nincs fej</p>"), "<p>nincs fej</p>");
  assert.equal(withHomeMascotFlag(""), "");
});

test("K2: a valódi index.html-re is beszúrható (van </head>), és a sablon magától NEM tartalmazza a sort", () => {
  const template = readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
  assert.equal(template.includes("websuli-home-mascot"), false, "kikapcsolva az index.html érintetlen");
  assert.ok(withHomeMascotFlag(template).includes(HOME_MASCOT_META));
});

test("K2: a szerver a kapcsoló nélkül a régi úton szolgál ki (a megjelölt index csak bekapcsolva készül)", () => {
  const source = readFileSync(new URL("../server/vite.ts", import.meta.url), "utf8");
  assert.match(source, /const flaggedIndex = homeMascotOn\(\) \? withHomeMascotFlag\(/);
  assert.match(source, /if \(flaggedIndex\) app\.get\(\["\/", "\/index\.html"\]/);
});
