/**
 * Párosítási útmutató e-mailben (docs/specs/2026-10-21-tanulo-parositas.md, „Kiegészítés”): a gyerek a saját párosító gombját kapja,
 * a szülő (admin-címzett) a három utat. Tiszta függvények — a küldés a `server/learner-reports.ts`-ben.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const WRAP = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#222;max-width:560px">`;

/** A párosítatlan eszközről jött eredménylevél útmutatója (Stúdió-lecke és régi HTML-anyag). */
export const GUEST_PAIRING_HINT_HTML = `<p style="color:#555"><em>Ha ezt egyik gyermeked oldotta meg, az eszköze nincs párosítva — a saját `
  + `eszközödön Admin → Tanulók → „Párosító QR-kód”, és a gyerek a telefonja kamerájával a te képernyődről olvassa be (vagy küldd el `
  + `neki üzenetben a párosító linket); utána az eredménye a nevével érkezik, és a profiljában is megjelenik.</em></p>`;

export function childPairingGuideEmail(input: { firstName: string; pairLink: string }): { subject: string; html: string } {
  const name = esc(input.firstName);
  const link = esc(input.pairLink);
  return {
    subject: `[WebSuli] ${input.firstName}, kapcsold össze a telefonodat a WebSulival!`.slice(0, 200),
    html: `${WRAP}<p>Szia ${name}!</p>`
      + `<p>Ha a WebSuli tudja, hogy <strong>te</strong> tanulsz a telefonodon, akkor az eredményeid a te neveddel érkeznek, és a `
      + `WebSuli neked való anyagot ajánl. Ehhez egyszer össze kell kapcsolni a telefonodat (vagy tabletedet) a WebSulival:</p>`
      + `<ol><li>Nyisd meg ezt a levelet <strong>azon a telefonon</strong>, amelyen tanulni szoktál.</li>`
      + `<li>Koppints erre a gombra:</li></ol>`
      + `<p style="margin:18px 0"><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;`
      + `font-weight:bold;padding:14px 22px;border-radius:10px">Párosítom ezt az eszközt</a></p>`
      + `<ol start="3"><li>Ha a WebSuli kezdőlapja azt írja: <strong>„Szia, ${name}!”</strong>, akkor kész.</li>`
      + `<li>Ha más böngészőben is tanulsz (például Chrome, Samsung Internet, Safari), abban is nyisd meg egyszer ezt a gombot.</li></ol>`
      + `<p>Ez a link csak a tiéd — ne küldd tovább senkinek.</p>`
      + `<p style="color:#555">Tipp: vedd fel a <strong>noreply@websuli.vip</strong> címet a névjegyeid közé, hogy a napi WebSuli-levelek `
      + `ne a Spam / Promóciók mappába kerüljenek.</p></div>`,
  };
}

export function parentPairingGuideEmail(input: { names: readonly string[] }): { subject: string; html: string } {
  const list = input.names.length ? `<p><strong>Érintett tanulók:</strong> ${input.names.map(esc).join(", ")}</p>` : "";
  return {
    subject: "[WebSuli] Így párosítsd a gyerekek eszközeit",
    html: `${WRAP}<p>A WebSuli csak a <strong>párosított</strong> eszközön tanuló gyereket ismeri fel. Párosítatlan eszközön az `
      + `eredmény „Vendég tanuló” néven érkezik, és a gyerek profiljában nem jelenik meg. Minden eszközön és minden böngészőben, amelyen `
      + `a gyerek tanul, egyszer kell párosítani — háromféleképpen lehet:</p>${list}`
      + `<ol><li><strong>A gyerek saját levele:</strong> mindegyik gyerek most kapott egy levelet „Párosítom ezt az eszközt” gombbal. `
      + `A telefonján nyissa meg, és koppintson a gombra. Ha nem találja, nézze meg a Spam / Promóciók mappát.</li>`
      + `<li><strong>QR-kód a te képernyődről:</strong> a saját eszközödön (számítógép vagy a te telefonod) nyisd meg: Admin → Tanulók → `
      + `a gyerek sorában „Párosító QR-kód”. A gyerek a telefonja kamerájával olvassa be a te képernyődről, és nyissa meg a linket.</li>`
      + `<li><strong>Üzenetben:</strong> ha nincs kéznél második eszköz, az Admin → Tanulók → „Párosító link másolása” gombbal másold ki `
      + `a linket, és küldd el a gyereknek (például Messengeren vagy SMS-ben); a telefonján nyissa meg.</li></ol>`
      + `<p><strong>Ellenőrzés:</strong> párosítás után a WebSuli kezdőlapja a gyerek nevén köszön („Szia, …!”), az eredménylevél a `
      + `nevével érkezik, és a Tanulók fülön látszik a tevékenysége. Ha egy link rossz kézbe került, a „Párosítás visszavonása” gombbal `
      + `újat kaphatsz (a régi párosítások megszűnnek).</p></div>`,
  };
}

export type PairingGuideLearner = { id: string; name: string; emails: readonly string[]; pairLink: string | null };
export type PlannedMail = { to: string; subject: string; html: string; kind: "child" | "parent" };

/**
 * A kiküldendő levelek: minden címmel és érvényes linkkel rendelkező tanuló minden címére a saját gyereklevele, utána minden admin-
 * címzettnek egy szülőlevél (a tanulók nevével). Link nélküli (titok hiányzik) tanuló nem kap levelet — félrevezető gomb helyett semmit.
 */
export function planPairingGuides(learnerRows: readonly PairingGuideLearner[], admins: readonly string[], firstNameOf: (full: string) => string): PlannedMail[] {
  const reachable = learnerRows.filter(l => l.emails.length > 0 && l.pairLink);
  const child = reachable.flatMap(l => [...new Set(l.emails.map(e => e.trim().toLowerCase()).filter(Boolean))]
    .map(to => ({ to, kind: "child" as const, ...childPairingGuideEmail({ firstName: firstNameOf(l.name), pairLink: l.pairLink! }) })));
  const parent = reachable.length ? parentPairingGuideEmail({ names: reachable.map(l => l.name) }) : null;
  return [...child, ...(parent ? [...new Set(admins)].map(to => ({ to, kind: "parent" as const, ...parent })) : [])];
}
