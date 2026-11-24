/**
 * Adventi naptár — végpontok (docs/specs/2026-11-18-adventi-naptar.md R8, 16.1, 16.5, 18.2; végrehajtás „S2b”, 5. kiegészítés).
 *
 * A kérdést a SZERVER osztja ki és pontozza; a helyes válasz csak a válasz UTÁN megy ki. Minden író kérés CSRF-tokenes (a közös
 * köztes réteg, server/routes.ts), a tanulói token és az eszközazonosító a kérés TÖRZSÉBEN megy (olvasásnál fejlécben), URL-be
 * soha. A modul a naplóba csak hibaosztályt ír — tokent, eszközazonosítót, nevet nem.
 */
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import rateLimit from "express-rate-limit";
import {
  adventLayout, buildAdventPlan, findAdventItem, gradePick, optionOrder, repairPlanDoor, toClientQuestion,
  type AdventBankItem, type AdventItem, type AdventPlan, type ChristmasItem,
} from "../../shared/advent/assignment";
import { adventNow, isAdventWritable, isDoorUnlocked, type AdventNow } from "../../shared/advent/calendar";
import {
  adventAnswerBody, adventDayParam, adventDeviceId, adventGradeBody, adventIdentityBody,
  type AdventAnswerResult, type AdventDoorView, type AdventOpenResult, type AdventState,
} from "../../shared/advent/contract";
import {
  ADVENT_DOORS, ADVENT_RULES, adventClosing, adventSummary, clampAdventGrade, doorState, isChristmasDoor, limitsForGrade,
  type AdventSummary, type DoorAttempt, type DoorRecord,
} from "../../shared/advent/rules";
import { clientIpKeyGenerator } from "../lib/client-ip";
import { logger } from "../lib/logger";
import type { AdventResolution, AdventResolvedSubject } from "./identity";
import { ADVENT_LIMITS, createWindowCounter, type AdventLimits } from "./limits";
import { createAdoptionContext, mergeAdoption, orderKeyFor, planGradeOf, usedForRepair, usedInEarlierRounds, withPlanMeta, type AdoptionContext } from "./adoption";
import type { AdoptionRequest, AdventRow, AdventStore, AdventSubject } from "./store";


export type AdventRouterDeps = {
  store: AdventStore;
  bank: readonly AdventBankItem[];
  christmas: readonly ChristmasItem[];
  /** A funkció be van-e kapcsolva (flag). Az admin előnézet routere mindig `true`-t ad (terv 16.5). */
  enabled: () => boolean;
  /** A naptár órája; `null` = a naptár kikapcsoltként viselkedik (e2e-mód tesztidő nélkül). */
  clock: (req: Request) => Date | null;
  resolve: (req: Request, input: { learnerToken?: unknown; device?: unknown }) => Promise<AdventResolution>;
  /**
   * Ha az óra nem ad időt (`clock` → null), a „nem létezik” (404) helyett EZ a válasz — a végső kezelőben, hogy a köztes lépések
   * (és az admin-őr mátrixtesztje) változatlanok maradjanak. Az admin-előnézet használja (érvénytelen dátum → 400; terv 16.5).
   */
  invalidClock?: { status: number; message: string };
  /** A kéréskorlátok (alap: `ADVENT_LIMITS`); tesztben kisebb értékkel adható meg. */
  limits?: AdventLimits;
  /**
   * Minden rögzített válasz és minden átvétel után (nem várjuk meg): az S5 innen dönt a szülői levélről (terv 18.1). Az előnézeti
   * routerben nincs bekötve.
   */
  onResult?: (event: { row: AdventRow; subject: AdventResolvedSubject; summary: AdventSummary; maxRounds: number; phase: AdventNow["phase"] }) => void;
};

class AdventHttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) { super(message); this.name = "AdventHttpError"; }
}

/**
 * A tárolt sor alakja ép-e (vak ellenőr k3): a körönkénti terv objektum \`doors\` objektummal és \`layout\` (1…24 permutáció) tömbbel, a próbák
 * tömbök. Felhasználói bemenettel ilyen sor nem állítható elő; sérült sornál 500 helyett érthető 409 megy ki.
 */
export function adventRowIsSound(row: AdventRow | null): boolean {
  if (!row) return true;
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!isObject(row.plan) || !isObject(row.doors)) return false;
  for (const plan of Object.values(row.plan)) {
    if (!isObject(plan) || !isObject(plan.doors) || !Array.isArray(plan.layout) || !isObject(plan.subjects)) return false;
    if (!Object.values(plan.subjects).every((subject) => typeof subject === "string")) return false;
    // Az ablakrács az 1…24 permutációja (PR-C 3. vak L4): a kliens a `layout` minden elemére egy ablakot rajzol a teljes ablaklistából —
    // tartományon kívüli, ismétlődő vagy hiányzó elem renderhibát / eltűnő rácsot okozna.
    const layout = plan.layout as unknown[];
    if (layout.length !== ADVENT_DOORS || new Set(layout).size !== ADVENT_DOORS) return false;
    if (!layout.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= ADVENT_DOORS)) return false;
    // Minden nap kulcsa megvan, legalább egy kérdéssel (PR-B 4. kör L5): a hiányzó nap megnyitáskor 500-at okozna.
    for (let day = 1; day <= ADVENT_DOORS; day++) {
      const ids = (plan.doors as Record<string, unknown>)[String(day)];
      if (!Array.isArray(ids) || ids.length === 0) return false;
    }
    for (const ids of Object.values(plan.doors)) if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) return false;
  }
  // A próbák belső alakja is (GPT-vak L4): egy [null] vagy hiányos elem a pontozásnál 500-at okozna.
  const isAttempt = (a: unknown): boolean => isObject(a) && typeof a.questionId === "string" && Number.isInteger(a.pick) && typeof a.correct === "boolean";
  for (const round of Object.values(row.doors)) {
    if (!isObject(round)) return false;
    for (const door of Object.values(round)) if (!isObject(door) || !Array.isArray(door.attempts) || !door.attempts.every(isAttempt)) return false;
  }
  return true;
}
const CORRUPT_MESSAGE = "A naptárad mentésében hibát találtunk — kérj segítséget egy felnőttől (a naptárat a gondozó tudja helyrehozni).";

/** A naplóba csak a hiba osztálya kerül (üzenet, paraméter nem — abban azonosító lehetne). */
function errorClass(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z0-9_]{1,60}$/.test(name) ? name : "Error";
}

const subjectKeyOf = (subject: AdventSubject) => `${subject.kind}:${subject.id}`;
const ALL_DAYS = Array.from({ length: ADVENT_DOORS }, (_, i) => i + 1);

/** Az alany rögzült évfolyama: ami a sorban van; különben a tanuló profilja; játékosnál / eszköznél a megadásig nincs. */
export function effectiveGrade(subject: AdventResolvedSubject, row: AdventRow | null): number | null {
  if (row?.grade != null) return clampAdventGrade(row.grade);
  return subject.grade != null ? clampAdventGrade(subject.grade) : null;
}

function doorView(day: number, at: AdventNow, grade: number | null, plan: AdventPlan | undefined, record: DoorRecord | undefined, maxRepairs: number): AdventDoorView {
  const attempts = record?.attempts ?? [];
  const state = doorState({ unlocked: isDoorUnlocked(day, at), attempts, maxRepairs });
  const subject = attempts.length > 0 && plan ? plan.subjects?.[day] ?? null : grade != null && isChristmasDoor(day, grade) ? "christmas" : null;
  return { day, state, subject, repairsLeft: state === "repairable" ? maxRepairs - attempts.length + 1 : 0 };
}

/**
 * A naptár teljes állapota egy alanynak (írás nélkül számolható). \`adoptionPending\`: párosított eszközön a nézet egy még nem mentett
 * átvétel előnézete (PR-C vak L2); \`nextRoundAvailable: false\`: a következő kör ismétlés nélkül már nem építhető fel, ezért nem
 * ajánljuk fel (PR-C vak L1) — a router méri a valódi bankkal.
 */
export function buildAdventState(at: AdventNow, resolution: AdventResolution, row: AdventRow | null, extra: { adoptionPending?: boolean; nextRoundAvailable?: boolean; version?: number; asOf?: number } = {}): AdventState {
  const subject = resolution.subject;
  const grade = subject ? effectiveGrade(subject, row) : null;
  const round = row?.round ?? 1;
  const limits = grade != null ? limitsForGrade(grade) : { maxRepairs: ADVENT_RULES.maxRepairs, maxRounds: ADVENT_RULES.maxRounds };
  const plan = row?.plan[round];
  const records = row?.doors[round] ?? {};
  const doors = ALL_DAYS.map((day) => doorView(day, at, grade, plan, records[day], limits.maxRepairs));
  const summary = adventSummary(records, limits.maxRepairs);
  const waiting = doors.filter((d) => d.state === "open").length;
  return {
    enabled: true,
    season: at.season, phase: at.phase, today: at.today, openDay: at.openDay, nextOpensAt: at.nextOpensAt, nextOpensInMs: at.nextOpensInMs, refreshInMs: at.refreshInMs, daysUntilStart: at.daysUntilStart,
    identity: subject?.kind ?? null,
    pairing: resolution.pairing,
    firstName: subject?.firstName ?? null,
    grade,
    needsGrade: subject != null && grade == null,
    round, maxRounds: limits.maxRounds,
    // Terv nélkül is a végleges (kevert) elrendezés: a rács az első megnyitás után sem rendeződik át (vak ellenőr S1).
    layout: plan?.layout ?? (subject && grade != null ? adventLayout(at.season, round, subjectKeyOf(subject), grade) : ALL_DAYS),
    doors, summary,
    closing: adventClosing(summary, { round, maxRounds: extra.nextRoundAvailable === false ? round : limits.maxRounds, phase: at.phase, waiting }),
    adoptionPending: extra.adoptionPending ?? false,
    // A szerververzió (PR-C 3. vak L1): a tárolt sor utolsó módosítása; az átvétel előnézeténél a két tárolt sor újabbika.
    version: extra.version ?? (row ? row.updatedAt.getTime() : 0),
    // A válasz szerverpillanata (S5/S6 1. vak L4): egyenlő sorverziónál a régebbi pillanat (pl. zárás előtti válasz) a régebbi.
    asOf: extra.asOf ?? 0,
  };
}

/** Az évad korábbi köreiben már kiosztott kérdések (azonosító és normalizált prompt). */

/**
 * Egy (tárolt vagy friss) próba eredménye. Ha a kérdés közben eltűnt a bankból (`item` null), a tárolt próba alapján csak az
 * eredmény megy ki: helyes válasz és magyarázat nélkül (`correctIndex: -1`) — hiba helyett (review C5).
 */
function answerResult(item: AdventItem | null, attempt: DoorAttempt, orderKey: string, season: number, door: AdventDoorView, state: AdventState, recorded = true): AdventAnswerResult {
  const correctIndex = item ? gradePick(item, optionOrder(item.id, orderKey, season), attempt.pick).correctIndex : -1;
  return { correct: attempt.correct, correctIndex, explanation: item?.explanation ?? "", pick: attempt.pick, recorded, door, doors: state.doors, summary: state.summary, closing: state.closing, version: state.version, asOf: state.asOf };
}

type Locals = { at: AdventNow; now: Date; resolution: AdventResolution; body: Record<string, unknown>; pairedDevice?: string | null };

const anyAttempt = (row: AdventRow): boolean => Object.values(row.doors).some((round) => Object.values(round).some((door) => door.attempts.length > 0));

export function createAdventRouter(deps: AdventRouterDeps): Router {
  const router = Router();
  const { store, bank, christmas } = deps;

  const subjectKeyFromLocals = (req: Request, res: Response): string => {
    const subject = (res.locals.advent as Locals | undefined)?.resolution.subject;
    return subject ? `advent:${subjectKeyOf(subject)}` : `advent-ip:${clientIpKeyGenerator(req)}`;
  };
  const limits = deps.limits ?? ADVENT_LIMITS;
  // A hálózati (IP-) keretbe csak a SIKERES (2xx) kérés számít (skipFailedRequests): az érvénytelen, elutasított vagy más
  // korlát miatt megállított kérés nem fogyasztja — így egy gyerek érvénytelen kérésekkel nem zárhatja ki az iskolát (vak ellenőr K1).
  // A 429-es válaszon a könyvtár \`Retry-After\` fejlécet is küld.
  const limiter = (which: "ip" | "subject", rule: { limit: number; windowMs: number }, keyGenerator: (req: Request, res: Response) => string, skipFailedRequests: boolean) => rateLimit({
    standardHeaders: true, legacyHeaders: false, keyGenerator, windowMs: rule.windowMs, limit: rule.limit, skipFailedRequests,
    message: { message: "Túl sok kérés — próbáld újra egy kicsit később.", limit: which },
  });
  const ipWriteLimiter = limiter("ip", limits.ipWrites, clientIpKeyGenerator, true);
  const ipReadLimiter = limiter("ip", limits.ipReads, clientIpKeyGenerator, true);
  const subjectLimiter = limiter("subject", limits.subjectWrites, subjectKeyFromLocals, false);
  /** Létrejött új névtelen sorok IP-nként és munkamenetenként: csak a tényleges létrehozás számít (a visszagördült kísérlet nem). */
  const newDeviceRows = createWindowCounter(limits.newDeviceRows);
  const sessionNewRows = createWindowCounter(limits.sessionNewRows);
  /** Érvénytelen kérések IP-nként: a keret betelte után az ÉRVÉNYTELEN kérés 429 (a szabályos kérést ez soha nem állítja meg). */
  const invalidRequests = createWindowCounter(limits.ipInvalid);
  /** Elutasított (409) kérések IP-nként: saját, iskolai méretű keret (vak ellenőr 3. kör KICSI-B). */
  const conflictRequests = createWindowCounter(limits.ipConflicts);
  const sessionKeyOf = (req: Request): string | null => {
    const session = (req as Request & { session?: unknown; sessionID?: unknown });
    return session.session && typeof session.sessionID === "string" && session.sessionID ? session.sessionID : null;
  };
  const fail = (req: Request, res: Response, next: NextFunction, error: unknown): void => {
    if (res.headersSent) return;
    // Az érvénytelen (400) és az elutasított (409) kérés saját, rövid ablakú keretbe számít (a 409 iskolai méretűbe) — a szabályos
    // kérést ez nem állítja meg.
    if (error instanceof AdventHttpError && (error.status === 400 || error.status === 409)) {
      const ip = clientIpKeyGenerator(req);
      const counter = error.status === 409 ? conflictRequests : invalidRequests;
      if (counter.reserve(ip) === null) {
        res.setHeader("Retry-After", String(counter.retryAfterSec(ip)));
        res.status(429).json({ message: "Túl sok hibás kérés — próbáld újra egy kicsit később.", limit: "invalid" });
        return;
      }
    }
    if (error instanceof AdventHttpError) {
      const retryAfter = error.extra.retryAfter;
      if (typeof retryAfter === "number") res.setHeader("Retry-After", String(retryAfter));
      res.status(error.status).json({ message: error.message, ...error.extra });
      return;
    }
    if ((error as { name?: unknown } | null)?.name === "AdventRowGoneError") { res.status(409).json({ message: "A naptárad közben frissült — betöltjük újra.", refresh: true }); return; }
    if (error instanceof RangeError) { logger.error(`[ADVENT] kiosztási hiba: ${errorClass(error)}`); res.status(503).json({ message: "A naptár most nem tud kérdést adni. Próbáld újra később!" }); return; }
    logger.error(`[ADVENT] hiba: ${errorClass(error)}`);
    next(error);
  };
  /** Végpont: a válasz elküldése a függvény dolga; a hibát egységesen kezeljük (Express 4 nem továbbítja az async hibát). */
  const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
    if (res.locals.adventClockInvalid === true && deps.invalidClock) { res.status(deps.invalidClock.status).json({ message: deps.invalidClock.message }); return; }
    fn(req, res).catch((error: unknown) => fail(req, res, next, error));
  };
  /** Köztes lépés: siker esetén továbblép. */
  const step = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
    fn(req, res).then(() => next(), (error: unknown) => fail(req, res, next, error));
  };

  /** Flag és óra: kikapcsolva (vagy e2e-módban tesztidő nélkül) a végpont nem létezik. */
  const gate: RequestHandler = (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const now = deps.enabled() ? deps.clock(req) : null;
    // Érvénytelen óra a beállított válasszal (admin-előnézet: 400) — a végső kezelő adja ki (`wrap`).
    if (!now && deps.invalidClock && deps.enabled()) { res.locals.adventClockInvalid = true; next(); return; }
    if (!now) { res.status(404).json({ message: "Not found" }); return; }
    res.locals.adventNow = now;
    next();
  };

  /** Az alany feloldása: olvasásnál fejlécből, írásnál a törzsből. */
  const identify = (source: "headers" | "body"): RequestHandler => step(async (req, res) => {
    if (res.locals.adventClockInvalid === true) return;
    const now = res.locals.adventNow as Date;
    const body = (source === "body" && req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    if (source === "body" && !adventIdentityBody.safeParse(body).success) throw new AdventHttpError(400, "Érvénytelen kérés.");
    const input = source === "headers"
      ? { learnerToken: req.get("x-learner-token"), device: req.get("x-advent-device") }
      : { learnerToken: body.learner, device: body.device };
    const resolution = await deps.resolve(req, input);
    if (source === "body" && resolution.pairing === "invalid") {
      throw new AdventHttpError(409, "A személyes linked lejárt — nyisd meg újra a napi levélből, vagy folytasd vendégként.", { pairing: "invalid" });
    }
    const at = adventNow(now);
    // Névtelen → párosított átmenet (terv 21.): érvényes tanulói link ÉS eszközazonosító esetén az eszköz sora a tanulóhoz kerül —
    // írásnál a végpont saját ellenőrzései UTÁN, a módosítással EGY tranzakcióban (`adoptionFor`), olvasásnál csak előnézet.
    const paired = resolution.pairing === "ok" && resolution.subject?.kind === "learner" ? adventDeviceId.safeParse(input.device) : null;
    const pairedDevice = paired?.success ? paired.data.toLowerCase() : null;
    res.locals.advent = { at, now, resolution, body, pairedDevice } satisfies Locals;
  });
  /** Az egyesítés környezete egy tanulóhoz (a tanulói terv a tanuló profiljának évfolyamára készül, ha még nincs). */
  const adoptionContext = (locals: Locals, deviceId: string): AdoptionContext => {
    const learner = locals.resolution.subject!;
    return createAdoptionContext({ bank, christmas, season: locals.at.season, learnerId: learner.id, learnerGrade: learner.grade ?? 1, deviceId, now: locals.now });
  };
  /**
   * A következő kör terve a valódi bankkal (PR-C vak L1). A kizárólista a megmutatott kérdésekből áll; ha ismétlés nélkül nem telne
   * ki, a hiányzó helyekre a legrégebben látott kérdések kerülnek (tulajdonosi döntés 2026-11-21: „Ismétlés a legrégebbiekből”).
   * \`null\` csak védőhálóként (hiányos / sérült bank), szabályos játékban nem fordul elő.
   */
  const nextRoundPlan = (row: AdventRow, grade: number, key: string, season: number): AdventPlan | null => {
    const round = row.round + 1;
    try {
      return withPlanMeta(buildAdventPlan({ bank, christmas, grade, season, round, subjectKey: key, ...usedInEarlierRounds({ ...row, round }, round, bank, christmas) }), grade, key);
    } catch (error) {
      if (error instanceof RangeError) return null;
      throw error;
    }
  };
  /** Az állapot a végpontokból: végigjátszott, új kört kérhető körnél megméri, felépíthető-e a következő kör (L1). */
  const stateOf = (locals: Locals, row: AdventRow | null, adoptionPending = false, version?: number): AdventState => {
    const subject = locals.resolution.subject;
    const grade = subject ? effectiveGrade(subject, row) : null;
    let nextRoundAvailable: boolean | undefined;
    if (subject && row && grade != null) {
      const { maxRepairs, maxRounds } = limitsForGrade(grade);
      const summary = adventSummary(row.doors[row.round] ?? {}, maxRepairs);
      if (summary.answered === ADVENT_DOORS && !summary.passed && summary.repairable === 0 && row.round < maxRounds) {
        nextRoundAvailable = nextRoundPlan(row, grade, subjectKeyOf(subject), locals.at.season) !== null;
      }
    }
    return buildAdventState(locals.at, locals.resolution, row, { adoptionPending, nextRoundAvailable, version, asOf: locals.now.getTime() });
  };
  /**
   * Az átvétel kérése a módosításhoz (GPT-vak L2): csak párosított eszközön és írható fázisban. A végpont a nap- / fázis- / bemenet-
   * ellenőrzést ELŐTTE végzi; a DB-függő ellenőrzés és az átvétel a store.mutate EGY tranzakciójában fut — elutasításnál mindkét sor
   * érintetlen. Sérült sor (L4) az átvételben is 409 corrupt.
   */
  const adoptionFor = (locals: Locals): AdoptionRequest | undefined => {
    if (!locals.pairedDevice || !isAdventWritable(locals.at.phase)) return undefined;
    const ctx = adoptionContext(locals, locals.pairedDevice);
    return {
      deviceId: locals.pairedDevice,
      merge: (learner, device) => {
        if (!adventRowIsSound(learner) || !adventRowIsSound(device)) throw new AdventHttpError(409, CORRUPT_MESSAGE, { corrupt: true });
        return mergeAdoption(learner, device, ctx);
      },
    };
  };
  /** A szülői levél döntése egy írás után, amely átvétellel véglegessé tehette az eredményt (megnyitás, átvétel; 18.1). */
  const notifyResult = (locals: Locals, subject: AdventResolvedSubject, row: AdventRow): void => {
    if (!deps.onResult) return;
    const { maxRepairs, maxRounds } = limitsForGrade(effectiveGrade(subject, row) ?? 5);
    try { deps.onResult({ row, subject, summary: adventSummary(row.doors[row.round] ?? {}, maxRepairs), maxRounds, phase: locals.at.phase }); }
    catch (error) { logger.error(`[ADVENT] átvétel utáni teendő hiba: ${errorClass(error)}`); }
  };
  const subjectOr400 = (res: Response): { locals: Locals; subject: AdventResolvedSubject } => {
    const locals = res.locals.advent as Locals;
    if (!locals.resolution.subject) throw new AdventHttpError(400, "Ehhez azonosító kell (tanulói link, játékos-fiók vagy eszközazonosító).", { pairing: locals.resolution.pairing });
    return { locals, subject: locals.resolution.subject };
  };
  const dayOf = (req: Request): number => {
    const parsed = adventDayParam.safeParse(req.params.day);
    if (!parsed.success) throw new AdventHttpError(400, "Érvénytelen ablak.");
    return parsed.data;
  };
  const requireWritable = (at: AdventNow) => {
    if (!isAdventWritable(at.phase)) throw new AdventHttpError(409, at.phase === "closed" ? "Az idei naptár már bezárt." : "A naptár még nem nyílt meg.", { phase: at.phase });
  };
  /**
   * Módosítás, amely új névtelen sort hozhat létre. A keretből a módosítás ELŐTT helyet FOGLALUNK (egy lépésben: ellenőrzés +
   * rögzítés), így párhuzamos kérésekkel sem léphető túl (review U1); ha a sor végül nem jött létre (már létezett, vagy a
   * módosítás visszagördült), a foglalás visszajár — csak a ténylegesen létrejött sor számít (review K2). Meglévő sornál nincs foglalás.
   */
  const creatingDeviceRow = async <T extends { created: boolean }>(req: Request, season: number, subject: AdventResolvedSubject, run: () => Promise<T>): Promise<T> => {
    if (subject.kind !== "device" || (await store.read(season, subject))) return run();
    const ip = clientIpKeyGenerator(req);
    // Előbb a munkamenet kerete (egy kliens ne fogyaszthassa el a hálózatét), utána a hálózaté — mindkettő foglalással.
    const session = sessionKeyOf(req);
    const sessionTicket = session ? sessionNewRows.reserve(session) : 0;
    if (session && sessionTicket === null) {
      throw new AdventHttpError(429, "Erről a gépről most már nem kezdhetsz új naptárat — folytasd a meglévőt, vagy próbáld később.", { limit: "new-row-session", retryAfter: sessionNewRows.retryAfterSec(session) });
    }
    const ticket = newDeviceRows.reserve(ip);
    if (ticket === null) {
      if (session && sessionTicket !== null) sessionNewRows.release(session, sessionTicket);
      throw new AdventHttpError(429, "Túl sok új naptár erről a hálózatról — próbáld újra később.", { limit: "new-row", retryAfter: newDeviceRows.retryAfterSec(ip) });
    }
    const giveBack = () => {
      newDeviceRows.release(ip, ticket);
      if (session && sessionTicket !== null) sessionNewRows.release(session, sessionTicket);
    };
    try {
      const outcome = await run();
      if (!outcome.created) giveBack();
      return outcome;
    } catch (error) {
      giveBack();
      throw error;
    }
  };

  router.get("/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = deps.enabled() ? deps.clock(req) : null;
    // Érvénytelen óra a beállított válasszal (admin-előnézet: 400 — S5/S6 1. vak L8), mint a többi végponton.
    if (!now && deps.invalidClock && deps.enabled()) { res.status(deps.invalidClock.status).json({ message: deps.invalidClock.message }); return; }
    if (!now) { res.json({ enabled: false }); return; }
    const at = adventNow(now);
    res.json({ enabled: true, season: at.season, phase: at.phase, openDay: at.openDay, daysUntilStart: at.daysUntilStart, nextOpensAt: at.nextOpensAt });
  });

  router.get("/state", gate, identify("headers"), ipReadLimiter, wrap(async (_req, res) => {
    const locals = res.locals.advent as Locals;
    const { at, resolution } = locals;
    const pairedLearner = locals.pairedDevice && resolution.subject?.kind === "learner" && isAdventWritable(at.phase) ? resolution.subject : null;
    // Párosított eszközön a két sor EGY lekérdezésből (PR-B 4. kör L2): egy közben commitolt átvétel nem adhat átmenetileg üres nézetet.
    const pair = pairedLearner && locals.pairedDevice ? await store.readPair(at.season, pairedLearner.id, locals.pairedDevice) : null;
    let row = pair ? pair.learner : resolution.subject ? await store.read(at.season, resolution.subject) : null;
    let adoptionPending = false;
    let version: number | undefined;
    // Párosított eszközön az átvétel előnézete (írás nélkül): azt mutatjuk, ami az első írásnál a tanulónál lesz. Csak írható
    // fázisban (élesítés előtti L3): lezárás után átvétel nincs, ezért a mentett tanulói állás látszik (nincs mentetlen ajándéküzenet).
    if (pair && locals.pairedDevice && adventRowIsSound(row)) {
      const deviceRow = pair.device;
      if (deviceRow && !adventRowIsSound(deviceRow)) throw new AdventHttpError(409, CORRUPT_MESSAGE, { corrupt: true });
      const merged = deviceRow ? mergeAdoption(row, deviceRow, adoptionContext(locals, locals.pairedDevice)) : null;
      // Az előnézet verziója a két TÁROLT sor újabbika (nem a kérés órája — L1): egy későbbi írás mindig újabb nála.
      if (merged) { version = Math.max(row ? row.updatedAt.getTime() : 0, deviceRow!.updatedAt.getTime()); row = merged; adoptionPending = true; }
    }
    if (!adventRowIsSound(row)) throw new AdventHttpError(409, CORRUPT_MESSAGE, { corrupt: true });
    res.json(stateOf(locals, row, adoptionPending, version));
  }));

  // Előbb a bemenet és az alany (az érvénytelen kérés itt megáll, a hálózati keretet nem éri), utána a keretek.
  const write = [gate, identify("body"), ipWriteLimiter, subjectLimiter] as const;
  /** A módosító függvényekben: sérült sornál érthető 409, nem 500. */
  const sound = (row: AdventRow): void => { if (!adventRowIsSound(row)) throw new AdventHttpError(409, CORRUPT_MESSAGE, { corrupt: true }); };

  router.post("/grade", ...write, wrap(async (req, res) => {
    const { locals, subject } = subjectOr400(res);
    requireWritable(locals.at);
    const parsed = adventGradeBody.safeParse(locals.body);
    if (!parsed.success) throw new AdventHttpError(400, "Az évfolyam 1 és 12 közötti egész szám.");
    if (subject.kind === "learner") throw new AdventHttpError(409, "A tanuló évfolyama a profiljából jön.");
    const { row } = await creatingDeviceRow(req, locals.at.season, subject, () => store.mutate(locals.at.season, subject, (current) => {
      sound(current);
      const answered = Object.values(current.doors).some((round) => Object.values(round).some((door) => door.attempts.length > 0));
      if (answered) throw new AdventHttpError(409, "Az évfolyam az első válasz után már nem módosítható.");
      // Válasz nélküli sorban az évfolyam váltása az addigi (még meg nem válaszolt) tervet eldobja.
      return { patch: { grade: parsed.data.grade, plan: {}, doors: {} }, result: null };
    }));
    res.json(stateOf(locals, row));
  }));

  router.post("/doors/:day/open", ...write, wrap(async (req, res) => {
    const { locals, subject } = subjectOr400(res);
    const day = dayOf(req);
    requireWritable(locals.at);
    if (!isDoorUnlocked(day, locals.at)) throw new AdventHttpError(403, "Ez az ablak még nem nyitható.", { opensDay: day });
    const key = subjectKeyOf(subject);
    const adopt = adoptionFor(locals);
    const { row, result } = await creatingDeviceRow(req, locals.at.season, subject, () => store.mutate<AdventOpenResult>(locals.at.season, subject, (row) => {
      sound(row);
      const grade = effectiveGrade(subject, row);
      if (grade == null) throw new AdventHttpError(409, "Előbb add meg, hányadikos vagy.", { needsGrade: true });
      const { maxRepairs } = limitsForGrade(grade);
      const round = row.round;
      let plan: AdventPlan | undefined = row.plan[round];
      let changed = false;
      // Az évfolyam az ELSŐ VÁLASZNÁL rögzül, nem a megnyitáskor (vak ellenőr k6, terv R6 / E10): amíg a sorban nincs rögzített
      // évfolyam és nincs válasz, a más évfolyamra készült terv új tervre cserélődik.
      if (plan && row.grade == null && !anyAttempt(row) && planGradeOf(plan) !== grade) plan = undefined;
      if (!plan) {
        plan = withPlanMeta(buildAdventPlan({ bank, christmas, grade, season: locals.at.season, round, subjectKey: key, ...usedInEarlierRounds(row, round, bank, christmas) }), grade, key);
        changed = true;
      }
      const attempts = row.doors[round]?.[day]?.attempts ?? [];
      // E14: a bankból eltűnt, még meg nem válaszolt kérdés pótlása (a megválaszolt kérdés védett).
      // Az aktuális kör lecserélt (`retired`) kérdései sem jöhetnek vissza pótlásként (PR #544 review).
      const fixed = repairPlanDoor(plan, day, { bank, christmas, grade, ...usedForRepair(row, round, plan, bank, christmas), protectedIds: new Set(attempts.map((a) => a.questionId)) });
      if (fixed.changed) { plan = fixed.plan; changed = true; }
      const state = doorState({ unlocked: true, attempts, maxRepairs });
      const readOnly = state === "solved" || state === "failed";
      const questionId = readOnly ? attempts[attempts.length - 1]!.questionId : plan.doors[day]![attempts.length];
      const item = questionId ? findAdventItem(questionId, bank, christmas) : null;
      // Megválaszolt ablaknál a kérdés hiánya nem hiba: a tárolt eredmény megy ki kérdés nélkül (review C5).
      if (!item && !readOnly) throw new RangeError("advent: a kiosztott kérdés nem található");
      const nextRow: AdventRow = { ...row, plan: { ...row.plan, [round]: plan } };
      const view = stateOf(locals, nextRow);
      const orderKey = orderKeyFor(plan, day, key);
      const answered = readOnly ? answerResult(item, attempts[attempts.length - 1]!, orderKey, locals.at.season, view.doors[day - 1]!, view) : null;
      return {
        patch: changed ? { plan: nextRow.plan } : null,
        result: { day, question: item ? toClientQuestion(item, optionOrder(item.id, orderKey, locals.at.season)) : null, answered },
      };
    }, adopt));
    // Az átvétel a megnyitás tranzakciójában is véglegessé teheti az eredményt (S5/S6 1. vak L5): a levél döntése ugyanaz, mint válasz után.
    if (adopt) notifyResult(locals, subject, row);
    res.json(result);
  }));

  router.post("/doors/:day/answer", ...write, wrap(async (req, res) => {
    const { locals, subject } = subjectOr400(res);
    const day = dayOf(req);
    const parsed = adventAnswerBody.safeParse(locals.body);
    if (!parsed.success) throw new AdventHttpError(400, "Érvénytelen válasz.");
    requireWritable(locals.at);
    if (!isDoorUnlocked(day, locals.at)) throw new AdventHttpError(403, "Ez az ablak még nem nyitható.");
    const key = subjectKeyOf(subject);
    const adopt = adoptionFor(locals);
    // Átvételnél a sor a tranzakcióban jön létre / egyesül (a kérdés az eszköz soráé lehet); elutasításnál minden visszagördül.
    if (!adopt && !(await store.read(locals.at.season, subject))) throw new AdventHttpError(409, "Előbb nyisd ki az ablakot.");
    const { row, result } = await store.mutate<{ answer: AdventAnswerResult; recorded: boolean; maxRounds: number }>(locals.at.season, subject, (current) => {
      sound(current);
      const round = current.round;
      const plan = current.plan[round];
      // A rögzített évfolyam, különben az, amelyre a terv készült (a profil közbeni változása ezt nem írja át).
      const grade = current.grade ?? (plan ? planGradeOf(plan) : undefined) ?? effectiveGrade(subject, current);
      if (grade == null || !plan) throw new AdventHttpError(409, "Előbb nyisd ki az ablakot.");
      // A profil évfolyama a megnyitás óta változott, és még nincs rögzített évfolyam (GPT-vak 3. kör L3; R6 / E10): a régi évfolyamú
      // kérdésre adott válasz nem rögzül — frissítést kér, mentés nélkül (a megnyitás új tervet ad a helyes évfolyamra).
      const profileGrade = effectiveGrade(subject, current);
      const plannedGrade = planGradeOf(plan);
      if (current.grade == null && profileGrade != null && plannedGrade !== undefined && plannedGrade !== profileGrade) {
        throw new AdventHttpError(409, "Az évfolyamod közben megváltozott — frissítjük a naptárat.", { state: stateOf(locals, current), refresh: true });
      }
      const { maxRepairs, maxRounds } = limitsForGrade(grade);
      const attempts = current.doors[round]?.[day]?.attempts ?? [];
      const viewOf = (r: AdventRow) => stateOf(locals, r);
      // Ugyanarra a kérdésre a második beküldés (újraküldés, dupla koppintás, másik lap): a tárolt eredmény, változás nélkül.
      const stored = attempts.find((a) => a.questionId === parsed.data.questionId);
      if (stored) {
        const item = findAdventItem(stored.questionId, bank, christmas);
        const view = viewOf(current);
        return { patch: null, result: { answer: answerResult(item, stored, orderKeyFor(plan, day, key), locals.at.season, view.doors[day - 1]!, view, false), recorded: false, maxRounds } };
      }
      const state = doorState({ unlocked: true, attempts, maxRepairs });
      const expected = state === "open" || state === "repairable" ? plan.doors[day]![attempts.length] : undefined;
      if (!expected || expected !== parsed.data.questionId) {
        throw new AdventHttpError(409, "Ez a kérdés már nem aktuális — frissítjük a naptárat.", { state: viewOf(current) });
      }
      const item = findAdventItem(expected, bank, christmas);
      if (!item) throw new RangeError("advent: a kiosztott kérdés nem található");
      const orderKey = orderKeyFor(plan, day, key);
      const graded = gradePick(item, optionOrder(item.id, orderKey, locals.at.season), parsed.data.pick);
      const attempt: DoorAttempt = { questionId: expected, pick: parsed.data.pick, correct: graded.correct, at: locals.now.toISOString() };
      const doors = { ...current.doors, [round]: { ...(current.doors[round] ?? {}), [day]: { attempts: [...attempts, attempt] } } };
      const summary = adventSummary(doors[round]!, maxRepairs);
      const next: AdventRow = {
        ...current, doors,
        finishedAt: summary.answered === ADVENT_DOORS ? current.finishedAt ?? locals.now : current.finishedAt,
        passedAt: summary.passed ? current.passedAt ?? locals.now : current.passedAt,
      };
      const view = viewOf(next);
      return {
        // Az első válasz rögzíti az évfolyamot (k6).
        patch: { doors, finishedAt: next.finishedAt, passedAt: next.passedAt, ...(current.grade == null ? { grade } : {}) },
        result: { answer: answerResult(item, attempt, orderKey, locals.at.season, view.doors[day - 1]!, view), recorded: true, maxRounds },
      };
    }, adopt);
    if (result.recorded && deps.onResult) {
      try { deps.onResult({ row, subject, summary: result.answer.summary, maxRounds: result.maxRounds, phase: locals.at.phase }); }
      catch (error) { logger.error(`[ADVENT] válasz utáni teendő hiba: ${errorClass(error)}`); }
    }
    // A válasz az írás UTÁNI szerververziót viszi (a mentett sor módosítási ideje — L1).
    res.json({ ...result.answer, version: row.updatedAt.getTime(), asOf: locals.now.getTime() } satisfies AdventAnswerResult);
  }));

  router.post("/round", ...write, wrap(async (_req, res) => {
    const { locals, subject } = subjectOr400(res);
    requireWritable(locals.at);
    const adopt = adoptionFor(locals);
    if (!adopt && !(await store.read(locals.at.season, subject))) throw new AdventHttpError(409, "Új kör csak a naptár végigjátszása után kérhető.");
    const { row } = await store.mutate(locals.at.season, subject, (current) => {
      sound(current);
      const grade = effectiveGrade(subject, current);
      if (grade == null) throw new AdventHttpError(409, "Új kör csak a naptár végigjátszása után kérhető.");
      const { maxRepairs, maxRounds } = limitsForGrade(grade);
      const summary = adventSummary(current.doors[current.round] ?? {}, maxRepairs);
      const allowed = summary.answered === ADVENT_DOORS && !summary.passed && summary.repairable === 0 && current.round < maxRounds && !current.passedAt;
      if (!allowed) throw new AdventHttpError(409, "Új kör csak akkor kérhető, ha végigértél, nincs javítható ablakod, és van még kör.");
      // A következő kör terve a körváltással EGY tranzakcióban készül és mentődik (L1). Védőháló: ha mégsem építhető fel (hiányos bank),
      // a kör nem vált (nincs játszhatatlan kör, nincs 503 az első megnyitáskor) — a gyerek eredménye változatlan marad.
      const plan = nextRoundPlan(current, grade, subjectKeyOf(subject), locals.at.season);
      if (!plan) throw new AdventHttpError(409, "Idén már minden kérdést láttál ebből a naptárból — büszke lehetsz magadra!", { noMoreQuestions: true });
      return { patch: { round: current.round + 1, finishedAt: null, plan: { ...current.plan, [current.round + 1]: plan } }, result: null };
    }, adopt);
    res.json(stateOf(locals, row));
  }));

  /**
   * Kifejezett átvétel a megtekintési útról (PR-C vak L2): a végigjátszott vendégnaptárnál nincs más író kérés, ezért a kliens az
   * összesítés megnyitásakor ezzel menti el a GET-en előnézetként mutatott egyesítést. CSRF-védett író kérés (a GET mellékhatás nélkül
   * marad), idempotens: ha nincs átvehető vendégsor, változás nélkül a mentett állapotot adja.
   */
  router.post("/adopt", ...write, wrap(async (_req, res) => {
    const { locals, subject } = subjectOr400(res);
    requireWritable(locals.at);
    if (subject.kind !== "learner") throw new AdventHttpError(409, "Átvenni csak személyes linkkel lehet.");
    const adopt = adoptionFor(locals);
    const device = adopt ? await store.read(locals.at.season, { kind: "device", id: adopt.deviceId }) : null;
    if (!adopt || !device) {
      const current = await store.read(locals.at.season, subject);
      if (current && !adventRowIsSound(current)) throw new AdventHttpError(409, CORRUPT_MESSAGE, { corrupt: true });
      res.json(stateOf(locals, current));
      return;
    }
    const { row } = await store.mutate(locals.at.season, subject, (current) => { sound(current); return { patch: null, result: null }; }, adopt);
    // Az átvett (kész) vendégeredmény is lehet végleges (18.1): a szülői levél döntése ugyanaz, mint válasz után.
    notifyResult(locals, subject, row);
    res.json(stateOf(locals, row));
  }));

  return router;
}
