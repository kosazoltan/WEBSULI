import assert from "node:assert/strict";
import test from "node:test";

import { isBenignWebglEnvWarning } from "./support/webgl-noise";

/** S2 utójavítás — a mobil mérő csak a #425 CI-naplójából ismert két környezeti WebGL-figyelmeztetést engedi át. */
test("a két környezeti WebGL-figyelmeztetés benign", () => {
  assert.equal(
    isBenignWebglEnvWarning(
      "[]Automatic fallback to software WebGL has been deprecated. Please use the --enable-unsafe-swiftshader flag to opt in to lower security guarantees for trusted content.",
    ),
    true,
  );
  assert.equal(
    isBenignWebglEnvWarning(
      "[.WebGL-0x1234abcd]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels",
    ),
    true,
  );
});

test("az ANGLE/D3D X4122 shader-figyelmeztetés benign, a valódi shaderhiba nem", () => {
  const warn = [
    "THREE.WebGLProgram: Program Info Log: (210,91-147): warning X4122: sum of 0.996094 and -2.98545e-017 cannot be represented accurately in double precision",
    "(209,41-69): warning X4122: sum of 1 and -1.49272e-017 cannot be represented accurately in double precision",
  ].join("\n");
  assert.equal(isBenignWebglEnvWarning(warn), true);
  assert.equal(isBenignWebglEnvWarning(warn + "\n(12,3): error X3004: undeclared identifier 'foo'"), false);
  assert.equal(isBenignWebglEnvWarning("THREE.WebGLProgram: Program Info Log: error X3000: syntax error"), false);
});

test("minden más WebGL-hiba és konzolhiba továbbra is hiba", () => {
  for (const text of [
    "WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost",
    "WebGL: INVALID_OPERATION: useProgram: program not valid",
    "[.WebGL-0x1234abcd]GL Driver Message (OpenGL, Error, GL_INVALID_OPERATION, High): GL_INVALID_OPERATION",
    "[.WebGL-0x1234abcd]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): another stall",
    "THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false",
    "WARNING: Too many active WebGL contexts. Oldest context will be lost.",
    "TypeError: x is undefined",
  ]) {
    assert.equal(isBenignWebglEnvWarning(text), false, text);
  }
});
