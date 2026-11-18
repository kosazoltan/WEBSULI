/**
 * Képkocka-lap lejátszó a Web Animations API-val (terv: docs/specs/2026-11-18-kabala-fooldal.md, 4.4). A lap egy `<img>` egy
 * cellányi ablak mögött; a képkockaváltás lépcsős `transform`-animáció, az emelkedés (ugrás íve) külön `transform`-animáció a
 * burkolón — mindkettő a kompozitoron fut, képkockánkénti JS nincs. A klipek adatai a gyártott manifestből jönnek.
 */
export type SpriteClip = { frames: number[]; fps: number; loop: boolean; lift: number[] };
export type SpriteSheet = { cols: number; frames: number; clips: Record<string, SpriteClip> };

export const sheetRows = (sheet: Pick<SpriteSheet, "cols" | "frames">) => Math.ceil(sheet.frames / sheet.cols);

/** Egy képkocka helye a lapon, a lap SAJÁT méretének százalékában (a `translate` százaléka az elem saját dobozára vonatkozik). */
export function frameTransform(index: number, cols: number, rows: number): string {
  const x = ((index % cols) / cols) * 100;
  const y = (Math.floor(index / cols) / rows) * 100;
  return `translate(${x === 0 ? "0" : `-${Number(x.toFixed(4))}%`}, ${y === 0 ? "0" : `-${Number(y.toFixed(4))}%`})`;
}

/** Lépcsős kulcskockák: minden képkocka a következőig áll; az utolsó a klip végéig. */
export function frameKeyframes(clip: SpriteClip, cols: number, rows: number): Keyframe[] {
  const n = clip.frames.length;
  const frames: Keyframe[] = clip.frames.map((frame, i) => ({ offset: i / n, transform: frameTransform(frame, cols, rows), easing: "steps(1, end)" }));
  frames.push({ offset: 1, transform: frameTransform(clip.frames[n - 1], cols, rows) });
  return frames;
}

/** Az emelkedés kulcskockái (a cella magasságának hányada → képpont); a klip végén a figura a talajon van. */
export function liftKeyframes(clip: SpriteClip, heightPx: number): Keyframe[] | null {
  if (!clip.lift.some((v) => v > 0)) return null;
  const n = clip.lift.length;
  const frames: Keyframe[] = clip.lift.map((v, i) => ({ offset: i / n, transform: `translateY(${-Math.round(v * heightPx * 10) / 10}px)` }));
  frames.push({ offset: 1, transform: "translateY(0px)" });
  return frames;
}

export const clipDurationMs = (clip: SpriteClip) => (clip.frames.length / clip.fps) * 1000;

export type SpritePlayer = {
  /** Klipek egymás után. `repeat`: a sor a végén elölről indul; különben az utolsó klip, ha ismétlődő, a végtelenségig megy. */
  play: (names: readonly string[], options?: { repeat?: boolean }) => void;
  /** Minden leáll, a figura az alapképkockára áll. */
  stop: () => void;
};

export function createSpritePlayer(sheetEl: HTMLElement, liftEl: HTMLElement, sheet: SpriteSheet, heightPx: () => number): SpritePlayer {
  const rows = sheetRows(sheet);
  let running: Animation[] = [];
  let token = 0;

  const cancel = () => {
    token += 1;
    for (const animation of running) animation.cancel();
    running = [];
  };

  const start = (names: readonly string[], at: number, repeat: boolean, mine: number) => {
    if (mine !== token) return;
    const clip = sheet.clips[names[at]];
    if (!clip) return;
    const last = at === names.length - 1;
    const forever = last && !repeat && clip.loop;
    const timing: KeyframeAnimationOptions = { duration: clipDurationMs(clip), iterations: forever ? Infinity : 1, fill: "forwards" };
    for (const animation of running) animation.cancel();
    const frames = sheetEl.animate(frameKeyframes(clip, sheet.cols, rows), timing);
    running = [frames];
    const lift = liftKeyframes(clip, heightPx());
    if (lift) running.push(liftEl.animate(lift, { ...timing, easing: "linear" }));
    if (forever) return;
    frames.onfinish = () => {
      if (mine !== token) return;
      if (!last) start(names, at + 1, repeat, mine);
      else if (repeat) start(names, 0, repeat, mine);
    };
  };

  return {
    play(names, options) {
      cancel();
      start(names, 0, options?.repeat === true, token);
    },
    stop: cancel,
  };
}
