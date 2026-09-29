import { useEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

import { LOOK_BUDGET, SparkleField, useThreeScene, type ThreeSceneContext, type ThreeSceneController } from "../three-look";
import {
  QUIZ3D_BOARD_STYLE,
  QUIZ3D_FOV_DEG,
  QUIZ3D_OPTION_ACCENTS,
  QUIZ3D_OPTION_FONT_PX,
  QUIZ3D_PROMPT_FONT_PX,
  QUIZ3D_TILE_DEPTH,
  QUIZ3D_TILE_STYLES,
  cameraDistanceFor,
  rectToWorld,
  wrapLines,
  type TileState,
} from "./quizBoardLayout";

/**
 * Szólétra — a kérdéstábla és a 4 válaszlap a three.js jelenetben (spec 2026-09-29-palyak-szoletra-nyelvek, 7. döntés).
 *
 * A DOM a layout forrása: a kérdés (`[data-quiz3d-prompt]`) és a gombok (`[data-quiz3d-option]`) a helyükön maradnak,
 * átlátszóan; a lapok pontosan a téglalapjukra kerülnek. Keskeny látószögű kamera, a lapok arca a z = 0 síkon
 * (1 egység = 1 CSS px) → torzításmentes, a betűméret CSS px-ben pontos. A lapok raycasttal érinthetők; a jó válasz
 * zölden kiugrik és csillámlik, a rossz pirosan megrázkódik. Csökkentett mozgásnál az állapotok azonnaliak.
 */

export type QuizBoard3DProps = {
  /** Kérdésenként változik: új kérdésnél a lapok újra „felpattannak”. */
  questionKey: string;
  prompt: string;
  options: readonly string[];
  /** Lapállapot opciónként (idle / correct / wrong / dim). */
  states: readonly TileState[];
  /** Választható-e most (quiz fázis). */
  interactive: boolean;
  /** A panel, amelyet a vászon lefed, és amelyben a DOM-elemek vannak. */
  layoutRef: RefObject<HTMLElement | null>;
  onAnswer: (index: number) => void;
  onSupportedChange?: (supported: boolean | null) => void;
};

type Rect = { left: number; top: number; width: number; height: number };

type Card = {
  group: THREE.Group;
  face: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  edge: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  drawnKey: string;
  rect: Rect | null;
  /** Animation state. */
  appear: number;
  hover: number;
  press: number;
  spin: number;
  shake: number;
  lift: number;
  lastState: TileState | "board";
  /** Last drawn font size (CSS px) and whether its lines had to be tightened. */
  fontPx: number;
  tight: boolean;
};

const RADIUS = 14;
const OPTION_LINE = 25;
const PROMPT_LINE = 29;
const BADGE = 28;
const TEXT_LEFT = 51;
const TEXT_RIGHT = 13;

const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

let shadowTex: THREE.CanvasTexture | null = null;
function softShadowTexture(): THREE.CanvasTexture | null {
  if (shadowTex) return shadowTex;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.filter = "blur(10px)";
  ctx.fillStyle = "rgba(0,0,0,1)";
  roundRectPath(ctx, 22, 22, 84, 84, 16);
  ctx.fill();
  shadowTex = new THREE.CanvasTexture(c);
  shadowTex.colorSpace = THREE.SRGBColorSpace;
  return shadowTex;
}

function makeCard(scene: THREE.Object3D, edgeColor: string): Card {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const group = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }),
  );
  face.position.z = 0.5;
  const edge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRectShape(10, 10, 4), { depth: QUIZ3D_TILE_DEPTH, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.45, metalness: 0.05 }),
  );
  edge.position.z = -QUIZ3D_TILE_DEPTH - 0.5;
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: softShadowTexture(), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }),
  );
  shadow.position.z = -QUIZ3D_TILE_DEPTH - 4;
  group.add(shadow, edge, face);
  group.visible = false;
  scene.add(group);
  return { group, face, edge, shadow, canvas, texture, drawnKey: "", rect: null, appear: 1, hover: 0, press: 0, spin: 0, shake: 0, lift: 0, lastState: "idle", fontPx: 0, tight: false };
}

function sizeCard(card: Card, w: number, h: number) {
  card.face.scale.set(w, h, 1);
  // The blurred shadow sprite has a 22 px margin on a 128 px texture: scale so the solid part matches the card.
  card.shadow.scale.set(w * (128 / 84), h * (128 / 84), 1);
  card.shadow.position.set(5, -8, card.shadow.position.z);
  card.edge.geometry.dispose();
  card.edge.geometry = new THREE.ExtrudeGeometry(roundedRectShape(w, h, RADIUS), {
    depth: QUIZ3D_TILE_DEPTH,
    bevelEnabled: false,
    curveSegments: 6,
  });
}

type DrawSpec = {
  w: number;
  h: number;
  pr: number;
  font: string;
  text: string;
  kind: "option" | "prompt";
  state: TileState;
  index: number;
};

/** Draws one card face; returns the CSS-px font size used and whether the lines had to be tightened to fit. */
function drawCard(card: Card, spec: DrawSpec): { fontPx: number; tight: boolean } {
  const { w, h, pr } = spec;
  const cw = Math.max(4, Math.round(w * pr));
  const ch = Math.max(4, Math.round(h * pr));
  if (card.canvas.width !== cw || card.canvas.height !== ch) {
    card.canvas.width = cw;
    card.canvas.height = ch;
    // A resized canvas needs a fresh GPU texture of the new size.
    card.texture.dispose();
  }
  const ctx = card.canvas.getContext("2d");
  if (!ctx) return { fontPx: 0, tight: false };
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const isPrompt = spec.kind === "prompt";
  const style = isPrompt ? null : QUIZ3D_TILE_STYLES[spec.state];
  const face = isPrompt ? QUIZ3D_BOARD_STYLE.face : style!.face;
  const text = isPrompt ? QUIZ3D_BOARD_STYLE.text : style!.text;
  const border = isPrompt ? QUIZ3D_BOARD_STYLE.edge : spec.state === "idle" ? QUIZ3D_OPTION_ACCENTS[spec.index % 4]! : style!.edge;

  roundRectPath(ctx, 1, 1, w - 2, h - 2, RADIUS);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = border;
  roundRectPath(ctx, 1.5, 1.5, w - 3, h - 3, RADIUS - 1);
  ctx.stroke();

  const fontPx = isPrompt ? QUIZ3D_PROMPT_FONT_PX : QUIZ3D_OPTION_FONT_PX;
  let lineH = isPrompt ? PROMPT_LINE : OPTION_LINE;
  const weight = isPrompt ? 800 : 700;
  const left = isPrompt ? 17 : TEXT_LEFT;
  const maxWidth = isPrompt ? w - 34 : w - TEXT_LEFT - TEXT_RIGHT;
  ctx.font = `${weight} ${fontPx}px ${spec.font}`;
  const lines = wrapLines(spec.text, maxWidth, (s) => ctx.measureText(s).width);
  // The DOM decides the height with the same font; if the canvas wraps one more line (sub-pixel metric
  // differences), tighten the line spacing — never the font below the spec minimum.
  const room = h - 8;
  const naturalLineH = lineH;
  // Review #145: a betű sosem megy a vállalt minimum (kérdés 22 px, válasz 20 px) alá — helyhiánynál csak a sorköz
  // szorul (legfeljebb a betűmagasságig); a DOM-kártya magassága ugyanazzal a betűvel mér, így a szöveg elfér.
  if (lines.length * lineH > room) lineH = Math.max(fontPx, Math.floor(room / lines.length));
  ctx.fillStyle = text;
  ctx.textBaseline = "middle";
  ctx.textAlign = isPrompt ? "center" : "left";
  const top = (h - lines.length * lineH) / 2 + lineH / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, isPrompt ? w / 2 : left, top + i * lineH);
  });

  if (!isPrompt) {
    // Number badge (keyboard 1–4).
    const cx = 13 + BADGE / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, BADGE / 2, 0, Math.PI * 2);
    ctx.fillStyle = spec.state === "idle" ? QUIZ3D_OPTION_ACCENTS[spec.index % 4]! : style!.badge;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, BADGE / 2 - 3, 0, Math.PI * 2);
    ctx.fillStyle = style!.badge;
    ctx.fill();
    ctx.fillStyle = style!.badgeText;
    ctx.textAlign = "center";
    ctx.font = `800 16px ${spec.font}`;
    const mark = spec.state === "correct" ? "✓" : spec.state === "wrong" ? "✗" : String(spec.index + 1);
    ctx.fillText(mark, cx, cy + 1);
  }
  card.texture.needsUpdate = true;
  return { fontPx, tight: lineH < naturalLineH || lines.length * lineH > h };
}

function setupQuizBoard(
  ctx: ThreeSceneContext,
  propsRef: { current: QuizBoard3DProps },
  wrapperRef: RefObject<HTMLDivElement | null>,
): ThreeSceneController {
  const { scene, renderer, reducedMotion, tier } = ctx;
  const budget = LOOK_BUDGET[tier];
  // Readable text needs the designed colours on screen. On the high tier the composer's OutputPass tone-maps the whole
  // image (it ignores `toneMapped: false`), so this layer renders without tone mapping on every tier.
  renderer.toneMapping = THREE.NoToneMapping;
  const camera = new THREE.PerspectiveCamera(QUIZ3D_FOV_DEG, 1, 1, 10000);

  scene.add(new THREE.HemisphereLight("#ffffff", "#5b6b8c", 2.2));
  const sun = new THREE.DirectionalLight("#ffffff", 2.4);
  sun.position.set(-0.4, 0.8, 1);
  scene.add(sun);

  const board = makeCard(scene, QUIZ3D_BOARD_STYLE.edge);
  board.lastState = "board";
  const tiles = [0, 1, 2, 3].map((i) => makeCard(scene, QUIZ3D_OPTION_ACCENTS[i]!));
  const sparkles = reducedMotion ? null : new SparkleField(scene, Math.round(220 * budget.particleScale) + 60);

  // Floating letters far behind the cards: gentle, colourful, never over the text (the cards are opaque).
  const letters: Array<{ sprite: THREE.Sprite; speed: number; x: number; phase: number }> = [];
  const glyphs = ["A", "B", "C", "?", "!", "★", "a", "é", "ß", "ç"];
  const letterColors = ["#fde047", "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#c4b5fd"];
  const letterCount = Math.max(4, Math.round(12 * budget.particleScale));
  for (let i = 0; i < letterCount; i++) {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const g = c.getContext("2d");
    if (!g) break;
    g.font = "800 48px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = letterColors[i % letterColors.length]!;
    g.fillText(glyphs[i % glyphs.length]!, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false }));
    sprite.scale.set(34, 34, 1);
    sprite.position.z = -900 - (i % 3) * 250;
    scene.add(sprite);
    letters.push({ sprite, speed: 14 + (i % 5) * 6, x: ((i * 0.618) % 1) - 0.5, phase: i * 1.7 });
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let viewW = 1;
  let viewH = 1;
  let hovered = -1;
  let pressed = -1;
  let lastQuestion = "";
  let lastMeasure = -1;
  let fontVersion = 0;
  let drawnFontVersion = -1;
  const tmpV = new THREE.Vector3();

  const measure = () => {
    const wrapper = wrapperRef.current;
    const layout = propsRef.current.layoutRef.current;
    if (!wrapper || !layout) return false;
    const base = wrapper.getBoundingClientRect();
    const rel = (el: Element | null): Rect | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return null;
      return { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height };
    };
    const promptEl = layout.querySelector("[data-quiz3d-prompt]");
    const optionEls = Array.from(layout.querySelectorAll("[data-quiz3d-option]"));
    let changed = false;
    const apply = (card: Card, r: Rect | null) => {
      const prev = card.rect;
      const same =
        (prev === null && r === null) ||
        (prev !== null && r !== null && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.top - r.top) < 0.5 && Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5);
      if (same) return;
      changed = true;
      card.rect = r;
      card.drawnKey = "";
      if (r) sizeCard(card, r.width, r.height);
    };
    apply(board, rel(promptEl));
    tiles.forEach((t, i) => apply(t, rel(optionEls[i] ?? null)));
    return changed;
  };

  const fontFamily = () => {
    const el = propsRef.current.layoutRef.current?.querySelector("[data-quiz3d-option]");
    return el ? getComputedStyle(el).fontFamily || "system-ui, sans-serif" : "system-ui, sans-serif";
  };

  const redraw = () => {
    const p = propsRef.current;
    const pr = renderer.getPixelRatio();
    const font = fontFamily();
    let redrawn = false;
    const draw = (card: Card, spec: Omit<DrawSpec, "w" | "h" | "pr" | "font">) => {
      if (!card.rect) return;
      const key = `${spec.kind}|${spec.text}|${spec.state}|${card.rect.width}x${card.rect.height}|${pr}|${font}|${fontVersion}`;
      if (key === card.drawnKey) return;
      card.drawnKey = key;
      const res = drawCard(card, { ...spec, w: card.rect.width, h: card.rect.height, pr, font });
      card.fontPx = res.fontPx;
      card.tight = res.tight;
      redrawn = true;
    };
    draw(board, { kind: "prompt", text: p.prompt, state: "idle", index: 0 });
    tiles.forEach((t, i) => draw(t, { kind: "option", text: p.options[i] ?? "", state: p.states[i] ?? "idle", index: i }));
    if (!redrawn) return;
    // Measurement hooks for the browser check (spec E5): smallest drawn font (CSS px), cards with tightened lines.
    const drawn = [board, ...tiles].filter((c) => c.rect && c.fontPx > 0);
    const minPx = Math.min(...drawn.map((c) => c.fontPx));
    if (Number.isFinite(minPx)) wrapperRef.current?.setAttribute("data-font-px", String(minPx));
    wrapperRef.current?.setAttribute("data-tight", String(drawn.filter((c) => c.tight).length));
  };

  if (typeof document !== "undefined" && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      fontVersion += 1;
    });
  }

  const pick = (clientX: number, clientY: number): number => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return -1;
    const r = wrapper.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const faces = tiles.filter((t) => t.group.visible).map((t) => t.face);
    const hit = raycaster.intersectObjects(faces, false)[0];
    return hit ? tiles.findIndex((t) => t.face === hit.object) : -1;
  };

  const layoutEl = propsRef.current.layoutRef.current;
  const onMove = (e: PointerEvent) => {
    hovered = propsRef.current.interactive ? pick(e.clientX, e.clientY) : -1;
  };
  const onLeave = () => {
    hovered = -1;
    pressed = -1;
  };
  const onDown = (e: PointerEvent) => {
    pressed = propsRef.current.interactive ? pick(e.clientX, e.clientY) : -1;
    hovered = pressed;
  };
  const onUp = () => {
    pressed = -1;
  };
  const onClick = (e: MouseEvent) => {
    // The transparent DOM button above the card answers by itself; the raycast answers when the pointer hit a card
    // but no button (an animated card reaching past its button).
    const target = e.target as Element | null;
    if (target?.closest("[data-quiz3d-option]")) return;
    const p = propsRef.current;
    if (!p.interactive) return;
    const idx = pick(e.clientX, e.clientY);
    if (idx >= 0) p.onAnswer(idx);
  };
  layoutEl?.addEventListener("pointermove", onMove);
  layoutEl?.addEventListener("pointerleave", onLeave);
  layoutEl?.addEventListener("pointerdown", onDown);
  layoutEl?.addEventListener("pointerup", onUp);
  layoutEl?.addEventListener("click", onClick);

  const placeCard = (card: Card, extra: { z: number; rx: number; ry: number; rz: number; x: number; y: number; s: number }) => {
    if (!card.rect) {
      card.group.visible = false;
      return;
    }
    const w = rectToWorld(card.rect, viewW, viewH);
    card.group.visible = true;
    card.group.position.set(w.x + extra.x, w.y + extra.y, extra.z);
    card.group.rotation.set(extra.rx, extra.ry, extra.rz);
    card.group.scale.setScalar(extra.s);
  };

  const update = (dt: number, elapsed: number) => {
    const p = propsRef.current;
    if (elapsed - lastMeasure > 0.2 || lastMeasure < 0) {
      lastMeasure = elapsed;
      measure();
    }
    if (drawnFontVersion !== fontVersion) {
      drawnFontVersion = fontVersion;
      board.drawnKey = "";
      tiles.forEach((t) => (t.drawnKey = ""));
    }
    redraw();

    // New question: cards pop in (staggered), unless motion is reduced.
    if (p.questionKey !== lastQuestion) {
      lastQuestion = p.questionKey;
      measure();
      redraw();
      const start = reducedMotion ? 1 : 0;
      board.appear = start;
      tiles.forEach((t, i) => {
        t.appear = reducedMotion ? 1 : -0.12 * (i + 1);
        t.spin = 0;
        t.shake = 0;
        t.lift = 0;
        t.lastState = "idle";
      });
    }

    const k = reducedMotion ? 1 : 1 - Math.exp(-12 * dt);
    // Board.
    board.appear = Math.min(1, board.appear + dt / 0.45);
    const be = reducedMotion ? 1 : easeOutBack(Math.max(0, board.appear));
    placeCard(board, {
      x: 0,
      y: 0,
      z: reducedMotion ? 0 : Math.sin(elapsed * 1.3) * 1.5,
      rx: reducedMotion ? 0 : (1 - Math.min(1, board.appear)) * -0.9 + Math.sin(elapsed * 0.9) * 0.012,
      ry: 0,
      rz: 0,
      s: 0.7 + 0.3 * be,
    });

    tiles.forEach((t, i) => {
      const state = p.states[i] ?? "idle";
      if (state !== t.lastState) {
        if (state === "correct" && !reducedMotion) {
          t.spin = 1;
          if (sparkles && t.rect) {
            const w = rectToWorld(t.rect, viewW, viewH);
            tmpV.set(w.x, w.y, 40);
            sparkles.emit(tmpV, { count: 46, color: "#fde047", speed: 320, life: 0.9, gravity: 260, size: 12, spread: Math.min(w.w, 160) });
            sparkles.emit(tmpV, { count: 24, color: "#86efac", speed: 240, life: 0.8, gravity: 200, size: 10, spread: 60 });
          }
        }
        if (state === "wrong" && !reducedMotion) t.shake = 1;
        t.lastState = state;
      }
      t.appear = Math.min(1, t.appear + dt / 0.42);
      const a = Math.max(0, t.appear);
      const e = reducedMotion ? 1 : easeOutBack(a);
      const wantHover = hovered === i && state === "idle" && p.interactive ? 1 : 0;
      t.hover += (wantHover - t.hover) * k;
      t.press += ((pressed === i && p.interactive ? 1 : 0) - t.press) * k;
      const wantLift = state === "correct" ? 1 : state === "dim" ? -0.6 : 0;
      t.lift += (wantLift - t.lift) * (reducedMotion ? 1 : 1 - Math.exp(-7 * dt));
      t.spin = Math.max(0, t.spin - dt / 0.7);
      t.shake = Math.max(0, t.shake - dt / 0.55);
      const spinT = 1 - t.spin;
      const spin = t.spin > 0 ? (spinT < 0.5 ? 2 * spinT * spinT : 1 - Math.pow(-2 * spinT + 2, 2) / 2) * Math.PI * 2 : 0;
      const bob = reducedMotion ? 0 : Math.sin(elapsed * 1.7 + i * 1.3) * 1.6;
      placeCard(t, {
        x: t.shake > 0 ? Math.sin(t.shake * 38) * 9 * t.shake : 0,
        y: 0,
        z: bob + t.hover * 10 - t.press * 6 + t.lift * 22,
        rx: reducedMotion ? 0 : (1 - Math.min(1, a)) * 0.8 - t.hover * 0.06,
        ry: spin,
        rz: t.shake > 0 ? Math.sin(t.shake * 30) * 0.05 * t.shake : 0,
        s: a <= 0 ? 0.001 : 0.6 + 0.4 * e,
      });
      if (a <= 0) t.group.visible = false;
    });

    letters.forEach((l, i) => {
      const scaleAtDepth = (camera.position.z - l.sprite.position.z) / camera.position.z;
      const halfW = (viewW / 2) * scaleAtDepth;
      const halfH = (viewH / 2) * scaleAtDepth;
      if (!reducedMotion) l.phase += dt * 0.25;
      const yRange = halfH * 2 + 80;
      const y = reducedMotion ? ((i * 0.37) % 1) * yRange - yRange / 2 : ((elapsed * l.speed + i * 97) % yRange) - yRange / 2;
      l.sprite.position.set(l.x * halfW * 1.8 + Math.sin(l.phase) * 20, y, l.sprite.position.z);
    });

    sparkles?.update(dt);
  };

  return {
    camera,
    update,
    resize: (w, h) => {
      viewW = w;
      viewH = h;
      const d = cameraDistanceFor(h, QUIZ3D_FOV_DEG);
      camera.position.set(0, 0, d);
      camera.near = Math.max(1, d - 600);
      camera.far = d + 2400;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      sparkles?.setViewportHeight(renderer.domElement.height, QUIZ3D_FOV_DEG);
      lastMeasure = -1;
    },
    dispose: () => {
      layoutEl?.removeEventListener("pointermove", onMove);
      layoutEl?.removeEventListener("pointerleave", onLeave);
      layoutEl?.removeEventListener("pointerdown", onDown);
      layoutEl?.removeEventListener("pointerup", onUp);
      layoutEl?.removeEventListener("click", onClick);
      sparkles?.dispose();
      wrapperRef.current?.removeAttribute("data-font-px");
    },
    // Text must stay crisp: no bloom over the cards.
    bloom: { strength: 0.15, radius: 0.1, threshold: 1.2 },
  };
}

export default function QuizBoard3D(props: QuizBoard3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const { supported } = useThreeScene(canvasRef, (ctx) => setupQuizBoard(ctx, propsRef, wrapperRef), [], {
    alpha: true,
    exposure: 1.0,
    shadows: false,
  });

  const { onSupportedChange } = props;
  useEffect(() => {
    onSupportedChange?.(supported);
  }, [supported, onSupportedChange]);

  return (
    <div
      ref={wrapperRef}
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
      aria-hidden="true"
      data-testid="wl-quiz3d"
      data-supported={supported === null ? "pending" : String(supported)}
    >
      <canvas ref={canvasRef} className={`block h-full w-full ${supported === false ? "hidden" : ""}`} />
    </div>
  );
}
