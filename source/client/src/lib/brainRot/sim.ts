/**
 * J5a — a „Lény-aréna” node-szimulációja a közös harness-hez (`T/support/game-sim.ts` `SimGame`; végrehajtás K.6, J5a 4.;
 * terv 6.2). React, DOM, three.js és hang nélkül fut; ugyanazt a magot és meghajtót (`createBrainRotDriver`), ugyanazt a
 * kérdés-ütemezőt (`createQuestionDirector`) és ugyanazt a kérdés-sáv állapotgépet (`createQuestionUi`: megoldás-kijelzés
 * ≥ 1,8 mp, csak nyitott kérdésnél lassít) hajtja, mint a lap — a lap rajzol és bemenetet fogad, a sim a botot kérdezi.
 *
 * A bot (a harness megállapodása szerint): lépésenként a célja felé tolja a joystickot, ha az ügyességi dobása sikerül
 * (`skillRoll < 1`), különben az adott lépésben nem kormányoz. Cél: nyitott kérdésnél — miután a harness a reakcióidő után
 * „választott” (`answer`) — a választott ketrec (oda fut és megáll benne, mint a böködéses célzásnál); különben a
 * legközelebbi szabad lény (a fáradt előnyben). A válasz így VALÓDI futás a ketrecig: ha a reakció + az út nem fér az
 * ablakba, lejárat.
 *
 * Aréna: egy tipikus álló telefon táblája (360 × 560 px → 1 × 1,56 egység), az évfolyam hangolásával (`lib/brainRotTuning.ts`).
 * A kérdésforrás alapból szintetikus (≥ 200 egyedi tétel, a terv 6.2 változatosság-mérésének feltétele); a teszt
 * tananyag-tételt és saját bankot is adhat (`material`, `bankSize`).
 */
import { createRng, seedFrom } from "@shared/game-rng";
import {
  bankPlayQuestion,
  createQuestionDirector,
  materialPlayQuestion,
  restoreReviewQuestion,
  type QuestionDirector,
} from "@/game-engine/play/questionDirector";
import { createQuestionUi } from "@/game-engine/play/questionUi";
import { createReviewQueue } from "@/game-engine/play/reviewQueue";
import type { RunStatsSnapshot } from "@/game-engine/play/runStats";
import type { FourChoiceQuiz } from "@/types/gameQuiz";

import { brainRotAgeMs, brainRotLifetimeFor, brainRotSizeFor, brainRotSpeedScaleFor } from "../brainRotTuning";
import {
  BRAIN_ROT_GAME_ID,
  brainRotDirectorConfig,
  createBrainRotDriver,
  PLAYER_RADIUS,
  playerInCage,
  type BrainRotDriver,
  type BrainRotEvent,
  type BrainRotState,
  type BrainRotTuning,
} from "./core";
import { paceBrainRotDirector } from "./pacing";

/** A sim táblája (CSS px): tipikus álló telefon a HUD alatt. */
export const SIM_BOARD = { w: 360, h: 560 } as const;

const T0 = 1_800_000_000_000;

/** A lap hangolása ugyanezekből a függvényekből (a tábla px-méretével) — a sim ugyanígy építi. */
export function brainRotTuningFor(grade: number | null, boardW: number, boardH: number): BrainRotTuning {
  return {
    sizePx: (rng) => brainRotSizeFor({ grade, boardW, boardH }, rng),
    unitPx: Math.max(1, Math.min(boardW, boardH)),
    lifetimeMs: brainRotLifetimeFor(grade),
    speedScale: brainRotSpeedScaleFor(grade),
    ageMs: brainRotAgeMs,
  };
}

export type BrainRotSimOptions = {
  seed: number;
  grade: number;
  questions: boolean;
  /** Tananyag-tételek (a forrásrend 1. helye, terv J7). */
  material?: readonly FourChoiceQuiz[];
  /**
   * Kupon mód (review #485 K1; J5a 23.): csak a `material` lecke-tételei (`couponOnly`, mint a lapon); a kimerülést és az
   * ismétlést a közös director kupon-ága kezeli (D-J1a-10 / D-J1a-16).
   */
  coupon?: boolean;
  /** A szintetikus bank mérete (alap 600). 0 → üres forrás (terv 8.1: a játék kérdés nélkül fut). */
  bankSize?: number;
  /**
   * Review #485 B1 — emberi bemenet: a bot a kérdés megjelenése után még ennyi ms-ig tolja a joystickot a régi irányba,
   * mielőtt elengedi és olvas (alap: seedelten 150–500 ms; 0 = azonnal elenged). `"tap"`: böködéses mód (a lényre bök).
   * `"drag"` (review #485 Ú1): húzásos mód — a gyerek a lény felé húzza a lenyomott ujját, a ketrecek nyitásakor az ujj
   * lent marad és 100 ms-onként kicsit mozdul; döntés után felemeli és a választott ketrecre bök.
   */
  releaseMs?: number | "human";
  input?: "stick" | "tap" | "drag";
  /** Húzásos módban az ujj ennyi egységgel a lény ELŐTT (a vadász felől nézve túl) — a reviewer `drag.ts` esetei. */
  dragLead?: number;
  /**
   * Review #485 (Vercel 4597845275): a nyitáskor a vadász egy (seedelten választott) ketrec PEREMÉN áll — a közepe kint, a
   * pereme bent. A bot ilyenkor is tudjon válaszolni (bármelyik ketrecre), és ne legyen idő előtti válasz.
   */
  startInCageZone?: boolean;
};

export type BrainRotSim = {
  step(dtMs: number, input: { skillRoll: number }): void;
  question(): { id: number; correctOption: number; windowMs: number; optionCount: number } | null;
  answer(id: number, option: number): void;
  done(): boolean;
  won(): boolean;
  stats(): RunStatsSnapshot;
  simTimeMs(): number;
  band(): number;
  intensity(): number;
  /** A mag állapota (teszt: arany visszajátszás, elkapások). */
  state(): Readonly<BrainRotState>;
  hash(): string;
  /** A menet kérdés-kulcsai sorban (változatosság / forrásrend teszt). */
  askedKeys(): readonly string[];
  /** A menet kimenetei sorban: tétel-kulcs és eredmény (kupon-ismétlés teszt — J5a 23.). */
  outcomes(): readonly { key: string; result: string }[];
  /** A bot döntése ELŐTT regisztrált ketrec-válaszok száma (véletlen válasz — review #485 B1; 0 kell). */
  prematureAnswers(): number;
  director: QuestionDirector;
  driver: BrainRotDriver;
};

function syntheticQuiz(n: number): FourChoiceQuiz {
  const a = `válasz${n}`;
  return {
    id: `br-sim-${n}`,
    prompt: `Melyik a jó: kérdés ${n}?`,
    options: [a, `${a}-b`, `${a}-c`, `${a}-d`],
    correctIndex: n % 4,
    explanation: `A jó válasz: ${a}.`,
  };
}

export function createSimGame(opts: BrainRotSimOptions): BrainRotSim {
  const { seed, grade, questions } = opts;
  const bankSize = opts.bankSize ?? 600;
  const material = opts.material ?? [];
  let freshCursor = 0;
  let materialCursor = 0;
  const coupon = opts.coupon === true;
  const director = createQuestionDirector({
    config: brainRotDirectorConfig(grade),
    provider: {
      couponOnly: coupon && material.length > 0,
      // A lap kupon-módja is `coupon: true` forrással adja a lecke-tételt; kimerülés után null (a director ismétel).
      material: () => (materialCursor < material.length ? materialPlayQuestion(material[materialCursor++]!, { coupon }) : null),
      fresh: () => {
        if (freshCursor >= bankSize) return null;
        const q = syntheticQuiz(freshCursor);
        freshCursor += 1;
        return bankPlayQuestion(BRAIN_ROT_GAME_ID, q);
      },
      restore: (item) => restoreReviewQuestion(item, {}),
    },
    review: createReviewQueue(null, { now: () => T0, rng: createRng(seedFrom(BRAIN_ROT_GAME_ID, seed, "review")) }),
    rng: createRng(seedFrom(BRAIN_ROT_GAME_ID, seed, "q")),
    startBand: 0.4,
    now: () => T0,
  });
  const paced = paceBrainRotDirector(director, { grade: () => grade });
  const asked: string[] = [];
  const results: { key: string; result: string }[] = [];
  /** A bot választott ketrece (a nyitott kérdéshez), vagy null. */
  let chosen: { id: number; option: number } | null = null;
  /** A nyitott kérdés megjelenése (kérdés-óra ms) és a bot késleltetett elengedése (ms). */
  let shownAt = 0;
  let holdFor = 0;
  let driver: BrainRotDriver | null = null;
  const ui = createQuestionUi({
    // Válaszidő (terv 2026-11-17-brainrot-valaszido): ugyanaz a burkoló, mint a lapon (olvasásalapú ablak, előjelzés utáni óra).
    director: () => (questions ? paced : null),
    onView: () => {},
    onShow: (p) => {
      asked.push(p.question.key);
      chosen = null;
      shownAt = driver ? driver.clockMs() : 0;
      holdFor = opts.releaseMs === undefined || opts.releaseMs === "human" ? 150 + botRng.next() * 350 : opts.releaseMs;
      driver!.core.openCages(p.options.length, p.id);
      if (opts.startInCageZone) placeOnCageEdge();
    },
    onOutcome: (o, p) => {
      results.push({ key: p.question.key, result: o.result });
      chosen = null;
      const picked = o.pickedOriginalIndex === null ? null : p.options.findIndex((opt) => opt.originalIndex === o.pickedOriginalIndex);
      driver!.core.applyOutcome(o.result, picked === -1 ? null : picked);
    },
  });
  const unitPx = Math.min(SIM_BOARD.w, SIM_BOARD.h);
  driver = createBrainRotDriver({
    seed,
    questions: questions ? ui : null,
    band: () => director.band(),
    tuning: brainRotTuningFor(grade, SIM_BOARD.w, SIM_BOARD.h),
    arenaW: SIM_BOARD.w / unitPx,
    arenaH: SIM_BOARD.h / unitPx,
  });
  const d = driver;
  const core = d.core;
  const botRng = createRng(seedFrom(BRAIN_ROT_GAME_ID, seed, "bot-release"));
  const edgeRng = createRng(seedFrom(BRAIN_ROT_GAME_ID, seed, "cage-edge"));
  /** A vadász egy ketrec peremére (a közepe kint, a pereme bent; csak ezt az egy ketrecet érintve), ha van ilyen hely. */
  function placeOnCageEdge(): void {
    const st = core.state();
    const n = st.cageCount;
    const first = Math.floor(edgeRng.next() * n);
    const m = PLAYER_RADIUS * 0.5 * 0.6;
    for (let t = 0; t < n; t++) {
      const i = (first + t) % n;
      const c = st.cages[i]!;
      for (const [x, y] of [[c.x, c.y - c.h / 2 - m], [c.x, c.y + c.h / 2 + m], [c.x - c.w / 2 - m, c.y], [c.x + c.w / 2 + m, c.y]] as const) {
        if (x < st.player.r || y < st.player.r || x > st.arenaW - st.player.r || y > st.arenaH - st.player.r) continue;
        if (!playerInCage(x, y, c)) continue;
        let other = false;
        for (let j = 0; j < n; j++) if (j !== i && playerInCage(x, y, st.cages[j]!)) other = true;
        if (other) continue;
        st.player.x = x;
        st.player.y = y;
        c.inside = true;
        return;
      }
    }
  }
  const tapMode = opts.input === "tap";
  const dragMode = opts.input === "drag";
  const dragLead = opts.dragLead ?? 0;
  /** Húzásos mód: lent van-e az ujj, hol, és mikor mozdult utoljára. */
  let fingerDown = false;
  let finger = { x: 0, y: 0 };
  let lastJitter = 0;
  let lastDir = { x: 0, y: 0 };
  let premature = 0;

  /** A bot célpontja: a választott ketrec, különben a legközelebbi szabad lény (a fáradt előnyben). */
  function steer(skillRoll: number): void {
    const st = core.state();
    const p = st.player;
    let tx: number | null = null;
    let ty = 0;
    const open = ui.active();
    if (dragMode && open && st.cagesOpen && !(chosen && chosen.id === open.id)) {
      // Ú1: a döntés előtt az ujj lent marad a régi helyén, és kicsit mozdul (a mag ezt nem veheti szándéknak).
      if (fingerDown && d.clockMs() - lastJitter >= 100) {
        lastJitter = d.clockMs();
        core.setTarget(finger.x + 0.002, finger.y, "move");
      }
      return;
    }
    if (open && st.cagesOpen && !tapMode && !dragMode && d.clockMs() - shownAt < holdFor) {
      // Emberi reakció: a gyerek a kérdés megjelenése után még tolja a régi irányba (review #485 B1).
      core.setInput(lastDir.x, lastDir.y);
      return;
    }
    if (chosen && st.cagesOpen && ui.active()?.id === chosen.id) {
      // A választott ketrec: oda fut és MEGÁLL benne (a böködéses célzás mintája — a válasz a beállás, review #485).
      const cage = st.cages[chosen.option];
      if (cage && skillRoll < 1) {
        // Húzásos módban a döntés után az ujj felemelkedik, és a gyerek a ketrecre bök (friss lenyomás).
        core.setTarget(cage.x, cage.y, "down");
        fingerDown = false;
      }
      core.setInput(0, 0);
      return;
    } else if (!st.carry) {
      let best = Infinity;
      for (const c of st.creatures) {
        if (!c.active || c.state !== "free") continue;
        const dist = Math.hypot(c.x - p.x, c.y - p.y) * (c.dazed ? 0.5 : 1);
        if (dist < best) {
          best = dist;
          tx = c.x;
          ty = c.y;
        }
      }
    }
    if (tx === null || skillRoll >= 1) {
      core.setInput(0, 0);
      return;
    }
    if (dragMode) {
      const dx = tx - p.x;
      const dy = ty - p.y;
      const len = Math.hypot(dx, dy) || 1;
      finger = { x: tx + (dx / len) * dragLead, y: ty + (dy / len) * dragLead };
      core.setTarget(finger.x, finger.y, fingerDown ? "move" : "down");
      fingerDown = true;
      return;
    }
    if (tapMode) {
      // Böködéses mód: a lény pillanatnyi helyére bök (a vadász oda fut); elkapás után nem bök tovább.
      core.setTarget(tx, ty);
      return;
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const len = Math.hypot(dx, dy);
    lastDir = { x: len > 1e-6 ? dx / len : 0, y: len > 1e-6 ? dy / len : 0 };
    core.setInput(lastDir.x, lastDir.y);
  }
  const countPremature = (e: BrainRotEvent) => {
    if (e.type === "cageHit" && !decidedBefore) premature += 1;
  };
  let decidedBefore = false;

  return {
    step(dtMs, input) {
      if (!core.running()) {
        if (questions && !ui.finished()) ui.finish();
        return;
      }
      steer(input.skillRoll);
      decidedBefore = chosen !== null;
      d.frame(dtMs, false, countPremature);
    },
    question() {
      const p = ui.active();
      if (!p || ui.view().reveal || chosen?.id === p.id) return null;
      return { id: p.id, correctOption: p.options.findIndex((o) => o.correct), windowMs: p.windowMs, optionCount: p.options.length };
    },
    answer(id, option) {
      const p = ui.active();
      if (!p || p.id !== id) return;
      chosen = { id, option };
    },
    done: () => !core.running(),
    won: () => core.won(),
    stats: () => director.stats(d.clockMs()),
    simTimeMs: () => d.clockMs(),
    band: () => director.band(),
    intensity: () => director.intensity(),
    state: () => core.state(),
    hash: () => core.hash(),
    askedKeys: () => asked,
    outcomes: () => results,
    prematureAnswers: () => premature,
    director,
    driver: d,
  };
}
