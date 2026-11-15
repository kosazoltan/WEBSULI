/**
 * A CI futtató (GPU nélküli, szoftveres WebGL) két ismert, környezeti WebGL-figyelmeztetése — nem a játék hibái.
 * A #425 PR Playwright E2E naplójából (valós kimenet):
 *   console.warning: []Automatic fallback to software WebGL has been deprecated. Please use the
 *     --enable-unsafe-swiftshader flag to opt in to lower security guarantees for trusted content.
 *   console.warning: [.WebGL-0x…]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
 * Az első a böngésző szoftveres-renderelés figyelmeztetése, a második „Performance” szintű driver-üzenet. Helyben,
 * valódi GPU-val nem jelennek meg; a CI-ban viszont minden `full` státuszú játékesetet megbuktatnának.
 *
 * Harmadik minta (csak helyi Windows-futásnál; a Linux CI-ban nincs): az ANGLE/D3D shader-fordító figyelmeztetése,
 *   THREE.WebGLProgram: Program Info Log: (210,91-147): warning X4122: sum of 1 and -1.49272e-017 cannot be
 *   represented accurately in double precision  (több sorban). Csak az a Program Info Log benign, amelynek MINDEN
 *   nem üres sora ilyen `warning X4122`; egyetlen `error` / más sor hibává teszi.
 *
 * A szűrés SZŰK: csak e három minta kivétel. Minden más WebGL-hiba (CONTEXT_LOST, shader fordítási/linkelési hiba,
 * GL_INVALID_*, "WebGL: INVALID_…", too many active WebGL contexts, a nem „Performance” típusú „GL Driver Message”)
 * továbbra is hibának számít. Tiszta, függőség nélküli függvény, hogy node-teszt alól is importálható legyen.
 */
export function isBenignWebglEnvWarning(text: string): boolean {
  if (text.includes("Automatic fallback to software WebGL has been deprecated")) return true;
  if (/GL Driver Message \(\s*[^,)]*,\s*Performance\s*,[^)]*\)\s*:?\s*GPU stall due to ReadPixels/.test(text)) return true;
  return isAngleX4122InfoLog(text);
}

const INFO_LOG_PREFIX = /^THREE\.WebGLProgram: Program Info Log:/;
const X4122_LINE =
  /^(\(\d+,\d+(-\d+)?\):\s*)?warning X4122: sum of \S+ and \S+ cannot be represented accurately in double precision$/;

function isAngleX4122InfoLog(text: string): boolean {
  if (!INFO_LOG_PREFIX.test(text)) return false;
  const lines = text
    .replace(INFO_LOG_PREFIX, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return lines.length > 0 && lines.every((l) => X4122_LINE.test(l));
}
