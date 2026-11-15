/**
 * A CI futtató (GPU nélküli, szoftveres WebGL) két ismert, környezeti WebGL-figyelmeztetése — nem a játék hibái.
 * A #425 PR Playwright E2E naplójából (valós kimenet):
 *   console.warning: []Automatic fallback to software WebGL has been deprecated. Please use the
 *     --enable-unsafe-swiftshader flag to opt in to lower security guarantees for trusted content.
 *   console.warning: [.WebGL-0x…]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels
 * Az első a böngésző szoftveres-renderelés figyelmeztetése, a második „Performance” szintű driver-üzenet. Helyben,
 * valódi GPU-val nem jelennek meg; a CI-ban viszont minden `full` státuszú játékesetet megbuktatnának.
 *
 * A szűrés SZŰK: csak e két minta kivétel. Minden más WebGL-hiba (CONTEXT_LOST, shader fordítási/linkelési hiba,
 * GL_INVALID_*, "WebGL: INVALID_…", too many active WebGL contexts, a nem „Performance” típusú „GL Driver Message”)
 * továbbra is hibának számít. Tiszta, függőség nélküli függvény, hogy node-teszt alól is importálható legyen.
 */
export function isBenignWebglEnvWarning(text: string): boolean {
  if (text.includes("Automatic fallback to software WebGL has been deprecated")) return true;
  return /GL Driver Message \(\s*[^,)]*,\s*Performance\s*,[^)]*\)\s*:?\s*GPU stall due to ReadPixels/.test(text);
}
