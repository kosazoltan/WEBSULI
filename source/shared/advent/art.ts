/**
 * Adventi naptár — a képhelyek jegyzéke (docs/specs/2026-11-18-adventi-naptar.md 13.3, 13.4, 14.5): azonosító, végső méret és
 * magyar `alt` szöveg. A feliratok itt, kódban élnek — a képeken nincs szöveg. A díszítőelemek `alt`-ja üres.
 * Amíg egy tétel nincs az `ADVENT_ART` jegyzékben (art-manifest.ts), a felület azonos méretű helyőrzőt mutat.
 */
/** `maxBytes`: a kész WebP bájtcélja (terv 13.3, 14.5; A41) — az `approve-advent.ts` ehhez igazítja a minőséget, a teszt őrzi. */
export type AdventArtSpec = { width: number; height: number; alt: string; placeholder: string; maxBytes: number };

const KB = 1024;
/** A teljes készlet bájtkerete (terv 13.3: ≤ 1,1 MB). */
export const ADVENT_ART_TOTAL_MAX_BYTES = Math.round(1.1 * KB * KB);

/** A 24 ablak motívuma (a nap sorszáma szerint): megnevezés az `alt`-hoz és egy jel a helyőrzőhöz. */
export const ADVENT_DOOR_MOTIFS: ReadonlyArray<{ alt: string; placeholder: string }> = [
  { alt: "Hópehely.", placeholder: "❄️" },
  { alt: "Havas fenyőfa.", placeholder: "🌲" },
  { alt: "Adventi koszorú négy gyertyával.", placeholder: "🕯️" },
  { alt: "Égő gyertya fenyőággal.", placeholder: "🕯️" },
  { alt: "Puttony ajándékokkal, almával és dióval.", placeholder: "🧺" },
  { alt: "A Mikulás piros köpenyben, püspöksüveggel.", placeholder: "🎅" },
  { alt: "Fa szánkó a havas domboldalon.", placeholder: "🛷" },
  { alt: "Rénszarvas csengővel a nyakában.", placeholder: "🦌" },
  { alt: "Hóember répaorral és piros sállal.", placeholder: "⛄" },
  { alt: "Egy pár régi korcsolya.", placeholder: "⛸️" },
  { alt: "Mézeskalács szívek és csillagok.", placeholder: "🍪" },
  { alt: "Dió és piros alma fatálban.", placeholder: "🍎" },
  { alt: "Harang két kis csengővel és piros szalaggal.", placeholder: "🔔" },
  { alt: "Fagyöngycsokor piros masnival.", placeholder: "🌿" },
  { alt: "Szaloncukor a fenyőágon.", placeholder: "🍬" },
  { alt: "Diós és mákos bejgli szeletek.", placeholder: "🥮" },
  { alt: "Havas falusi templom világos ablakkal.", placeholder: "⛪" },
  { alt: "Karácsonyi angyal csengővel.", placeholder: "👼" },
  { alt: "Pásztorok a bárányokkal a csillag alatt.", placeholder: "🐑" },
  { alt: "A háromkirályok ajándékokkal követik a csillagot.", placeholder: "👑" },
  { alt: "A betlehemi csillag a havas háztetők fölött.", placeholder: "🌟" },
  { alt: "Piros ajándékdoboz arany masnival.", placeholder: "🎁" },
  { alt: "Feldíszített karácsonyfa gyertyákkal és szaloncukorral.", placeholder: "🎄" },
  { alt: "Betlehemi jászol a kis Jézussal, fölötte a csillag.", placeholder: "⭐" },
];

export const doorArtId = (day: number): string => `advent-door-${String(day).padStart(2, "0")}`;

export const ADVENT_ART_SPECS: Readonly<Record<string, AdventArtSpec>> = {
  "advent-bg-portrait": { width: 1080, height: 1920, alt: "", placeholder: "", maxBytes: 150 * KB },
  "advent-bg-landscape": { width: 1600, height: 900, alt: "", placeholder: "", maxBytes: 150 * KB },
  "advent-closing": { width: 1200, height: 900, alt: "A kivilágított falu szenteste, a téren karácsonyfa ragyogó csillaggal.", placeholder: "🎄", maxBytes: 120 * KB },
  "advent-home-banner": { width: 1600, height: 400, alt: "", placeholder: "", maxBytes: 60 * KB },
  "advent-garland": { width: 1200, height: 675, alt: "", placeholder: "", maxBytes: 25 * KB },
  "advent-frame": { width: 256, height: 256, alt: "", placeholder: "", maxBytes: 15 * KB },
  ...Object.fromEntries(ADVENT_DOOR_MOTIFS.map((motif, index) => [doorArtId(index + 1), { width: 256, height: 256, alt: motif.alt, placeholder: motif.placeholder, maxBytes: 25 * KB }])),
};
