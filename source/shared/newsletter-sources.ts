/**
 * „Mai felfedezés” hírlevél (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md, S2): az engedélyezett magyar forrásoldalak.
 * Tulajdonosi döntés 2026-10-19: a listát Claude állítja össze. Minden domain 2026-10-19-én https-en elérhető, magyar nyelvű
 * nyitóoldallal ellenőrizve. A felnőtt életmód-magazinok szándékosan kimaradtak. A keresés ezekre szűr
 * (OpenAI web_search `filters.allowed_domains`, ≤ 100), és a szerver minden URL-t újra ellenőriz (`isAllowedArticleUrl`).
 */
export const NEWSLETTER_DOMAINS = [
  // Történelem
  "mult-kor.hu", "rubicon.hu", "ujkor.hu",
  // Tudomány, természet, ismeretterjesztés
  "ng.hu", "qubit.hu", "tudomany.hu", "mta.hu", "csillagaszat.hu",
  // Közlekedés, repülés, honvédelem (technika és történelem)
  "kozlekedesimuzeum.hu", "airportal.hu", "honvedelem.hu",
  // Járművek és műszaki világ
  "totalcar.hu", "vezess.hu", "autonavigator.hu", "mobilarena.hu", "telefonguru.hu", "prohardver.hu", "pcworld.hu",
  // Országos hírportálok tudomány-, kultúra- és utazásrovatai (pl. K-pop, Korea)
  "index.hu", "telex.hu", "24.hu", "hvg.hu", "origo.hu", "hirado.hu",
] as const;

/** Igaz, ha https, és a host egy engedélyezett domain vagy annak aldomainje. */
export function isAllowedArticleUrl(url: string): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  return NEWSLETTER_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}
