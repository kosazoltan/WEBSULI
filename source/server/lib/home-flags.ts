/**
 * A főoldali kabala kapcsolója (terv: docs/specs/2026-11-18-kabala-fooldal.md, 4.1). A `HOME_MASCOT` környezeti változó alapból
 * KI; csak az `on` érték kapcsolja be (a repó mintája: `PLAYER_ACCOUNTS`, server/player/require-player.ts).
 *
 * A kliens a kapcsolót ÚJ hálózati kérés nélkül kapja meg: bekapcsolva a szerver egy meta-sort tesz az index.html fejébe, amelyet a
 * kliens szinkron olvas (`homeMascotEnabled`, client/src/lib/home-mascot.ts). Kikapcsolva az index.html bájtra változatlan.
 */
export const HOME_MASCOT_META = '<meta name="websuli-home-mascot" content="on">';

export function homeMascotOn(env: Record<string, string | undefined> = process.env): boolean {
  return (env.HOME_MASCOT ?? "").trim().toLowerCase() === "on";
}

/** A meta-sor beszúrása a `</head>` elé — pontosan egyszer; `</head>` nélküli szöveget nem módosít. */
export function withHomeMascotFlag(html: string): string {
  if (html.includes(HOME_MASCOT_META)) return html;
  const at = html.indexOf("</head>");
  if (at === -1) return html;
  return `${html.slice(0, at)}  ${HOME_MASCOT_META}\n  ${html.slice(at)}`;
}
