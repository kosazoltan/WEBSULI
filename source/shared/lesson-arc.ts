import type { Block, Lesson, Section } from "./lesson-schema";
import { DEFAULT_REWARD_POLICY } from "./reward-policy";

/**
 * M-1 — a lecke didaktikai íve, gépi ellenőrzés alatt.
 *
 * Miért itt, és nem promptban. A forráshűség (`sourceOnly`, `coversConceptIds`) sem
 * promptban él ebben a repóban, hanem sémában és kapuban — mert a prompt tanács, a kapu
 * szabály. A tulajdonos 2026-09-07-én azt mérte az élesen, hogy az újabb leckék „csak
 * nyers számolgatás": felvezetés és fogalomtisztázás nélkül kérdeznek vissza. A kódból
 * ez pontosan visszakereshető volt — a blokkok SORRENDJÉT eddig semmi nem írta elő:
 *
 *   - `lesson-schema.ts`: `blocks: z.array(blockSchema).min(1)`, tetszőleges sorrend;
 *   - `buildPedagoguePrompt`: felsorolja a hat blokktípust, ívet nem ír elő;
 *   - `checkCoverageGate`: fogalmi fedettséget mér, felépítést nem.
 *
 * Ez a modul a Tananyag lap belső tanítási ívét ellenőrzi: felvezetés,
 * levezetett példa, érdemi szemléltetés, visszakérdezés és összefoglalás.
 * A külön Módszerek/Feladatok/Kvíz lapokat a lesson-experience séma és
 * ellenőrzője írja elő. A hat blokktípus önmagában nem helyettesíti őket.
 *
 * Tiszta függvény: nincs benne óra, véletlen és hálózat, így egy elutasított lecke
 * pontosan reprodukálható a JSON-jából.
 *
 * ŐSZINTE KORLÁT: ez a SZERKEZETET méri. Hogy a felvezetés érdekes-e, hogy a magyarázat
 * érthető-e, azt nem tudja eldönteni — az a prompt és a lektor dolga marad. Egy zöld
 * ív-jelentés nem minőségi bizonyítvány.
 */

/** A visszakérdezés és a számolás blokkjai — ezek a „drill". */
const DRILL_KINDS = new Set<Block["kind"]>(["check", "example"]);

/** A Tananyag lapon belüli szemléltetés; a külön módszerbank ezen felül kell. */
const ENGAGEMENT_KINDS = new Set<Block["kind"]>(["animate", "try"]);

/**
 * Meddig mehet el egy szakasz a puszta drillben.
 *
 * A 0,75 nem kerek szám kedvéért ilyen: a `explain + example + check + check`
 * felépítés — egy tanítás, egy levezetés, két kérdés — pont ennyi, és az még jó
 * tananyag. Az `explain + example + 4 × check` (0,8) viszont már gyakorlósor.
 */
export const MAX_DRILL_RATIO = 0.75;

export type ArcCode =
  | "no_opening_explain"
  | "drill_before_teaching"
  | "quiz_without_example"
  | "drill_heavy"
  | "no_engagement_layer"
  | "no_recap"
  | "proba_unreachable";

export type ArcFinding = {
  /** A szakasz sorszáma; lecke-szintű kifogásnál -1. */
  sectionIdx: number;
  code: ArcCode;
  /** Emberi mondat — ez megy a szerzőnek javító körben és a kapu indoklásába. */
  message: string;
};

export type ArcReport = {
  ok: boolean;
  findings: ArcFinding[];
  /** A kapu `reasons` tömbjébe illő, összevont mondatok. */
  reasons: string[];
};

/** A lecke-szintű kifogások szakasz-indexe. */
const LESSON_LEVEL = -1;

const firstIndexOf = (blocks: Block[], kind: Block["kind"]): number =>
  blocks.findIndex((b) => b.kind === kind);

function checkSection(section: Section, idx: number, minChecksForProba: number): ArcFinding[] {
  const found: ArcFinding[] = [];
  const blocks = section.blocks;
  const label = `„${section.heading}" (${idx + 1}. szakasz)`;

  const firstExplain = firstIndexOf(blocks, "explain");
  const firstExample = firstIndexOf(blocks, "example");
  const firstCheck = firstIndexOf(blocks, "check");

  // 1. Felvezetés. A szakasz első blokkja mondja meg, MIRŐL tanulunk. Egy ábra
  // megmutat valamit, de nem vezet fel — ezért itt kifejezetten `explain` kell.
  if (blocks[0]?.kind !== "explain") {
    found.push({
      sectionIdx: idx,
      code: "no_opening_explain",
      message: `${label}: a szakasz nem magyarázattal kezdődik, hanem „${blocks[0]?.kind ?? "üres"}" blokkal. Előbb vezesd fel, miről tanulunk.`,
    });
  }

  // 2. Tanítás a drill előtt. Ha van drill, de magyarázat egyáltalán nincs, vagy csak
  // KÉSŐBB jön, akkor a gyerek előbb kap feladatot, mint tanítást.
  const firstDrill = [firstExample, firstCheck].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (firstDrill !== undefined && (firstExplain < 0 || firstExplain > firstDrill)) {
    found.push({
      sectionIdx: idx,
      code: "drill_before_teaching",
      message: `${label}: feladat vagy kérdés áll a magyarázat előtt. A tanítás jöjjön elsőként, a számonkérés utána.`,
    });
  }

  // 3. Levezetés a visszakérdezés előtt. Ez a tulajdonos „milyen számolható elemek
  // vannak" lépése: a kvíz előtt lássa a gyerek, hogyan kell csinálni.
  if (firstCheck >= 0 && (firstExample < 0 || firstExample > firstCheck)) {
    found.push({
      sectionIdx: idx,
      code: "quiz_without_example",
      message: `${label}: a szakasz visszakérdez, de előtte nem mutat levezetett példát. Kérdés előtt mutasd meg, hogyan kell megoldani.`,
    });
  }

  // 4. Csupa drill. A tanítás nem lehet a szakasz elhanyagolható kisebbsége.
  const drill = blocks.filter((b) => DRILL_KINDS.has(b.kind)).length;
  const ratio = blocks.length > 0 ? drill / blocks.length : 0;
  if (ratio > MAX_DRILL_RATIO) {
    found.push({
      sectionIdx: idx,
      code: "drill_heavy",
      message: `${label}: a blokkok ${Math.round(ratio * 100)}%-a feladat vagy kérdés (a felső határ ${Math.round(MAX_DRILL_RATIO * 100)}%). Ez gyakorlósor, nem tananyag.`,
    });
  }

  /*
   * M-6 — a Próba legyen ELÉRHETŐ. Az M-4 óta a játékidőhöz nem elég a 100 %,
   * hanem adott számú HELYES válasz kell. Ha a szakasz ennél kevesebb kérdést
   * hoz, a gyerek hibátlanul végigmegy rajta, és mégsem kap jutalmat — ez nem
   * hibaüzenet, hanem csendben elmaradó élmény, amit csak méréssel lehet
   * észrevenni. (Próbafuttatáson pontosan ez történt, 2026-09-07.)
   *
   * Kérdés nélküli és kikapcsolt Próbájú szakaszra nem vonatkozik: ott nincs
   * mit elérni.
   */
  const checks = blocks.filter((b) => b.kind === "check").length;
  if (section.probaEnabled && checks > 0 && checks < minChecksForProba) {
    found.push({
      sectionIdx: idx,
      code: "proba_unreachable",
      message: `${label}: a szakasz ${checks} kérdést hoz, a játékidőhöz viszont ${minChecksForProba} helyes válasz kell — így a Próba hibátlan kitöltéssel sem ér jutalmat. Írj legalább ${minChecksForProba} kérdést, vagy kapcsold ki a Próbát.`,
    });
  }

  return found;
}

/** A lecke didaktikai íve: felvezetés → megmutatás → levezetés → visszakérdezés → zárás. */
export type ArcOptions = {
  /**
   * Hány kérdést hozzon egy Próbát futtató szakasz. Alapból a jutalom-tábla
   * küszöbe — így a két szabály nem tud szétcsúszni.
   */
  minChecksForProba?: number;
};

export function checkLessonArc(lesson: Lesson, options: ArcOptions = {}): ArcReport {
  const minChecksForProba =
    options.minChecksForProba ?? DEFAULT_REWARD_POLICY.minCorrectForCoupon;
  const findings = lesson.sections.flatMap((section, idx) =>
    checkSection(section, idx, minChecksForProba),
  );

  const allBlocks = lesson.sections.flatMap((s) => s.blocks);

  // 5. Figyelemfenntartó réteg. A négylapos elrendezés 2. lapja: a leckében legyen
  // legalább egy megmutató vagy kipróbálható elem. Szakaszonként nem kérjük — egy
  // rövid zárószakasz nem kell hogy animációt hozzon.
  if (!allBlocks.some((b) => ENGAGEMENT_KINDS.has(b.kind))) {
    findings.push({
      sectionIdx: LESSON_LEVEL,
      code: "no_engagement_layer",
      message:
        "A leckében egyetlen animáció vagy kipróbálható feladat sincs. A puszta szöveg és kvíz nem tartja meg a figyelmet — kell legalább egy megmutató réteg.",
    });
  }

  // 6. Zárás. A recap a lecke UTOLSÓ blokkja legyen: középre tett összefoglaló nem zár le.
  const lastSection = lesson.sections[lesson.sections.length - 1];
  const lastBlock = lastSection?.blocks[lastSection.blocks.length - 1];
  if (lastBlock?.kind !== "recap") {
    findings.push({
      sectionIdx: LESSON_LEVEL,
      code: "no_recap",
      message:
        "A lecke nem összefoglalóval zárul. Az utolsó szakasz utolsó blokkja recap legyen, hogy a gyerek lássa, mit vitt haza.",
    });
  }

  return {
    ok: findings.length === 0,
    findings,
    reasons: findings.map((f) => f.message),
  };
}

/**
 * M-3 — ugyanaz a szerződés a promptban, mint a kapuban.
 *
 * Egy helyen írjuk le, hogy a kapu és a prompt ne csússzon szét: ha a szabály változik,
 * a modell utasítása vele változik. Ha csak a kapu szigorodna, a modell javító körben
 * tanulná meg — az minden gyártásnál egy fölösleges körbe kerül.
 */
export const LESSON_ARC_CONTRACT = [
  "DIDAKTIKAI ÍV (a publikálási kapu ellenőrzi, nem tanács):",
  "A tananyag négy rétegben halad: elmélet → megmutatás → levezetés → visszakérdezés.",
  "- Minden szakasz `explain` blokkal KEZDŐDJÖN: mondd el, miről fogunk tanulni és miért. Ne kérdéssel vagy feladattal nyiss.",
  "- A magyarázat ELŐZZE MEG a feladatot és a kérdést. A gyerek előbb kapjon tanítást, mint számonkérést.",
  "- Ha a szakaszban van `check`, legyen ELŐTTE `example`: mutasd meg egy levezetett feladaton, mit lehet itt kiszámolni, és hogyan. Csak ezután jöhet a képlet-visszakérdezés.",
  `- A \`check\` és \`example\` blokkok együtt ne tegyék ki a szakasz blokkjainak több mint ${Math.round(MAX_DRILL_RATIO * 100)}%-át. A csupa feladat gyakorlósor, nem tananyag.`,
  "- A leckében legyen legalább egy `animate` vagy `try` blokk: ez tartja meg a figyelmet, és ez mutatja meg azt, amit szöveggel nehéz.",
  "- A lecke UTOLSÓ blokkja `recap` legyen, hogy a gyerek lássa, mit vitt haza.",
  `- Ha a szakasz Próbát futtat (probaEnabled), írj bele legalább ${DEFAULT_REWARD_POLICY.minCorrectForCoupon} \`check\` kérdést: a játékidő ennyi HELYES válaszhoz kötött, kevesebb kérdésnél a gyerek hibátlan Próbával sem kap jutalmat.`,
  "A száraz felsorolás nem tananyag: a magyarázat kösse a fogalmat ahhoz, amit a gyerek már tud, és mondja ki, mire jó.",
].join("\n");
