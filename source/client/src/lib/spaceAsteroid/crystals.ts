/**
 * Galaktikus Aszteroida — a Kristály-válasz tiszta magja (végrehajtás J6a; terv 5.6 „Q1 Kristály-válasz”).
 *
 * A kérdés a játék világában érkezik: 3–4 feliratozott kristály-aszteroida lebeg be a felső sávba (a játékos fölé, a
 * képernyő felső harmadába), és a válasz maga a célpont — a helyes kristály kilövése fejlesztést ad, a rossz kristály
 * apró sziklákra hasad (veszély, nem menetvég). A kristályok lassan, a saját „sávjukban” lebegnek, ezért soha nem
 * fedik egymást (a mobil mérő M2 pontja: a válaszcélok nem takarhatják egymást), és soha nem érnek a játékos mozgássávjába.
 *
 * Tiszta TypeScript: nincs DOM, three.js, React, óra, `Math.random` (őr: `T/game-sim-determinism-guard.test.ts`, KSZ-1/2).
 * A lap rajzol és vetít; a node-szimuláció (`sim.ts`) ugyanezt a modult hívja. A célzássegéd (`aimAssist.ts`) a kristályokra
 * NEM vonatkozik (U-J6-1): a lap a célzássegédnek csak az ellenfeleket adja át — a kristály kiválasztása a játékosé.
 */

import { estimateLines, promptLayout, type PromptViewport } from "@/game-engine/play/promptFit";

import { CAMERA_FOV_DEG, CAMERA_LOOK_Y, CAMERA_Y, CAMERA_Z, GAME_H, GAME_W, PLAYER_Y_MAX, visibleHalfWidth, type RockShard } from "./physics";

/** A kristály látványának sugara (játékegység). */
export const CRYSTAL_RADIUS = 0.9;
/** A találati gömb a látványnál nagyobb (KSZ-12: +15–25%): megbocsátóbb a célzás ujjal. */
export const CRYSTAL_HIT_FACTOR = 1.2;
/**
 * A kristály KÖZÉPPONTJA legalább ennyivel a játékos legfelső hajó-helye (`PLAYER_Y_MAX`) fölött marad (a hajó orra +0,7, a
 * kristály fél magassága ~0,9): ha a zónának van helye, a kristály soha nem ér a hajó sávjába.
 */
export const CRYSTAL_FLOOR_CLEARANCE = 1.6;
/**
 * A zóna legkisebb magassága (játékegység ≈ 64 px): a kérdés-kártya alatti hely keskeny telefonon kicsi, hosszú kérdésnél
 * a zóna LEJJEBB csúszik (a hajó felső sávjába) — a gomb (≥ 48 px) és a lebegés mindig belefér.
 */
export const CRYSTAL_MIN_ZONE_HEIGHT = 3.0;
/**
 * Lebegés: a sávon belüli vízszintes / függőleges kitérés felső korlátja (játékegység). ALAPÉRTÉK 0: a válaszcél a
 * logikai helyén ÁLL — ujjal így könnyebb eltalálni / megérinteni, a kristályok soha nem fedik egymást, és a mobil mérők
 * (M2, a joystick-mérő) stabil dobozt várnak. A „lebegés” a NÉZETÉ: a 3D kristály ring és a gomb fénye lassan billeg
 * (csökkentett mozgásnál nem). A modul a nem nulla kitérést is helyesen kezeli (a tesztek mindkettőt mérik).
 */
export const CRYSTAL_DRIFT_X = 0;
export const CRYSTAL_DRIFT_Y = 0;
/**
 * Egy opció felirata legfeljebb ennyi karakter: a keskeny (360 px-es) nézetben a kristály-gomb ~76 px széles, a felirat ≤ 2
 * sor 12–14 px-en. A hosszabb feliratú tételt a forrás hátrébb sorolja (`asteroidDirectorConfig.promptFits`).
 */
export const CRYSTAL_LABEL_MAX_CHARS = 22;

/**
 * A kristály-felirat méret-foka a leghosszabb SZÓ szerint (a szó nem törhet közepén, és a felirat nem csonkulhat — review #486 L2):
 * `normal` (≤ 8 karakteres szó, 14 px), `long` (9–12, 12 px), `wide` (13–16, 11 px, szélesebb gomb), `xwide` (≥ 17, 10 px, szélesebb gomb).
 * A kötőjel törési hely (a „Dunántúli-középhegység” két szóként számít).
 */
export type CrystalLabelTier = "normal" | "long" | "wide" | "xwide";
export function crystalLabelTier(label: string): CrystalLabelTier {
  const longest = label.split(/[\s-]+/u).reduce((m, w) => Math.max(m, w.length), 0);
  return longest >= 17 ? "xwide" : longest >= 13 ? "wide" : longest >= 9 ? "long" : "normal";
}

/** A felirat betűmérete (px) a méret-fok szerint (a lap CSS-ének tükre). */
export const CRYSTAL_TIER_FONT_PX: Record<CrystalLabelTier, number> = { normal: 14, long: 12, wide: 11, xwide: 10 };

/**
 * A felirat leghosszabb SZAVA befér-e a gomb szövegszélességébe a VALÓDI betűszélességgel (vak ellenőrzés L5): `measure(szó, px)` a
 * lap `canvas.measureText`-je (a teszt modellt ad). A gomb max-szélessége a CSS-ből: normal 98 px, long min(116, 32vw), wide / xwide
 * min(150, 40vw); a belső térköz 26 / 26 / 18 px.
 */
export function labelFitsChip(label: string, measure: (word: string, px: number) => number, viewportWidthPx: number): boolean {
  const tier = crystalLabelTier(label);
  const maxWidth = tier === "normal" ? 98 : tier === "long" ? Math.min(116, 0.32 * viewportWidthPx) : Math.min(150, 0.4 * viewportWidthPx);
  const inner = maxWidth - (tier === "wide" || tier === "xwide" ? 18 : 26);
  const px = CRYSTAL_TIER_FONT_PX[tier];
  return label.split(/[\s-]+/u).every((w) => measure(w, px) <= inner);
}

/**
 * Beférnek-e az opciók a kristály-feliratba (a forrás-választás szűrője; tiszta, olcsó): karakterszám ÉS — ha a hívó ad — a mért
 * szélesség (`fits`, pl. `labelFitsChip`). Ha nem férnek be, a számozott kristályok + a teljes szövegű jelmagyarázat jön.
 */
export function crystalLabelsFit(options: readonly string[], fits?: (label: string) => boolean): boolean {
  return options.every((o) => o.length <= CRYSTAL_LABEL_MAX_CHARS && (fits ? fits(o) : true));
}

/** A rossz kristályból ennyi apró szikla hasad. */
export const CRYSTAL_SHARD_COUNT = 3;
/** A hasadék-szikla kezdő lefelé sebessége (egység / mp, a játékos felé): a veszély látható, de kitérhető. */
export const CRYSTAL_SHARD_VY_MIN = -3.4;
export const CRYSTAL_SHARD_VY_MAX = -2.4;

/** A kristályzóna a játéksíkon (világkoordináta). */
export type CrystalBounds = { minX: number; maxX: number; minY: number; maxY: number };

export type Crystal = {
  /** Menetenként / kérdésenként egyedi azonosító (a bemutatott kérdés azonosítójából és az opció-indexből). */
  id: number;
  /** A `QuestionPresentation.options` indexe — ez a válasz. */
  optionIndex: number;
  /** Az opció felirata (a lap a DOM-gombra írja). */
  label: string;
  /** A tárolt helyes / rossz jelölés (a `hitCrystal` ebből ítél; a lap a megoldás-kijelzéshez is ezt olvassa). */
  correct: boolean;
  x: number;
  y: number;
  /** A sáv közepe, amely körül a kristály lebeg. */
  homeX: number;
  homeY: number;
  /** A lebegés fázisa (rad), fázis-eltolás és kitérés — seedelt. */
  phase: number;
  driftX: number;
  driftY: number;
  /** false: már eltalálták (egyszer lehet válaszolni). */
  alive: boolean;
};

export type CrystalPresentation = {
  id: number;
  options: ReadonlyArray<{ label: string; correct: boolean }>;
};

/** A hasadék-sziklák helyi alakja (a lap `EnemyState`-té alakítja). */
export type CrystalShard = RockShard;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * A kristályzóna: `halfWidth` a LÁTHATÓ félszélesség a játéksíkon (kamera), `minY` / `maxY` a kért alsó / felső perem
 * (a lap a kérdés-kártya alatti sávot kéri). Az alsó perem nem lehet a hajó legfelső helye fölötti `CRYSTAL_FLOOR_CLEARANCE`
 * alatt — kivéve, ha ettől a zóna `minHeight`-nál alacsonyabb lenne: akkor a zóna a felső pereméből lefelé nyúlik.
 */
export function crystalBounds(args: { halfWidth: number; minY: number; maxY: number; margin?: number; minHeight?: number }): CrystalBounds {
  const margin = args.margin ?? 0.4;
  const minHeight = args.minHeight ?? CRYSTAL_MIN_ZONE_HEIGHT;
  const half = Number.isFinite(args.halfWidth) && args.halfWidth > 0 ? args.halfWidth : 9;
  const floor = PLAYER_Y_MAX + CRYSTAL_FLOOR_CLEARANCE;
  const top = Math.min(Number.isFinite(args.maxY) ? args.maxY : 6, GAME_H / 2 - CRYSTAL_RADIUS);
  let bottom = Math.max(Number.isFinite(args.minY) ? args.minY : 0, floor);
  if (top - bottom < minHeight) bottom = top - minHeight;
  const side = Math.max(CRYSTAL_RADIUS * 2, half - margin);
  return { minX: -side, maxX: side, minY: bottom, maxY: top };
}

/** A lebegés kitérése (játékegység); alapértéke `CRYSTAL_DRIFT_X / Y` (0: a cél áll), a tesztek nem nullát is kérhetnek. */
export type CrystalDrift = { x?: number; y?: number };

/** A sávok elrendezése: sávszélesség, megengedett kitérés és a két sor magassága (páros: fent, páratlan: lent). */
function layout(bounds: CrystalBounds, n: number, drift?: CrystalDrift) {
  const lane = (bounds.maxX - bounds.minX) / n;
  const driftX = Math.max(0, Math.min(drift?.x ?? CRYSTAL_DRIFT_X, lane / 2 - CRYSTAL_RADIUS * 1.15));
  const height = Math.max(0, bounds.maxY - bounds.minY);
  const driftY = Math.min(drift?.y ?? CRYSTAL_DRIFT_Y, height / 4);
  return { lane, driftX, driftY, rowLow: bounds.minY + driftY, rowHigh: bounds.maxY - driftY };
}

/**
 * 3–4 kristály a kérdés opcióiból: az opció-sorrend a director által seedelten kevert sorrend, a sávok balról jobbra
 * követik. Páros / páratlan sávok váltakozó magasságon (a feliratok így sem fedik egymást keskeny nézetben), a lebegés
 * fázisa és kitérése seedelt. A kitérés sávon belül marad: két szomszéd kristály közepe soha nincs `2 × sugár`-nál közelebb.
 */
export function spawnCrystals(presentation: CrystalPresentation, bounds: CrystalBounds, rng: () => number, drift?: CrystalDrift): Crystal[] {
  const n = presentation.options.length;
  if (n < 2) return [];
  const { lane, driftX, driftY, rowLow, rowHigh } = layout(bounds, n, drift);
  const out: Crystal[] = [];
  for (let i = 0; i < n; i++) {
    const opt = presentation.options[i]!;
    const homeX = bounds.minX + lane * (i + 0.5);
    const homeY = i % 2 === 0 ? rowHigh : rowLow;
    const c: Crystal = {
      id: presentation.id * 8 + i,
      optionIndex: i,
      label: opt.label,
      correct: opt.correct,
      x: homeX,
      y: homeY,
      homeX,
      homeY,
      phase: rng() * Math.PI * 2,
      driftX: driftX * (0.55 + 0.45 * rng()),
      driftY: driftY * (0.55 + 0.45 * rng()),
      alive: true,
    };
    placeCrystal(c);
    out.push(c);
  }
  return out;
}

/** A kristály helye a fázisából: a sáv közepe + lassú, egymástól független 8-as mozgás (korlátos kitérés). */
function placeCrystal(c: Crystal): void {
  c.x = c.homeX + c.driftX * Math.sin(c.phase);
  c.y = c.homeY + c.driftY * Math.sin(c.phase * 1.45 + 0.7);
}

/**
 * A zóna megváltozott (a kérdés-kártya magassága a hosszú prompttól / a megoldás-sortól függ): a sávok közepe `ease`
 * (0..1) arányban az új helyre húzódik — a kristályok nem ugranak. Az `ease = 1` azonnal átrendez.
 */
export function rezoneCrystals(crystals: Crystal[], bounds: CrystalBounds, ease = 1, drift?: CrystalDrift): void {
  const n = crystals.length;
  if (n < 2) return;
  const k = Math.min(1, Math.max(0, ease));
  const { lane, driftX, driftY, rowLow, rowHigh } = layout(bounds, n, drift);
  for (const c of crystals) {
    const i = c.optionIndex;
    const targetX = bounds.minX + lane * (i + 0.5);
    const targetY = i % 2 === 0 ? rowHigh : rowLow;
    c.homeX += (targetX - c.homeX) * k;
    c.homeY += (targetY - c.homeY) * k;
    c.driftX = Math.min(c.driftX, driftX);
    c.driftY = Math.min(c.driftY, driftY);
    placeCrystal(c);
  }
}

/** Lépteti a lebegést (`dtSec` játékidő). */
export function stepCrystals(crystals: Crystal[], dtSec: number): void {
  if (!(dtSec > 0)) return;
  for (const c of crystals) {
    if (!c.alive) continue;
    // A fázis tolódik, a hely a fázisból jön: nincs állapot-torzulás hosszú futásnál, és a kitérés korlátos marad.
    c.phase += dtSec * 0.55;
    placeCrystal(c);
  }
}

export type CrystalHit = { crystal: Crystal; correct: boolean };

/**
 * A kristály-azonosító szerinti találat: a helyes választ a kristály maga hordozza, a modul semmit nem kérdez vissza.
 * Idempotens: ugyanarra a kristályra a második hívás `null` (két ujj / két lövedék egy képkockában — csak az első számít,
 * K.2). A találat után a kristály `alive = false`.
 */
export function hitCrystal(crystals: Crystal[], id: number): CrystalHit | null {
  const c = crystals.find((x) => x.id === id);
  if (!c || !c.alive) return null;
  c.alive = false;
  return { crystal: c, correct: c.correct };
}

/** Az élő kristály, amelynek (megnagyobbított) találati gömbjébe esik a pont — lövedék-ütközés. */
export function crystalAt(crystals: readonly Crystal[], x: number, y: number, bulletRadius = 0.12): Crystal | null {
  const r = CRYSTAL_RADIUS * CRYSTAL_HIT_FACTOR + bulletRadius;
  let best: Crystal | null = null;
  let bestD = Infinity;
  for (const c of crystals) {
    if (!c.alive) continue;
    const dx = c.x - x;
    const dy = c.y - y;
    const d = dx * dx + dy * dy;
    if (d < r * r && d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * A rossz kristály hasadéka: `CRYSTAL_SHARD_COUNT` apró (1-es méretű) szikla, a hajó felé hullva. A `splitRock`
 * mintájára (`physics.ts`): egymástól szétnyíló vízszintes sebesség, a lefelé sebesség alulról korlátos.
 */
export function crystalShards(at: { x: number; y: number }, rng: () => number): CrystalShard[] {
  const out: CrystalShard[] = [];
  for (let k = 0; k < CRYSTAL_SHARD_COUNT; k++) {
    const side = k - (CRYSTAL_SHARD_COUNT - 1) / 2; // -1, 0, 1
    out.push({
      x: at.x + side * 0.45,
      y: at.y - 0.2 - Math.abs(side) * 0.15,
      vx: side * (1.5 + rng() * 0.8) + (rng() - 0.5) * 0.6,
      vy: clamp(CRYSTAL_SHARD_VY_MIN + rng() * (CRYSTAL_SHARD_VY_MAX - CRYSTAL_SHARD_VY_MIN), CRYSTAL_SHARD_VY_MIN, CRYSTAL_SHARD_VY_MAX),
      size: 1,
    });
  }
  return out;
}

/* ----------------------- élesítés és szándékos célzás (review #486 M2) ----------------------- */

/** A kristály a megjelenése után ennyi ms-ig „élesedik”: nem választható (KSZ-11: ≥ 400 ms előjelzés a kérdés-kapu előtt). */
export const CRYSTAL_ARM_MS = 500;

/**
 * Választ-e a lövedék a kristályon. Csak akkor, ha (1) a kérdés megjelenése + élesítés után telt el az idő, ÉS (2) a lövedék tűz-
 * megnyomása (`pressAtMs`) ezután történt: a tartott tűz és a kérdés előtt kilőtt lövedék soha nem „válaszol” — a gyerek olvasás
 * nélkül, véletlenül nem lő rossz választ. Az idők a kérdés-óra ms-ai.
 */
export function bulletCountsAsAnswer(a: { nowMs: number; shownAtMs: number; pressAtMs: number; /** a hármas lövés oldalsó lövedéke: soha nem válaszol (L1) */ side?: boolean }): boolean {
  if (a.side === true) return false;
  const armedAt = a.shownAtMs + CRYSTAL_ARM_MS;
  return a.nowMs >= armedAt && a.pressAtMs >= armedAt;
}

/* ----------------------- a zóna meghatározása a magban (review #486, KSZ-1) ----------------------- */

/**
 * A játéksík y-koordinátája a vászon függőleges hányadánál (0 = felső, 1 = alsó él): a `three.js` kamera `unproject`
 * számítása tisztán, a kamera-állandókból (a lap `CAMERA_*` értékei). A rajz nem számol, csak olvassa az eredményt.
 */
export function worldYAtScreenFrac(frac: number): number {
  const fy = CAMERA_LOOK_Y - CAMERA_Y;
  const fz = -CAMERA_Z;
  const flen = Math.hypot(fy, fz);
  const f = { y: fy / flen, z: fz / flen };
  // a kamera „fel” vektora: merőleges az előre-vektorra, +y felé
  const u = { y: -f.z, z: f.y };
  const k = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360);
  const ndc = 1 - 2 * frac;
  const dy = f.y + ndc * k * u.y;
  const dz = f.z + ndc * k * u.z;
  if (Math.abs(dz) < 1e-6) return CAMERA_LOOK_Y;
  const t = -CAMERA_Z / dz;
  return CAMERA_Y + dy * t;
}

/** A kérdés-kártya fix részei (px): fejléc (jelvény + időcsík + szünet), lábléc (állapot-sor) és a belső térközök. */
export const PLAY_QUESTION_CARD_CHROME_PX = 92;
/** A kártya a nézet tetejétől ennyi px-re kezdődik (`index.css`: `--play-question-top` = biztonsági sáv + 80; fekvőn + 60). */
export function playQuestionTopPx(vp: PromptViewport, safeTopPx: number): number {
  const landscape = vp.width > vp.height && vp.height <= 520;
  return Math.max(4, safeTopPx) + (landscape ? 60 : 80);
}

/** A kártya becsült magassága (px): a prompt becsült sorai + a fix részek. Óvatos (a becslő széles betűt feltételez). */
export function estimateCardHeightPx(prompt: string, vp: PromptViewport): number {
  const { textWidthPx, fontPx, lineHeightPx } = promptLayout(vp, prompt.length);
  const lines = Math.min(7, Math.max(1, estimateLines(prompt, textWidthPx, fontPx)));
  return PLAY_QUESTION_CARD_CHROME_PX + lines * lineHeightPx;
}

/** A kristály-gomb fél magassága (px): 48 px a legkisebb érintési cél + a lebegés ráhagyása. */
export const CRYSTAL_CHIP_HALF_PX = 26;
/** A két kristály-sor legkisebb függőleges távolsága (px). */
export const CRYSTAL_MIN_ROW_GAP_PX = 72;
/** A zóna legalsó pereme a vászon magasságának ennyi hányadánál (a kártya alatti sáv alja, ha több hely van). */
export const CRYSTAL_ZONE_BOTTOM_FRAC = 0.52;

/**
 * A kristály-zóna a játéksíkon, a kérdés bemutatásakor EGYSZER eldöntve (nincs képkockánkénti újramérés). Bemenet: a
 * vászon mérete és a nézethez képesti helye (`boxTopPx`), a kérdés prompt-ja és a nézet (a kártya becsült magasságához),
 * a biztonsági sáv. Kimenet: `CrystalBounds`, amelyet a lap csak olvas.
 */
export function crystalZoneFor(args: {
  boxWidthPx: number;
  boxHeightPx: number;
  boxTopPx: number;
  viewport: PromptViewport;
  prompt: string;
  safeTopPx: number;
}): CrystalBounds {
  const h = Math.max(1, args.boxHeightPx);
  const cardBottom = playQuestionTopPx(args.viewport, args.safeTopPx) + estimateCardHeightPx(args.prompt, args.viewport);
  const topFrac = Math.min(0.7, Math.max(0.05, (cardBottom + 10 + CRYSTAL_CHIP_HALF_PX - args.boxTopPx) / h));
  const bottomFrac = Math.min(0.85, Math.max(topFrac + CRYSTAL_MIN_ROW_GAP_PX / h, CRYSTAL_ZONE_BOTTOM_FRAC));
  const topY = worldYAtScreenFrac(topFrac);
  const bottomY = worldYAtScreenFrac(bottomFrac);
  const aspect = args.boxWidthPx / h;
  return crystalBounds({
    halfWidth: Math.min(GAME_W / 2, visibleHalfWidth(CAMERA_FOV_DEG, aspect, CAMERA_Z)),
    minY: bottomY,
    maxY: topY,
    minHeight: Math.max(CRYSTAL_MIN_ZONE_HEIGHT, topY - worldYAtScreenFrac(topFrac + CRYSTAL_MIN_ROW_GAP_PX / h)),
  });
}
