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
  buildAdventPlan, findAdventItem, gradePick, normalizePrompt, optionOrder, repairPlanDoor, toClientQuestion,
  type AdventBankItem, type AdventItem, type AdventPlan, type ChristmasItem,
} from "../../shared/advent/assignment";
import { adventNow, isAdventWritable, isDoorUnlocked, type AdventNow } from "../../shared/advent/calendar";
import {
  adventAnswerBody, adventDayParam, adventGradeBody, adventIdentityBody,
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
import type { AdventRow, AdventStore, AdventSubject } from "./store";


export type AdventRouterDeps = {
  store: AdventStore;
  bank: readonly AdventBankItem[];
  christmas: readonly ChristmasItem[];
  /** A funkció be van-e kapcsolva (flag). Az admin előnézet routere mindig `true`-t ad (terv 16.5). */
  enabled: () => boolean;
  /** A naptár órája; `null` = a naptár kikapcsoltként viselkedik (e2e-mód tesztidő nélkül). */
  clock: (req: Request) => Date | null;
  resolve: (req: Request, input: { learnerToken?: unknown; device?: unknown }) => Promise<AdventResolution>;
  /** A kéréskorlátok (alap: `ADVENT_LIMITS`); tesztben kisebb értékkel adható meg. */
  limits?: AdventLimits;
  /** Minden rögzített válasz után (nem várjuk meg): az S5 innen dönt a szülői levélről. */
  onAnswer?: (event: { row: AdventRow; subject: AdventResolvedSubject; summary: AdventSummary; maxRounds: number }) => void;
};

class AdventHttpError extends Error {
  constructor(readonly status: number, message: string, readonly extra: Record<string, unknown> = {}) { super(message); this.name = "AdventHttpError"; }
}

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
  const subject = attempts.length > 0 && plan ? plan.subjects[day] ?? null : grade != null && isChristmasDoor(day, grade) ? "christmas" : null;
  return { day, state, subject, repairsLeft: state === "repairable" ? maxRepairs - attempts.length + 1 : 0 };
}

/** A naptár teljes állapota egy alanynak (írás nélkül számolható). */
export function buildAdventState(at: AdventNow, resolution: AdventResolution, row: AdventRow | null): AdventState {
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
    season: at.season, phase: at.phase, today: at.today, openDay: at.openDay, nextOpensAt: at.nextOpensAt, daysUntilStart: at.daysUntilStart,
    identity: subject?.kind ?? null,
    pairing: resolution.pairing,
    firstName: subject?.firstName ?? null,
    grade,
    needsGrade: subject != null && grade == null,
    round, maxRounds: limits.maxRounds,
    layout: plan?.layout ?? ALL_DAYS,
    doors, summary,
    closing: adventClosing(summary, { round, maxRounds: limits.maxRounds, phase: at.phase, waiting }),
  };
}

/** Az évad korábbi köreiben már kiosztott kérdések (azonosító és normalizált prompt). */
function usedInEarlierRounds(row: AdventRow, round: number, bank: readonly AdventBankItem[], christmas: readonly ChristmasItem[]) {
  const usedIds = new Set<string>();
  const usedPrompts = new Set<string>();
  for (const [key, plan] of Object.entries(row.plan)) {
    if (Number(key) >= round) continue;
    for (const ids of Object.values(plan.doors)) {
      for (const id of ids) {
        usedIds.add(id);
        const item = findAdventItem(id, bank, christmas);
        if (item) usedPrompts.add(normalizePrompt(item.prompt));
      }
    }
  }
  return { usedIds, usedPrompts };
}

/**
 * Egy (tárolt vagy friss) próba eredménye. Ha a kérdés közben eltűnt a bankból (`item` null), a tárolt próba alapján csak az
 * eredmény megy ki: helyes válasz és magyarázat nélkül (`correctIndex: -1`) — hiba helyett (review C5).
 */
function answerResult(item: AdventItem | null, attempt: DoorAttempt, subjectKey: string, season: number, door: AdventDoorView, state: AdventState): AdventAnswerResult {
  const correctIndex = item ? gradePick(item, optionOrder(item.id, subjectKey, season), attempt.pick).correctIndex : -1;
  return { correct: attempt.correct, correctIndex, explanation: item?.explanation ?? "", door, summary: state.summary, closing: state.closing };
}

type Locals = { at: AdventNow; now: Date; resolution: AdventResolution; body: Record<string, unknown> };

export function createAdventRouter(deps: AdventRouterDeps): Router {
  const router = Router();
  const { store, bank, christmas } = deps;

  const subjectKeyFromLocals = (req: Request, res: Response): string => {
    const subject = (res.locals.advent as Locals | undefined)?.resolution.subject;
    return subject ? `advent:${subjectKeyOf(subject)}` : `advent-ip:${clientIpKeyGenerator(req)}`;
  };
  const limits = deps.limits ?? ADVENT_LIMITS;
  const limiter = (which: "ip" | "subject", rule: { limit: number; windowMs: number }, keyGenerator: (req: Request, res: Response) => string) => rateLimit({
    standardHeaders: true, legacyHeaders: false, keyGenerator, windowMs: rule.windowMs, limit: rule.limit,
    message: { message: "Túl sok kérés — próbáld újra egy kicsit később.", limit: which },
  });
  const ipWriteLimiter = limiter("ip", limits.ipWrites, clientIpKeyGenerator);
  const ipReadLimiter = limiter("ip", limits.ipReads, clientIpKeyGenerator);
  const subjectLimiter = limiter("subject", limits.subjectWrites, subjectKeyFromLocals);
  /** Létrejött új névtelen sorok IP-nként: csak a tényleges létrehozás számít (a visszagördült kísérlet nem). */
  const newDeviceRows = createWindowCounter(limits.newDeviceRows);
  const fail = (res: Response, next: NextFunction, error: unknown): void => {
    if (res.headersSent) return;
    if (error instanceof AdventHttpError) { res.status(error.status).json({ message: error.message, ...error.extra }); return; }
    if (error instanceof RangeError) { logger.error(`[ADVENT] kiosztási hiba: ${errorClass(error)}`); res.status(503).json({ message: "A naptár most nem tud kérdést adni. Próbáld újra később!" }); return; }
    logger.error(`[ADVENT] hiba: ${errorClass(error)}`);
    next(error);
  };
  /** Végpont: a válasz elküldése a függvény dolga; a hibát egységesen kezeljük (Express 4 nem továbbítja az async hibát). */
  const wrap = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
    fn(req, res).catch((error: unknown) => fail(res, next, error));
  };
  /** Köztes lépés: siker esetén továbblép. */
  const step = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => (req, res, next) => {
    fn(req, res).then(() => next(), (error: unknown) => fail(res, next, error));
  };

  /** Flag és óra: kikapcsolva (vagy e2e-módban tesztidő nélkül) a végpont nem létezik. */
  const gate: RequestHandler = (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const now = deps.enabled() ? deps.clock(req) : null;
    if (!now) { res.status(404).json({ message: "Not found" }); return; }
    res.locals.adventNow = now;
    next();
  };

  /** Az alany feloldása: olvasásnál fejlécből, írásnál a törzsből. */
  const identify = (source: "headers" | "body"): RequestHandler => step(async (req, res) => {
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
    res.locals.advent = { at: adventNow(now), now, resolution, body } satisfies Locals;
  });
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
  /** Új névtelen sor ELŐTT: ha erről a hálózatról a keret betelt, a sor nem jön létre (429). Meglévő sornál nem számít. */
  const guardNewDeviceRow = async (req: Request, season: number, subject: AdventResolvedSubject): Promise<void> => {
    if (subject.kind !== "device" || (await store.read(season, subject))) return;
    if (newDeviceRows.full(clientIpKeyGenerator(req))) throw new AdventHttpError(429, "Túl sok új naptár erről a hálózatról — próbáld újra később.", { limit: "new-row" });
  };
  /** A zárolt módosítás UTÁN: ha a sor most jött létre (és megmaradt), az számít a keretbe. */
  const countNewDeviceRow = (req: Request, subject: AdventResolvedSubject, created: boolean): void => {
    if (created && subject.kind === "device") newDeviceRows.hit(clientIpKeyGenerator(req));
  };

  router.get("/status", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const now = deps.enabled() ? deps.clock(req) : null;
    if (!now) { res.json({ enabled: false }); return; }
    const at = adventNow(now);
    res.json({ enabled: true, season: at.season, phase: at.phase, openDay: at.openDay, daysUntilStart: at.daysUntilStart, nextOpensAt: at.nextOpensAt });
  });

  router.get("/state", gate, ipReadLimiter, identify("headers"), wrap(async (_req, res) => {
    const { at, resolution } = res.locals.advent as Locals;
    const row = resolution.subject ? await store.read(at.season, resolution.subject) : null;
    res.json(buildAdventState(at, resolution, row));
  }));

  const write = [gate, ipWriteLimiter, identify("body"), subjectLimiter] as const;

  router.post("/grade", ...write, wrap(async (req, res) => {
    const { locals, subject } = subjectOr400(res);
    requireWritable(locals.at);
    const parsed = adventGradeBody.safeParse(locals.body);
    if (!parsed.success) throw new AdventHttpError(400, "Az évfolyam 1 és 12 közötti egész szám.");
    if (subject.kind === "learner") throw new AdventHttpError(409, "A tanuló évfolyama a profiljából jön.");
    await guardNewDeviceRow(req, locals.at.season, subject);
    const { row, created } = await store.mutate(locals.at.season, subject, (current) => {
      const answered = Object.values(current.doors).some((round) => Object.values(round).some((door) => door.attempts.length > 0));
      if (answered) throw new AdventHttpError(409, "Az évfolyam az első válasz után már nem módosítható.");
      // Válasz nélküli sorban az évfolyam váltása az addigi (még meg nem válaszolt) tervet eldobja.
      return { patch: { grade: parsed.data.grade, plan: {}, doors: {} }, result: null };
    });
    countNewDeviceRow(req, subject, created);
    res.json(buildAdventState(locals.at, locals.resolution, row));
  }));

  router.post("/doors/:day/open", ...write, wrap(async (req, res) => {
    const { locals, subject } = subjectOr400(res);
    const day = dayOf(req);
    requireWritable(locals.at);
    if (!isDoorUnlocked(day, locals.at)) throw new AdventHttpError(403, "Ez az ablak még nem nyitható.", { opensDay: day });
    await guardNewDeviceRow(req, locals.at.season, subject);
    const key = subjectKeyOf(subject);
    const { result, created } = await store.mutate<AdventOpenResult>(locals.at.season, subject, (row) => {
      const grade = effectiveGrade(subject, row);
      if (grade == null) throw new AdventHttpError(409, "Előbb add meg, hányadikos vagy.", { needsGrade: true });
      const { maxRepairs } = limitsForGrade(grade);
      const round = row.round;
      let plan = row.plan[round];
      let changed = row.grade !== grade;
      if (!plan) {
        plan = buildAdventPlan({ bank, christmas, grade, season: locals.at.season, round, subjectKey: key, ...usedInEarlierRounds(row, round, bank, christmas) });
        changed = true;
      }
      const attempts = row.doors[round]?.[day]?.attempts ?? [];
      // E14: a bankból eltűnt, még meg nem válaszolt kérdés pótlása (a megválaszolt kérdés védett).
      const fixed = repairPlanDoor(plan, day, { bank, christmas, grade, ...usedInEarlierRounds(row, round, bank, christmas), protectedIds: new Set(attempts.map((a) => a.questionId)) });
      if (fixed.changed) { plan = fixed.plan; changed = true; }
      const state = doorState({ unlocked: true, attempts, maxRepairs });
      const readOnly = state === "solved" || state === "failed";
      const questionId = readOnly ? attempts[attempts.length - 1]!.questionId : plan.doors[day]![attempts.length];
      const item = questionId ? findAdventItem(questionId, bank, christmas) : null;
      // Megválaszolt ablaknál a kérdés hiánya nem hiba: a tárolt eredmény megy ki kérdés nélkül (review C5).
      if (!item && !readOnly) throw new RangeError("advent: a kiosztott kérdés nem található");
      const nextRow: AdventRow = { ...row, grade, plan: { ...row.plan, [round]: plan } };
      const view = buildAdventState(locals.at, locals.resolution, nextRow);
      const answered = readOnly ? answerResult(item, attempts[attempts.length - 1]!, key, locals.at.season, view.doors[day - 1]!, view) : null;
      return {
        patch: changed ? { grade, plan: nextRow.plan } : null,
        result: { day, question: item ? toClientQuestion(item, optionOrder(item.id, key, locals.at.season)) : null, answered },
      };
    });
    countNewDeviceRow(req, subject, created);
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
    if (!(await store.read(locals.at.season, subject))) throw new AdventHttpError(409, "Előbb nyisd ki az ablakot.");
    const { row, result } = await store.mutate<{ answer: AdventAnswerResult; recorded: boolean; maxRounds: number }>(locals.at.season, subject, (current) => {
      const grade = effectiveGrade(subject, current);
      const round = current.round;
      const plan = current.plan[round];
      if (grade == null || !plan) throw new AdventHttpError(409, "Előbb nyisd ki az ablakot.");
      const { maxRepairs, maxRounds } = limitsForGrade(grade);
      const attempts = current.doors[round]?.[day]?.attempts ?? [];
      const viewOf = (r: AdventRow) => buildAdventState(locals.at, locals.resolution, r);
      // Ugyanarra a kérdésre a második beküldés (újraküldés, dupla koppintás, másik lap): a tárolt eredmény, változás nélkül.
      const stored = attempts.find((a) => a.questionId === parsed.data.questionId);
      if (stored) {
        const item = findAdventItem(stored.questionId, bank, christmas);
        const view = viewOf(current);
        return { patch: null, result: { answer: answerResult(item, stored, key, locals.at.season, view.doors[day - 1]!, view), recorded: false, maxRounds } };
      }
      const state = doorState({ unlocked: true, attempts, maxRepairs });
      const expected = state === "open" || state === "repairable" ? plan.doors[day]![attempts.length] : undefined;
      if (!expected || expected !== parsed.data.questionId) {
        throw new AdventHttpError(409, "Ez a kérdés már nem aktuális — frissítjük a naptárat.", { state: viewOf(current) });
      }
      const item = findAdventItem(expected, bank, christmas);
      if (!item) throw new RangeError("advent: a kiosztott kérdés nem található");
      const graded = gradePick(item, optionOrder(item.id, key, locals.at.season), parsed.data.pick);
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
        patch: { doors, finishedAt: next.finishedAt, passedAt: next.passedAt },
        result: { answer: answerResult(item, attempt, key, locals.at.season, view.doors[day - 1]!, view), recorded: true, maxRounds },
      };
    });
    if (result.recorded && deps.onAnswer) {
      try { deps.onAnswer({ row, subject, summary: result.answer.summary, maxRounds: result.maxRounds }); }
      catch (error) { logger.error(`[ADVENT] válasz utáni teendő hiba: ${errorClass(error)}`); }
    }
    res.json(result.answer);
  }));

  router.post("/round", ...write, wrap(async (_req, res) => {
    const { locals, subject } = subjectOr400(res);
    requireWritable(locals.at);
    if (!(await store.read(locals.at.season, subject))) throw new AdventHttpError(409, "Új kör csak a naptár végigjátszása után kérhető.");
    const { row } = await store.mutate(locals.at.season, subject, (current) => {
      const grade = effectiveGrade(subject, current);
      if (grade == null) throw new AdventHttpError(409, "Új kör csak a naptár végigjátszása után kérhető.");
      const { maxRepairs, maxRounds } = limitsForGrade(grade);
      const summary = adventSummary(current.doors[current.round] ?? {}, maxRepairs);
      const allowed = summary.answered === ADVENT_DOORS && !summary.passed && summary.repairable === 0 && current.round < maxRounds && !current.passedAt;
      if (!allowed) throw new AdventHttpError(409, "Új kör csak akkor kérhető, ha végigértél, nincs javítható ablakod, és van még kör.");
      return { patch: { round: current.round + 1, finishedAt: null }, result: null };
    });
    res.json(buildAdventState(locals.at, locals.resolution, row));
  }));

  return router;
}
