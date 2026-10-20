/**
 * Spec 2026-10-20-robot-megtekintes: a megtekintés-statisztikából kimaradó automatikus kliensek (robot, link-előnézet, parancssor).
 * Mért (7 nap): a `material_views` 490 sorából 379 robot volt (311 `meta-externalagent`), és a napi összesítő ezeket valódi
 * megtekintésként számolta. Böngésző mindig küld UA-t, ezért az üres UA is automatikusnak számít.
 * Review #335: NEM puszta „bot” részszó (a „CUBOT X30” telefonnév is tartalmazza) — ismert robot-termékazonosítók, a robotok
 * szokásos „(compatible; …bot…)” / „+http” jelölése, előnézet- és parancssori kliensek.
 */
const KNOWN_AGENTS = /googlebot|bingbot|yandexbot|duckduckbot|baiduspider|applebot|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|perplexitybot|ccbot|amazonbot|facebookexternalhit|meta-externalagent|meta-externalfetcher|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|headlesschrome|phantomjs|curl\/|wget\/|python-requests|python-urllib|node-fetch|axios\/|go-http-client|okhttp|java\/|libwww-perl/i;
const CRAWLER_MARK = /\(compatible;[^)]*(?:bot|crawler|spider)|\+https?:\/\//i;

export function isAutomatedUserAgent(ua: string | undefined): boolean {
  if (!ua || !ua.trim()) return true;
  return KNOWN_AGENTS.test(ua) || CRAWLER_MARK.test(ua);
}
