import type { MapConcept } from "./coverage";

/**
 * #196 — MEGALAPOZOTTSÁG: a `coversConceptIds` címke állítás, nem bizonyíték.
 *
 * MÉRVE ÉLESBEN (Kristóf-lecke, 2026-09-06, map c53973f8): a feltöltött forrás
 * 8. osztályos geometria volt (T = a·ma/2, K = d·π, körgyűrű, körcikk), a
 * tudás-térkép ezt helyesen kivonatolta, a szerző mégis 4. osztályos
 * helyiértéket írt — és a fedettségi kapu `core 7/7`, `supporting 15/15`,
 * `ok: true` értékkel átengedte. Ok: a kapu KIZÁRÓLAG az ID-címkéket számolta
 * (`ids.has(c.localId)`), a blokk szövegét soha nem nézte. A modell ráírta a
 * „Háromszög területe" (C01) címkét egy helyiérték-magyarázatra.
 *
 * Ez a modul a címkét a blokk SZÖVEGÉHEZ köti: egy fogalom csak akkor számít
 * tanítottnak, ha a fogalom megnevezésének érdemi szavai meg is jelennek a
 * blokkban. Így a „megkerülöm a forrást, de ráírom a címkét" út zárva van.
 *
 * Szándékosan determinisztikus (nincs modellhívás): egy kapunak, ami a
 * hallucinációt fogja, nem szabad maga is hallucinálnia.
 */

/** Ékezetlenített, kisbetűs alak — a magyar ragozás miatt szótő-egyezést nézünk. */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Magyar toldalékok miatt a teljes szóegyezés túl szigorú („terület" vs
 * „területét"). A szó első 5 karaktere elég megkülönböztető ehhez a feladathoz,
 * és nem ad hamis találatot a fogalmak között (mérve: „terulet" vs „teglalap").
 */
const STEM_LEN = 5;
const stem = (word: string): string => word.slice(0, STEM_LEN);

/** A fogalom megnevezésének érdemi szavai — a rövid kötőszavak nem számítanak. */
function significantWords(term: string): string[] {
  return normalizeText(term)
    .split(" ")
    .filter((w) => w.length >= 3);
}

/**
 * Megalapozott-e a címke: a fogalom megnevezésének MINDEN érdemi szava
 * megjelenik-e a blokk szövegében (szótő szinten).
 *
 * A „minden szó" szándékosan szigorú: a „Kör területe" fogalmat nem alapozza meg
 * önmagában a „terület" szó egy téglalapos mondatban — pontosan ez a
 * félrecímkézés volt az élő hiba.
 */
export function checkGrounding(blockText: string, concept: MapConcept): boolean {
  // #196: `term` nélkül a megalapozottság NEM MÉRHETŐ (régi fixture-ök, régi
  // térkép-sorok). Ilyenkor nem buktatunk vakon — egy kapu, ami mérés nélkül
  // mond ítéletet, ugyanolyan hazug, mint amelyik mérés nélkül átenged.
  // A hívó (`groundingReport`) ezért csak a `term`-mel rendelkező fogalmakat adja ide.
  const words = significantWords(concept.term ?? "");
  if (words.length === 0) return false;

  const haystack = normalizeText(blockText);
  // Egy pár szavas blokk nem taníthat fogalmat, bármit is állít a címke.
  if (haystack.split(" ").filter(Boolean).length < 4) return false;

  const stems = new Set(haystack.split(" ").filter(Boolean).map(stem));
  return words.every((w) => stems.has(stem(w)));
}

export type UngroundedClaim = {
  blockIndex: number;
  kind: string;
  conceptId: string;
  term: string;
  excerpt: string;
};

export type GroundingReport = {
  ok: boolean;
  ungrounded: UngroundedClaim[];
  /** A blokkok által ténylegesen (megalapozottan) tanított fogalom-azonosítók. */
  groundedIds: string[];
  /**
   * Hány címke volt egyáltalán MÉRHETŐ (van `term`). Ha ez 0, a kapu erről a
   * leckéről nem mondott ítéletet — ezt látni kell, nem elrejteni egy zöld
   * eredmény mögé.
   */
  measurable: number;
};

/** A blokk minden szöveges mezője — a fogalom bárhol megjelenhet benne. */
export function blockText(block: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["text", "question", "problem", "caption", "answer", "prompt"]) {
    const v = block[key];
    if (typeof v === "string") parts.push(v);
  }
  for (const key of ["steps", "options"]) {
    const v = block[key];
    if (Array.isArray(v)) parts.push(...v.filter((x): x is string => typeof x === "string"));
  }
  // The runtime displays these fields inside try.spec; ids/hidden answers are not evidence.
  if (block.kind === "try" && block.spec && typeof block.spec === "object") {
    const spec = block.spec as Record<string, unknown>;
    if (block.tryKind === "fillBlank" && typeof spec.text === "string") parts.push(spec.text);
    if (block.tryKind === "dragSort" && Array.isArray(spec.items)) {
      parts.push(...spec.items.filter((x): x is string => typeof x === "string"));
    }
    if (block.tryKind === "match" && Array.isArray(spec.pairs)) {
      for (const pair of spec.pairs) {
        if (pair && typeof pair.left === "string" && typeof pair.right === "string") parts.push(pair.left, pair.right);
      }
    }
  }
  return parts.join(" ");
}

/**
 * Végigméri a lecke blokkjait: melyik `coversConceptIds` címke van megalapozva a
 * blokk saját szövegében, és melyik nem.
 */
export function groundingReport(
  blocks: Array<Record<string, unknown>>,
  concepts: MapConcept[],
): GroundingReport {
  const byId = new Map(concepts.map((c) => [c.localId, c]));
  const ungrounded: UngroundedClaim[] = [];
  const groundedIds = new Set<string>();
  let measurable = 0;

  blocks.forEach((block, blockIndex) => {
    const ids = Array.isArray(block.coversConceptIds)
      ? (block.coversConceptIds as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    if (ids.length === 0) return;

    const text = blockText(block);
    for (const id of ids) {
      const concept = byId.get(id);
      // Ismeretlen id: azt a meglévő unknownIds-ág kezeli, itt nem duplázzuk.
      if (!concept) continue;
      // #196: `term` nélkül nincs mit összevetni a szöveggel. Ilyenkor a
      // fogalom kimarad a mérésből — sem nem buktat, sem nem igazol. Ez NEM
      // csendes átengedés: a `measurable` számláló jelzi, mekkora részt mértünk,
      // és a régi (term nélküli) sorok migrációval kapnak megnevezést.
      if (!concept.term || concept.term.trim() === "") continue;
      measurable += 1;
      if (checkGrounding(text, concept)) {
        groundedIds.add(id);
      } else {
        ungrounded.push({
          blockIndex,
          kind: typeof block.kind === "string" ? block.kind : "?",
          conceptId: id,
          term: concept.term ?? id,
          excerpt: text.slice(0, 120),
        });
      }
    }
  });

  return { ok: ungrounded.length === 0, ungrounded, groundedIds: [...groundedIds], measurable };
}
