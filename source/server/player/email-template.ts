/**
 * JM7a — a belépő levél (magyar, gyerekbarát). A link csak az átlátszatlan tokent viszi, a URL-töredékben (`#t=`), így
 * az sem a szerver-, sem a proxynaplóba nem kerül; e-mail-cím a linkben soha nincs.
 */
import { CODE_TTL_MS, LINK_TTL_MS } from "./codes";

export type PlayerLoginEmail = { subject: string; html: string; text: string };

export function playerLoginLink(baseUrl: string, linkToken: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/belepes/link#t=${linkToken}`;
}

export function buildPlayerLoginEmail(input: { code: string; link: string }): PlayerLoginEmail {
  const codeMinutes = Math.round(CODE_TTL_MS / 60_000);
  const linkMinutes = Math.round(LINK_TTL_MS / 60_000);
  const subject = `A belépőkódod: ${input.code}`;
  const text = [
    "Szia!",
    "",
    `A WebSuli játékokhoz ezzel a kóddal tudsz belépni: ${input.code}`,
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
    <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; margin: 16px 0;">${input.code}</p>
    <p>A kód ${codeMinutes} percig érvényes, és csak egyszer használható.</p>
    <p style="text-align: center; margin: 24px 0;">
      <a href="${input.link}" rel="noreferrer" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none;">Belépés egy kattintással</a>
    </p>
    <p style="font-size: 13px; color: #6b7280;">A gomb ${linkMinutes} percig működik. Ha nem te kérted, nyugodtan töröld ezt a levelet — nélküled senki nem tud belépni. Ezt a kódot ne mondd el senkinek!</p>
  </div>
</body></html>`;
  return { subject, html, text };
}
