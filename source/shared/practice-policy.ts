/**
 * TANANYAG-GYAKORLATI P1 (docs/specs/2026-11-26-tananyag-gyakorlati.md): közös mérce a tananyag gyakorlatiasságához.
 *
 * Tételenként egy elsődleges tanulói művelet:
 * - `alkalmazas` — a válaszhoz konkrét mondaton, adaton, helyzeten vagy példányon kell műveletet végezni (kiegészítés, kiválasztás,
 *   javítás, döntés, számolás, helyzethez illesztés);
 * - `fogalmi` — nevet, jelentést, szabályt, képletet idéz fel;
 * - `meta` — a feladatlap összeállítására, pontozására, feladattípusaira, vizsgaszerkezetére kérdez (ilyen nem kerülhet a leckébe);
 * - `bizonytalan` — a szövegből automatikusan nem dönthető (a nevezőben marad, az alkalmazási számlálót nem emeli).
 *
 * A modell saját `intent` címkéje NEM bizonyíték (a `fixQuizIntent` váltakozva tölti). Kvíznél a kérdés + opciók, nyílt feladatnál a
 * kérés + minta számít. A meta-minták determinisztikusak, kötelező negatív kontrollokkal (sportpontszám, geometriai pont, versenypontos
 * szöveges feladat). Tulajdonosi döntés (2026-11-26): bankonként KÜLÖN 60–75% igazolt alkalmazás, célérték kétharmad.
 */

export const PRACTICE_POLICY_VERSION = "2026-11-26.1";
export type PracticeKind = "alkalmazas" | "fogalmi" | "meta" | "bizonytalan";
export type PracticeVerdict = { kind: PracticeKind; reason: string; version: string };

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();

/** A feladatlap / vizsga szerkezetére utaló környezet (önmagában nem meta — kérdező résszel együtt az). */
const META_CONTEXT =
  /(feladatlap|feladatsor|feladatt[ií]pus|feladatfajt|javítási útmutató|értékelési útmutató|pontozási útmutató|javítókulcs|vizsgaszerkezet|felvételi|\ba feladatban\b|\bebben a feladatban\b|\bez a feladat\b|\ba feladat\b(?= (?:a|az|hány|mennyit))|\bezen a lapon\b|\ba lapon\b|tesztlap)/;
/** A kérdező rész: pontszám, típus, összetétel, sorrend, időkeret. */
const META_ASK =
  /(hány pont|pontot ér|pontszám|pont jár|maximális pont|összesen \d* ?pont|pontoz|mennyit ér|milyen (?:két |három |négy )?(?:feladat)?(?:típus|fajt)|melyik feladatt[ií]pus|szerepel|\bvannak\b|található|hányadik feladat|sorrendje|felépítés|időkeret|hány perc|csoport)/;
/** Közvetlen meta-alakok (környezet nélkül is). */
const META_DIRECT = /(feladatt[ií]pus|feladatfajt)\w* .*(pont|ér\b)|javítási útmutató szerint/;
/** Vizsga / feladatlap környezet — a „hány pontot ér” csak ezzel együtt meta (review #625: a sportpont tanítható tartalom). */
const EXAM = /(feladatlap|feladatsor|felvételi|vizsg|dolgozat|\bteszt|\bitem|javítási|értékelési|pontozási|\ba feladat\b|feladatban|feladatt[ií]pus)/;
/** Sport / játék pontszáma — tanítható tartalom, nem a feladatlap pontozása. */
const SPORT = /(kosár|labd|foci|futball|meccs|mérkőzés|gól|büntető|tenisz|játszmá|verseny|sport|dobó|dobott)/;
/** A feladatlap szerkezetére kérdező erős alak — konkrét adat (szám, idézet) mellett is meta (review #625). */
const META_STRUCT = /(feladatt[ií]pus|hány feladat|időkeret|hány perc|felépítés|hányadik feladat)/;
const POINT_OPTION = /^\d+(?:[,.]\d+)? ?pont/;
/** Pontszerzésre kérdez (nem a geometriai pontra): „hány pontot kap / ér”, „pont jár”, „pontot szerez”. */
// TG-P4b: lookbehind nélkül — a modul a P4b-vel a kliens csomagjába is bekerül (Safari < 16.4, tests/no-lookbehind-client.test.ts).
const SCORE_ASK = /(pontot (?:kap|ér|szerez|kaphat)|pont jár|hány pontot\b|mennyit ér|(?:^|[^\p{L}])ér(?![\p{L}]))/u;

/** Erős fogalmi (felidéző) alakok — a konkrét anyag (idézet) jelenléte sem teszi alkalmazássá: a jelentés felidézése fogalmi. */
const RECALL =
  /^(mit jelent|mi a jelentése|mi(?:t)? nevezünk|minek nevezzük|hogyan nevezzük|mi a neve|mi a (?:szabály|definíció|meghatározás)|melyik (?:meghatározás|definíció)|mi a különbség|melyik fogalom|melyik (?:képlet|műveletsor|szabály)\w* (?:adja|írja le|érvényes)|miért)|jelentése\b|nevezzük\b|képlete\b|definíció/;

/** Alkalmazási jelek: konkrét anyag (idézet, hiány, adat) vagy cselekvő ige. */
const APPLY_VERB =
  /(egészítsd ki|válaszd ki|javítsd|számold ki|számítsd ki|döntsd el|húzd|párosítsd|rendezd|melyik (?:mondat|alak|szó|változat|sortörés|elválasztás|helyzet|példa|írásmód)\w*|helyesen|helyes (?:alak|elválasztás|írásmód)|melyik helyes|illik|mekkora|mennyi|hány \w+ (?:lett|maradt|kell|van)|összesen|melyik a (?:helyes|jó)|hogyan változik)/;
const QUOTED = /[„"“*'‘][^„"“”*'’]{2,}[”"“*'’]/;
/** Kérdőszóval kezdődő, önálló (helyzet nélküli) kérdés — felidézés. */
const WH = /^(?:(?:legalább|legfeljebb|körülbelül) )?(mi\b|mit\b|mik\b|mire|mivel|miben|miből|mitől|minek|mikor|melyik|mely\b|milyen|hány\b|hányféle|hányszor|hol\b|honnan|hová|ki\b|kik\b|kinek|kiknek|kitől|kiből|kivel|hogyan|hogy mondod|meddig|merre|mennyi ideig|what|which|why|how|who|where|when)/;
/** Konkrét példány az opciókban (szám, művelet). */
const INSTANCE_OPTION = /\d|[+−×÷=<>]/;
const GAP = /_{3,}/;
const DIGIT = /\d/;

function classifyText(text: string, opts: { options?: string[]; format?: string } = {}): PracticeVerdict {
  const t = norm(text);
  const options = (opts.options ?? []).map(norm);
  const v = (kind: PracticeKind, reason: string): PracticeVerdict => ({ kind, reason, version: PRACTICE_POLICY_VERSION });

  // Leírt feladat típusának felismerése (pl. „… Melyik feladattípus ez?”): besorolás — fogalmi, nem a feladatlapra kérdez.
  if (/melyik (?:feladatt[ií]pus|ütközéstípus|típus) ez\??$/.test(t) && t.length > 60) return v("fogalmi", "leírt eset típusának besorolása");
  if (META_DIRECT.test(t)) return v("meta", "a feladatlap pontozására / feladattípusára kérdez");
  const exam = EXAM.test(t) && !SPORT.test(t);
  if (exam && /hány pontot ér/.test(t)) return v("meta", "a feladatlap pontozására kérdez");
  if (exam && /(feladatlap|feladatsor|felvételi|vizsg|dolgozat)/.test(t) && META_STRUCT.test(t)) return v("meta", "a feladatlap / vizsga szerkezetére kérdez");
  // Konkrét adatos szöveges feladat („6 doboz… ebben a feladatban”) nem a feladatlapra kérdez.
  const concrete = (t.match(/\d+/g) ?? []).length >= 2 && !/\bpont/.test(t);
  if (!concrete && !QUOTED.test(text) && META_CONTEXT.test(t) && META_ASK.test(t)) return v("meta", "a feladatlap / vizsga szerkezetére kérdez");
  if (!concrete && META_CONTEXT.test(t) && /\bpont/.test(t) && META_ASK.test(t)) return v("meta", "a feladatlap pontozására kérdez");
  // review #629: csak PONTSZERZÉSRE kérdezve (pontot kap / ér / jár / szerez) — a „Hány pont határoz meg egy egyenest?” geometria.
  if (options.length >= 2 && options.every((o) => POINT_OPTION.test(o)) && !DIGIT.test(t) && !SPORT.test(t) && SCORE_ASK.test(t)) return v("meta", "pontérték-opciók konkrét adat nélkül");

  // Képlet / definíció hiányzó tagja: felidézés (review #625); egyéb hiányos szöveg kiegészítése alkalmazás.
  // review #625/2: az egyenlőségjel csak SZÁM NÉLKÜLI (szimbolikus) képletnél felidézés — a „12 + ___ = 20” konkrét számolás.
  const symbolicFormula = /=/.test(t) && !DIGIT.test(t.replace(/_{3,}/g, ""));
  if ((opts.format === "fillGap" || GAP.test(t)) && (symbolicFormula || /képlet|nevezzük|jelent|definíció|meghatároz/.test(t))) return v("fogalmi", "képlet / definíció hiányzó tagjának felidézése");
  if (opts.format === "fillGap" || GAP.test(t)) return v("alkalmazas", "kiegészítés konkrét szövegben");
  if (RECALL.test(t)) return v("fogalmi", "jelentés / név / szabály felidézése");
  // review #625: a formátum (number / oddOneOut) önmagában nem bizonyíték — a szöveg dönt.
  if (APPLY_VERB.test(t)) return v("alkalmazas", "konkrét anyagon végzett művelet");
  if (QUOTED.test(text) || (DIGIT.test(t) && /\?/.test(t))) return v("alkalmazas", "konkrét anyagra (idézet / adat) épülő kérdés");
  // Helyzet + kérdés: a kérdés előtt legalább egy teljes, 4+ szavas mondat írja le az esetet → a tanuló a tudását a helyzetre alkalmazza.
  const sentences = t.replace(/([.!?:])\s+/g, "$1\n").split("\n").filter(Boolean);
  if (sentences.length >= 2 && sentences.slice(0, -1).some((s) => s.split(" ").length >= 4)) return v("alkalmazas", "leírt helyzetre alkalmazott tudás");
  const after = t.split(/:\s+/)[1];
  if (after && after.split(" ").length >= 3) return v("alkalmazas", "a kérdés konkrét szövegrészletre vonatkozik");
  if (/^(melyik|mely)/.test(t) && options.length >= 2 && options.filter((o) => INSTANCE_OPTION.test(o)).length >= Math.ceil(options.length / 2)) return v("alkalmazas", "konkrét példányok közül választ");
  if (WH.test(t)) return v("fogalmi", "helyzet nélküli kérdőszavas kérdés (felidézés)");
  return v("bizonytalan", "a szövegből nem dönthető el");
}

export function classifyQuizItem(item: { question: string; options?: string[]; format?: string; intent?: string }): PracticeVerdict {
  return classifyText(item.question, { options: item.options, format: item.format });
}

/**
 * TG-P4a (docs/specs/2026-11-26-tananyag-gyakorlati-p4a-vegrehajtas.md): a bankcsomag elfogadásának meta-kapuja — a feladatlapra /
 * felvételire kérdező tétel (pontozás, feladattípus, felépítés) javító fordulót kap. Csak a modell kimenetére (gyártás); a mentett
 * leckék olvasását nem érinti.
 */
export function practiceMetaProblems(packet: { quiz?: Array<{ id?: string; question: string; options?: string[]; format?: string }>; tasks?: Array<{ id?: string; q: string; sample?: string }> }): string[] {
  const fix = "a feladatlapra / pontozásra / feladattípusra kérdez — cseréld a tanított tartalomra vonatkozó gyakorlati tételre (pl. konkrét mondaton / adaton döntés, kiegészítés, javítás)";
  return [
    // review #629: `<tételazonosító>: …` — a `repairPermissions` (célzott csere) ÉS a `salvagePacket` (tartalékos kivétel) is a tételhez
    // köti; azonosító nélkül a `quiz.N` / `tasks.N` útvonal (csak a célzott csere ismeri).
    ...(packet.quiz ?? []).flatMap((it, i) => (classifyQuizItem(it).kind === "meta" ? [`${it.id ?? `quiz.${i}`}: ${fix}`] : [])),
    ...(packet.tasks ?? []).flatMap((t, i) => (classifyOpenTask(t).kind === "meta" ? [`${t.id ?? `tasks.${i}`}: ${fix}`] : [])),
  ];
}

export function classifyOpenTask(task: { q: string; sample?: string }): PracticeVerdict {
  const r = classifyText(task.q);
  // review #629: a tanuló válaszának pontozása („… Hány pontot kap?”, minta: „1 pont”) nyílt feladatként is meta.
  const qn = norm(task.q);
  if (task.sample && POINT_OPTION.test(norm(task.sample)) && SCORE_ASK.test(qn) && !SPORT.test(qn)) return { ...r, kind: "meta", reason: "a tanuló válaszának pontozására kérdez" };
  if (r.kind !== "bizonytalan" || !task.sample) return r;
  // A minta konkrét alakot ad (pl. elválasztott szó, szám) — a kérés önmagában nem döntött.
  return DIGIT.test(task.sample) || /-/.test(task.sample) ? { ...r, kind: "alkalmazas", reason: "a minta konkrét alakot / adatot kér" } : r;
}

/**
 * A tulajdonosi döntés szerinti cél egy `n` tételes bankra, ha `pairs` kötelező fejezet–fogalom pár mindegyikéhez felidéző tétel kell:
 * alsó határ ceil(0,60·n), felső floor(0,75·n), célérték kerekített kétharmad; legfeljebb n − pairs lehet alkalmazó — ha ez az alsó
 * határ alatt van, az eredmény „fogalompár által korlátozott”.
 */
export function practiceTarget(n: number, pairs: number): { lower: number; upper: number; goal: number; max: number; limited: boolean } {
  const lower = Math.ceil(0.6 * n), upper = Math.floor(0.75 * n), max = Math.max(0, n - pairs);
  return { lower, upper, goal: Math.min(Math.round((2 * n) / 3), max), max, limited: max < lower };
}

/**
 * TG-P4b kapcsoló: `STUDIO_PRACTICE_QUOTA=on` mellett kéri és ellenőrzi a gyártás a csomagkvótát (alapból KI → a gyártás változatlan;
 * élesítés a deploy után, a többi Stúdió-kapcsolóhoz hasonlóan).
 */
export const practiceQuotaEnabled = (env: NodeJS.ProcessEnv = process.env) => env.STUDIO_PRACTICE_QUOTA === "on";

/** TG-P4b: a csomag (vagy bank) gyakorlati sávja — korlátozott kvízcsomagnál (N − C < 60%) a fogalompár-maximum a cél. */
type QuotaBand = { min: number; max: number; goal: number };
export function practiceQuota(quizN: number, pairs: number, taskN: number): { quiz: QuotaBand; tasks: QuotaBand } {
  // review #631: a felső határ a fogalompár-maximumnál (N − C) sem lehet nagyobb; min ≤ max; a cél (kétharmad) a sávba szorítva.
  const band = (x: ReturnType<typeof practiceTarget>): QuotaBand => {
    const max = Math.min(x.upper, x.max), min = Math.min(x.lower, max);
    return { min, max, goal: Math.min(max, Math.max(min, x.goal)) };
  };
  return { quiz: band(practiceTarget(quizN, pairs)), tasks: band(practiceTarget(taskN, 0)) };
}

/** TG-P4b: a bankcsomag-szerződés számszerű gyakorlati sora (a program ugyanezt méri a `practiceQuotaProblems`-szel). */
export function practiceQuotaLine(quizN: number, pairs: number, taskN: number): string {
  const { quiz, tasks } = practiceQuota(quizN, pairs, taskN);
  return `GYAKORLATI ARÁNY (a program méri; a nem egyértelmű tétel nem számít): quiz: legalább ${quiz.min}, legfeljebb ${quiz.max} igazolt alkalmazás (cél: ${quiz.goal}) (konkrét példán döntés, kiegészítés, számolás, javítás) a ${quizN} tételből, a többi a fejezet fogalmainak felidézése; tasks: legalább ${tasks.min}, legfeljebb ${tasks.max} alkalmazó feladat (cél: ${tasks.goal}) a ${taskN}-ból.`;
}

/** TG-P4b: csomagszintű kvóta-ellenőrzés a gyártáskor — kevés vagy a sávnál több igazolt alkalmazás javító kört kap. */
export function practiceQuotaProblems(packet: { quiz?: Array<{ question: string; options?: string[]; format?: string }>; tasks?: Array<{ q: string; sample?: string }> }, pairs: number): string[] {
  const quiz = packet.quiz ?? [], tasks = packet.tasks ?? [];
  const quota = practiceQuota(quiz.length, pairs, tasks.length);
  const check = (bank: "quiz" | "tasks", n: number, a: number, r: { min: number; max: number }): string[] =>
    a < r.min ? [`${bank}: ${n} tételből ${a} igazolt alkalmazás; legalább ${r.min} kell — cserélj fogalmi felidézést konkrét példán végzett döntésre, kiegészítésre, számolásra vagy javításra (a fejezet fogalmait így is fedd le)`]
    : a > r.max ? [`${bank}: ${n} tételből ${a} igazolt alkalmazás; legfeljebb ${r.max} lehet — a fejezet fogalmainak felidézésére is kell hely`] : [];
  return [
    ...check("quiz", quiz.length, quiz.filter((it) => classifyQuizItem(it).kind === "alkalmazas").length, quota.quiz),
    ...check("tasks", tasks.length, tasks.filter((t) => classifyOpenTask(t).kind === "alkalmazas").length, quota.tasks),
  ];
}

export type BankAudit = {
  total: number;
  counts: Record<PracticeKind, number>;
  ratio: number;
  target: ReturnType<typeof practiceTarget>;
  /** `meta` — van meta-tétel; `teljesul` — az alkalmazás a [alsó, felső] sávban (korlátnál a maximum); `alacsony` — alatta;
   *  `magas` — a felső (75%) határ fölött: a szükséges fogalmi tudás hiányzik (review #625). */
  status: "meta" | "teljesul" | "alacsony" | "magas" | "ures";
  items: Array<{ id: string; kind: PracticeKind; reason: string }>;
};

type ExperienceLike = {
  quiz: Array<{ id?: string; question: string; options?: string[]; format?: string; intent?: string; sectionIndex?: number; coversConceptIds?: string[] }>;
  tasks: Array<{ id?: string; q: string; sample?: string; sectionIndex?: number; coversConceptIds?: string[] }>;
  bankPlan?: { units?: Array<{ sectionIndex: number; conceptIds: string[] }> };
};

function bank(items: Array<{ id: string; verdict: PracticeVerdict }>, pairs: number): BankAudit {
  const counts: Record<PracticeKind, number> = { alkalmazas: 0, fogalmi: 0, meta: 0, bizonytalan: 0 };
  for (const it of items) counts[it.verdict.kind]++;
  const total = items.length, target = practiceTarget(total, pairs);
  const need = target.limited ? target.max : target.lower;
  const status = total === 0 ? "ures" : counts.meta > 0 ? "meta" : counts.alkalmazas < need ? "alacsony"
    // review #625/2: korlátozott banknál a fogalompár-maximum, egyébként a felső (75%) határ fölött `magas`.
    : counts.alkalmazas > (target.limited ? target.max : target.upper) ? "magas" : "teljesul";
  return {
    total, counts, ratio: total ? Math.round((1000 * counts.alkalmazas) / total) / 1000 : 0, target, status,
    items: items.map((i) => ({ id: i.id, kind: i.verdict.kind, reason: i.verdict.reason })),
  };
}

/** Csak olvasó audit: a lecke kvíz- és nyílt bankja külön (egy összevont átlag nem fedheti el egy túl lexikális bankot). */
export function auditExperience(e: ExperienceLike): { version: string; quiz: BankAudit; tasks: BankAudit } {
  const pairs = e.bankPlan?.units
    ? e.bankPlan.units.reduce((s, u) => s + u.conceptIds.length, 0)
    : new Set(e.quiz.flatMap((x) => (x.coversConceptIds ?? []).map((c) => `${x.sectionIndex ?? 0}:${c}`))).size;
  return {
    version: PRACTICE_POLICY_VERSION,
    quiz: bank(e.quiz.map((x, i) => ({ id: x.id ?? `quiz[${i}]`, verdict: classifyQuizItem(x) })), pairs),
    tasks: bank(e.tasks.map((x, i) => ({ id: x.id ?? `tasks[${i}]`, verdict: classifyOpenTask(x) })), 0),
  };
}

/** TG-P4c: a végleges bank rövid jelentése (a job kimenetébe; tételazonosító-lista nélkül). */
export type PracticeBankReport = Pick<BankAudit, "total" | "counts" | "status"> & { lower: number; upper: number; limited: boolean };
export type FinalPracticeReport = {
  report: { version: string; quiz: PracticeBankReport; tasks: PracticeBankReport };
  /** Látható minőségi jelzések (`qualityNotes`): sáv alatt / felett, fogalompár által korlátozott bank (tájékoztató). */
  notes: Array<{ reason: "practice_low" | "practice_high" | "practice_limited"; note: string }>;
  /** A végleges bankba került meta-tételek (`<azonosító>: <ok>`) — a kapcsoló mellett a végkapu ezen megáll. */
  metaProblems: string[];
};

/**
 * TG-P4c: a VÉGLEGES (tartalékos kivétel, vakellenőrzés, lektori javítás és összeillesztés utáni) bank mérése — a csomagkapu (P4a/P4b)
 * az átvételt kapuzza, ez a kiadott leckét. Bankonként külön (a nyílt bank aránya külön teljesítendő).
 */
export function finalPracticeReport(e: ExperienceLike | null | undefined): FinalPracticeReport | null {
  if (!e) return null;
  const audit = auditExperience(e);
  const short = (b: BankAudit): PracticeBankReport => ({ total: b.total, counts: b.counts, status: b.status, lower: b.target.lower, upper: b.target.upper, limited: b.target.limited });
  const notes: FinalPracticeReport["notes"] = [];
  for (const [label, b] of [["kvíz", audit.quiz], ["nyílt feladat", audit.tasks]] as const) {
    const pct = b.total ? Math.round((100 * b.counts.alkalmazas) / b.total) : 0;
    if (b.status === "alacsony") notes.push({ reason: "practice_low", note: `A ${label}bankban ${b.counts.alkalmazas}/${b.total} (${pct}%) igazolt alkalmazás — a cél ${b.target.limited ? `a fogalompár-maximum (${b.target.max})` : `${b.target.lower}–${b.target.upper}`}.` });
    else if (b.status === "magas") notes.push({ reason: "practice_high", note: `A ${label}bankban ${b.counts.alkalmazas}/${b.total} (${pct}%) alkalmazás — a fogalmi felidézésre kevés hely maradt (legfeljebb ${b.target.limited ? b.target.max : b.target.upper}).` });
    else if (b.status === "teljesul" && b.target.limited) notes.push({ reason: "practice_limited", note: `A ${label}bank fogalompár által korlátozott: ${b.counts.alkalmazas}/${b.total} alkalmazás az elérhető maximum (a 60% a kötelező fogalompárok mellett nem érhető el).` });
  }
  const metaProblems = [...audit.quiz.items, ...audit.tasks.items].filter((i) => i.kind === "meta").map((i) => `${i.id}: ${i.reason} — a kiadott bankban nem lehet a feladatlapra / pontozásra kérdező tétel`);
  return { report: { version: audit.version, quiz: short(audit.quiz), tasks: short(audit.tasks) }, notes, metaProblems };
}
