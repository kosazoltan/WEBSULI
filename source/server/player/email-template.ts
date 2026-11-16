/**
 * JM7a — a belépő levél (magyar, gyerekbarát). A link csak az átlátszatlan tokent viszi, a URL-töredékben (`#t=`), így
 * az sem a szerver-, sem a proxynaplóba nem kerül; e-mail-cím a linkben soha nincs.
 */
import { CODE_TTL_MS, LINK_TTL_MS } from "./codes";

export type PlayerLoginEmail = { subject: string; html: string; text: string };

/** A belépő link várt eredetei (a felhasználói felület domainjei). */
const EXPECTED_LINK_HOSTS = new Set(["websuli.vip", "www.websuli.vip", "websuli.org", "www.websuli.org"]);

/**
 * Biztonsági review #445 (üzemeltetés): a link alapcíme CSAK a `FRONTEND_URL`-ből jön, és csak `https://` a várt
 * felületi domainen (vagy a `CUSTOM_DOMAIN`-en). Hiányzó / más eredet → null: ilyenkor levél sem megy ki (a hívó naplóz),
 * így egy félrekonfigurált környezet nem küldhet a diáknak máshová (pl. a Render-címre) mutató belépő linket.
 */
export function playerLinkBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.FRONTEND_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const custom = env.CUSTOM_DOMAIN?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  const hostOk = EXPECTED_LINK_HOSTS.has(url.hostname) || (!!custom && (url.hostname === custom || url.hostname === `www.${custom}`));
  if (url.protocol !== "https:" || !hostOk || url.port !== "" || url.username || url.password) return null;
  return url.origin;
}

export function playerLoginLink(baseUrl: string, linkToken: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/belepes/link#t=${linkToken}`;
}

export function buildPlayerLoginEmail(input: { code: string; link: string }): PlayerLoginEmail {
  const codeMinutes = Math.round(CODE_TTL_MS / 60_000);
  const linkMinutes = Math.round(LINK_TTL_MS / 60_000);
  // 8 jegy négyes csoportokban (olvashatóbb); a beíráskor a szóköz nem számít.
  const shown = input.code.replace(/^(\d{4})(\d{4})$/, "$1 $2");
  const subject = `A belépőkódod: ${shown}`;
  const text = [
    "Szia!",
    "",
    `A WebSuli játékokhoz ezzel a kóddal tudsz belépni: ${shown}`,
    `A kód ${codeMinutes} percig érvényes, és csak egyszer használható.`,
    "",
    `Vagy kattints erre a linkre (${linkMinutes} percig jó):`,
    input.link,
    "",
    "Ha nem te kérted, nyugodtan töröld ezt a levelet — nélküled senki nem tud belépni.",
    "Ezt a kódot ne mondd el senkinek!",
  ].join("\n");
  const html = `<!DOCTYPE html>
<html lang="hu"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f9fafb; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px;">
    <h1 style="font-size: 22px; margin: 0 0 12px;">Szia!</h1>
    <p>A WebSuli játékokhoz ezzel a kóddal tudsz belépni:</p>
    <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; margin: 16px 0;">${shown}</p>
    <p>A kód ${codeMinutes} percig érvényes, és csak egyszer használható.</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${input.link}" rel="noreferrer" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Belépés a gombbal</a>
    </p>
    <p style="font-size: 13px; color: #6b7280;">A gomb ${linkMinutes} percig működik. Ha nem te kérted, nyugodtan töröld ezt a levelet — nélküled senki nem tud belépni. Ezt a kódot ne mondd el senkinek!</p>
  </div>
</body></html>`;
  return { subject, html, text };
}

function simpleHtml(title: string, paragraphs: string[], big?: string): string {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n    ");
  const code = big ? `<p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; margin: 16px 0;">${big}</p>` : "";
  return `<!DOCTYPE html>
<html lang="hu"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"></head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; background: #f9fafb; padding: 24px;">
  <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 24px;">
    <h1 style="font-size: 22px; margin: 0 0 12px;">${title}</h1>
    ${code}
    ${body}
  </div>
</body></html>`;
}

/** JM7b (review #449 A3): a fióktörlés megerősítő kódja — csak törlésre jó, belépésre nem. */
export function buildDeleteCodeEmail(input: { code: string }): PlayerLoginEmail {
  const minutes = Math.round(CODE_TTL_MS / 60_000);
  const shown = input.code.replace(/^(\d{4})(\d{4})$/, "$1 $2");
  const lines = [
    "Valaki a WebSuli játékfiókod TÖRLÉSÉT kérte.",
    `A törlés megerősítő kódja ${minutes} percig érvényes, és csak egyszer használható.`,
    "Ha nem te kérted, NE add meg senkinek ezt a kódot — a fiókod így nem törlődik. Érdemes kijelentkezned a közös eszközökön.",
  ];
  return {
    subject: `Fióktörlés megerősítése: ${shown}`,
    text: ["Szia!", "", lines[0]!, `A kód: ${shown}`, lines[1]!, "", lines[2]!].join("\n"),
    html: simpleHtml("Fióktörlés megerősítése", lines, shown),
  };
}

/** JM7b (review #449 A3): értesítő a megtörtént fióktörlésről (személyes adat a levélben nincs). */
export function buildAccountDeletedEmail(): PlayerLoginEmail {
  const lines = [
    "A WebSuli játékfiókodat töröltük: a becenevet, az avatart, az e-mail-címedet és a fiókhoz kötött adatokat eltávolítottuk, és minden eszközön kiléptettünk.",
    "Ha nem te kérted, írj nekünk — és ha szeretnél, bármikor újra regisztrálhatsz.",
  ];
  return { subject: "A játékfiókodat töröltük", text: ["Szia!", "", ...lines].join("\n"), html: simpleHtml("A játékfiókodat töröltük", lines) };
}
