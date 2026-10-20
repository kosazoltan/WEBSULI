/**
 * Spec 2026-10-20-robot-megtekintes: a megtekintés-statisztikából kimaradó automatikus kliensek (robot, link-előnézet, parancssor).
 * Mért (7 nap): a `material_views` 490 sorából 379 robot volt (311 `meta-externalagent`), és a napi összesítő ezeket valódi
 * megtekintésként számolta. Böngésző mindig küld UA-t, ezért az üres UA is automatikusnak számít.
 */
const AUTOMATED = /bot|crawl|spider|facebookexternalhit|meta-externalagent|slurp|preview|headless|curl\/|wget\/|python-requests|node-fetch|go-http-client|okhttp|java\//i;

export function isAutomatedUserAgent(ua: string | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return AUTOMATED.test(ua);
}
