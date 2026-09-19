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
    .replace(/π/g, " pi ")
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
    .filter((w) => w.length >= 3 || w === "pi");
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

  const tokens = haystack.split(" ").filter(Boolean);
  const stems = new Set(tokens.map(stem));

  /*
   * M-5 (2026-09-07, próbafuttatáson mérve) — a RÖVID fogalomszavak ragozott
   * alakja eddig sosem egyezett. A `stem` az első 5 karaktert veszi, tehát a
   * három betűs „kör" („kor") sosem lett azonos a „körön" ötkarakteres tövével
   * („koron"). Hosszú szavaknál a vágás elvégzi a dolgát („terület"/„területét"
   * → „terul"), rövideknél viszont bármilyen toldalék elrontotta a mérést.
   *
   * A következmény nem apró: a kapu így a SZÁRAZ, kulcsszó-ismétlő szöveget
   * jutalmazta — a szerzőnek szó szerint bele kellett írnia a fogalom ragtalan
   * nevét. Épp azt a stílust kényszerítette ki, amit a tananyagon kifogásoltunk.
   *
   * A lazítás korlátja a KONJUNKCIÓ: a fogalom MINDEN érdemi szavának meg kell
   * lennie, ezért egy véletlen előtag-egyezés („korszak" a „kör"-re) önmagában
   * nem alapoz meg semmit.
   */
  const present = (word: string): boolean => {
    if (stems.has(stem(word))) return true;
    // Rövid szó (kör, sík, tér): a ragozott alak eleje egyezzen.
    if (word.length < STEM_LEN) return tokens.some((t) => t.startsWith(word));
    // Hosszabb szó: állhat ÖSSZETÉTEL belsejében is („összterülete", „alapterület").
    return tokens.some((t) => t.includes(stem(word)));
  };

  if (words.every(present)) return true;
  // Spec 2026-09-19 (mérve: UK-földrajz futás, angol forrás → magyar lecke): a fogalom NEVE a
  // forrás nyelvén van („The United Kingdom (UK)"), a tanítás magyarul („Egyesült Királyság").
  // A kurált magyar DEFINÍCIÓ érdemi szavai ugyanúgy a forrásból jönnek: ha azok legalább fele
  // (min. 2, vagy mind, ha rövidebb) a blokk saját szövegében áll, a címke megalapozott.
  const defWords = significantWords(concept.definition ?? "").filter((w) => !STOP_WORDS.has(w));
  if (defWords.length > 0) {
    const need = defWords.length < 2 ? defWords.length : Math.max(2, Math.ceil(defWords.length / 2));
    if (defWords.filter(present).length >= need) return true;
  }
  // Mérve (run 525b2797, Műveleti sorrend, 2026-09-19): a fogalom maga a forrás KIDOLGOZOTT
  // PÉLDÁJA („Zárójeles szorzás és osztás példája", idézet: „36 ÷ (3 · 2) – 3 …"), a blokk
  // ugyanezt a példát tanítja — a címke szavai („zárójeles", „példája") mégsem állnak a
  // szövegben, és a kapu egy teljes szerzői kört kért érte. Ha a forrás-idézet legalább két
  // különböző számot tartalmaz, és azok ≥ 75 %-a a blokkban is szerepel, a blokk a forrás
  // példáját dolgozza ki: megalapozott.
  return quoteNumbersPresent(concept.quote ?? concept.definition ?? "", haystack);
}

/** Distinct numeric tokens of the source quote found in the block text (≥2 numbers, ≥75 % present). */
export function quoteNumbersPresent(quote: string, normalizedBlockText: string): boolean {
  // Digit runs only: `normalizeText` splits "3,5" into "3 5", so decimals compare part by part.
  const numbers = [...new Set(quote.match(/\d+/g) ?? [])];
  if (numbers.length < 2) return false;
  const tokens = new Set(normalizedBlockText.split(" ").filter(Boolean));
  const hits = numbers.filter((n) => tokens.has(n)).length;
  return hits >= Math.ceil(numbers.length * 0.75);
}

const STOP_WORDS = new Set(["egy", "hogy", "nem", "van", "vagy", "mint", "ami", "amely", "azt", "ezt", "the", "and", "with", "from", "that", "this", "are", "for", "also", "which", "into", "has", "have", "más", "több", "csak", "még", "már", "pedig", "mert", "után", "előtt", "között", "szerint", "akkor", "olyan", "ilyen", "minden", "való"]);

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
  // ProcessAnim renders its steps; arbitrary hidden animation metadata is not evidence.
  if (block.kind === "animate" && block.animKind === "process" && block.params && typeof block.params === "object") {
    const steps = (block.params as Record<string, unknown>).steps;
    if (Array.isArray(steps)) parts.push(...steps.filter((x): x is string => typeof x === "string"));
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

export type StrippedAnimateLabel = { sectionIndex: number; blockIndex: number; conceptId: string; term: string };

/**
 * Spec 2026-09-19 — az animációs blokk kozmetika (#169), a címkéje nem taníthat.
 *
 * Mérve élesben (PDF-próbafutás 3ed5ca90, 3 szerzői kör után `gate:error`): a
 * folyamatábra feliratában „talajképződés" állt, a címkézett fogalom neve
 * „A talaj kialakulása" — szinonima, a szóegyezés téves pozitívja, és a teljes
 * lecke elbukott. Az animációs blokk címkéiből ezért determinisztikusan kikerül,
 * amit a blokk saját szövege nem támaszt alá; a címke nélkül maradó blokk eltűnik.
 * A tanító blokkok (explain/example/…) megalapozottságát ez NEM érinti — azok
 * továbbra is a kapun mérődnek.
 */
export function stripUngroundedAnimateLabels<L extends { sections: Array<{ blocks: Array<Record<string, unknown>> }> }>(
  lesson: L,
  concepts: MapConcept[],
): { lesson: L; stripped: StrippedAnimateLabel[] } {
  const byId = new Map(concepts.map((c) => [c.localId, c]));
  const stripped: StrippedAnimateLabel[] = [];
  const sections = lesson.sections.map((section, sectionIndex) => {
    const blocks = section.blocks.flatMap((block, blockIndex) => {
      if (block.kind !== "animate" || !Array.isArray(block.coversConceptIds)) return [block];
      const text = blockText(block);
      const kept = (block.coversConceptIds as unknown[]).filter((id): id is string => {
        if (typeof id !== "string") return false;
        const concept = byId.get(id);
        // Unknown ids and term-less concepts are the coverage gate's business, not ours.
        if (!concept || !concept.term || concept.term.trim() === "") return true;
        if (checkGrounding(text, concept)) return true;
        stripped.push({ sectionIndex, blockIndex, conceptId: id, term: concept.term });
        return false;
      });
      if (kept.length === (block.coversConceptIds as unknown[]).length) return [block];
      return kept.length ? [{ ...block, coversConceptIds: kept }] : [];
    });
    return { ...section, blocks: blocks.length ? blocks : section.blocks };
  });
  return { lesson: stripped.length ? { ...lesson, sections } : lesson, stripped };
}
