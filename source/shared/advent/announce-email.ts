/**
 * S8 — az adventi értesítő levél tárgya és HTML-sablona (tiszta függvény; docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md S8).
 * A leiratkozási mód a meglévő értesítőkét követi („leiratkozhatsz a platformon belül”, server/resend.ts).
 */
export const ADVENT_ANNOUNCE_PATH = "/adventi-naptar";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function adventAnnounceEmail(input: { season: number; baseUrl: string }): { subject: string; html: string } {
  const url = `${input.baseUrl.replace(/\/+$/, "")}${ADVENT_ANNOUNCE_PATH}`;
  const subject = `Kinyílt a WebSuli adventi naptára (${input.season})`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">`
    + `<h2 style="margin:0 0 8px">Kinyílt a WebSuli adventi naptára!</h2>`
    + `<p style="margin:0 0 12px">December 1-jétől 24-éig minden nap kinyílik egy új ablak, mögötte egy játékos kérdéssel a gyerek évfolyamához `
    + `igazítva. Aki minden ablakot kinyit, karácsonykor egy kis meglepetést is talál.</p>`
    + `<p style="margin:0 0 16px">Az első osztályosoknak a kérdést a naptár fel is olvassa.</p>`
    + `<p style="margin:0 0 20px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;`
    + `padding:10px 18px;border-radius:6px;font-weight:bold">Irány a naptár</a></p>`
    + `<p style="margin:0;color:#777;font-size:13px">Ha nem szeretnél több értesítést kapni, leiratkozhatsz a platformon belül.</p></div>`;
  return { subject, html };
}
