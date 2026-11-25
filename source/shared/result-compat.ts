/** R12: a teljes eredmény-API szerződése, nem a szerver telepítési verziója. */
export const RESULT_API_VERSION = 2;
export function supportsResultApi(response: { resultApi?: unknown }): boolean {
  return response?.resultApi === RESULT_API_VERSION;
}
