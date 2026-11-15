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
