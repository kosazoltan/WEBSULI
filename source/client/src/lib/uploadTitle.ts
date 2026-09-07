/**
 * T-5 — a feltöltött tananyag címe a DOKUMENTUMBÓL jöjjön, ne a fájlnévből.
 *
 * A feltöltő űrlap eddig a fájlnevet ajánlotta címnek (kiterjesztés levágva). A
 * fájlnevek jellemzően „biztonságos", ékezet nélküli alakban készülnek, és az
 * ajánlott címet ritkán írja át bárki — így kerültek ki élesbe az olyan címek,
 * mint „25. Betegseg, gyogyulas - 4. osztaly tananyag", miközben ugyanannak a
 * dokumentumnak a `<title>`-je rendes magyar szöveg volt.
 *
 * A sorrend: `<title>` → első `<h1>` → fájlnév. A fájlnév azért marad utolsó
 * tartaléknak, mert egy cím nélküli dokumentum feltöltése nem akadhat el.
 */

/** A generátorok alapértelmezett címei — ezek nem mondanak semmit a tartalomról. */
const BOILERPLATE = new Set([
  "document",
  "untitled",
  "untitled document",
  "new document",
  "új dokumentum",
  "uj dokumentum",
  "index",
  "html",
  "page",
  "oldal",
  "cím nélkül",
]);

/** A cím-jelöltek alsó és felső határa. */
const MIN_LENGTH = 3;
const MAX_LENGTH = 200;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  ouml: "ö",
  uacute: "ú",
  uuml: "ü",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Ouml: "Ö",
  Uacute: "Ú",
  Uuml: "Ü",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body] ?? whole;
  });
}

/** Jelölés nélküli, egy sorba húzott szöveg. */
function plainText(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A hosszú címet szóhatáron vágja. A szó közepén vágott cím olvashatatlan, és a
 * listában úgy néz ki, mintha elromlott volna az adat.
 */
function clamp(text: string): string {
  if (text.length <= MAX_LENGTH) return text;
  const cut = text.slice(0, MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > MAX_LENGTH * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

function usable(candidate: string): string | null {
  const text = clamp(candidate);
  if (text.length < MIN_LENGTH) return null;
  if (BOILERPLATE.has(text.toLowerCase())) return null;
  return text;
}

/** A fájlnév kiterjesztés nélkül; ha az sincs, egy semleges alapérték. */
function fromFileName(fileName: string): string {
  const bare = fileName.replace(/\.(html?|htm)$/i, "").trim();
  return bare.length > 0 ? clamp(bare) : "Névtelen tananyag";
}

/**
 * A feltöltött HTML dokumentum ajánlott címe.
 *
 * @param html a beolvasott dokumentum forrása
 * @param fileName a böngészőtől kapott fájlnév (végső tartalék)
 */
export function titleFromHtmlDocument(html: string, fileName: string): string {
  // A kommentekben és a script/style blokkokban álló jelölés nem a dokumentum
  // címe — enélkül egy kikommentezett régi cím írná felül az igazit.
  const source = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1];
  const fromTitle = titleTag ? usable(plainText(titleTag)) : null;
  if (fromTitle) return fromTitle;

  const h1Tag = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(source)?.[1];
  const fromH1 = h1Tag ? usable(plainText(h1Tag)) : null;
  if (fromH1) return fromH1;

  return fromFileName(fileName);
}
