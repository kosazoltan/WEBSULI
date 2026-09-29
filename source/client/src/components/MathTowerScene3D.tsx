import { useRef } from "react";
import * as THREE from "three";

import MathTowerScene from "@/components/MathTowerScene";
import {
  LOOK_BUDGET,
  SparkleField,
  createGlowSprite,
  createGradientSky,
  glowTexture,
  useThreeScene,
  type ThreeSceneSetup,
} from "@/game-engine/three-look";

type TowerProps = { current: number; target: number };

const STEPS = 8;
const RADIUS = 1.8;
const RISE = 0.64;
/** Half-width of the arc as a fraction of the radius (sin of the edge angle). */
const ARC_SPAN = 0.94;
const PLATFORM_R = 0.44;
const JUMP_TIME = 0.45;
const LAND_TIME = 0.22;
const FOV = 38;

/** Same rule as the SVG scene: 8 steps, the avatar stands on `round(progress * 7)`. */
function towerStep(current: number, target: number): number {
  const progress = Math.max(0, Math.min(1, current / Math.max(1, target)));
  return Math.round(progress * (STEPS - 1));
}

/**
 * The platforms wind around the front of the crystal core. They are spaced
 * evenly in screen x (not in angle), so no two steps hide behind each other
 * at the edges of the arc.
 */
function platformPosition(i: number, out = new THREE.Vector3()): THREE.Vector3 {
  const x = (i / (STEPS - 1) - 0.5) * 2 * ARC_SPAN;
  const a = Math.asin(x);
  return out.set(Math.sin(a) * RADIUS, i * RISE, Math.cos(a) * RADIUS);
}

/** Neon hue per step: cyan at the bottom, violet, pink, gold goal on top. */
function stepColor(i: number): THREE.Color {
  if (i === STEPS - 1) return new THREE.Color("#ffd166");
  const t = i / (STEPS - 2);
  return new THREE.Color().setHSL(0.5 + t * 0.42, 0.95, 0.6);
}

type Platform = {
  group: THREE.Group;
  top: THREE.MeshStandardMaterial;
  rim: THREE.MeshBasicMaterial;
  crystal: THREE.MeshStandardMaterial;
  glow: THREE.Sprite;
  color: THREE.Color;
  lit: number;
  phase: number;
};

function buildCharacter(): { root: THREE.Group; body: THREE.Group; antennaBall: THREE.MeshBasicMaterial } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skin = new THREE.MeshStandardMaterial({ color: "#ffb347", roughness: 0.42, emissive: "#ff8c2a", emissiveIntensity: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: "#e0782a", roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 });
  const pupil = new THREE.MeshStandardMaterial({ color: "#1b1f3b", roughness: 0.2 });
  const cheek = new THREE.MeshBasicMaterial({ color: "#ff7eb6", transparent: true, opacity: 0.8 });

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.21, 32, 24), skin);
  torso.scale.set(1, 1.08, 0.95);
  torso.position.y = 0.25;
  body.add(torso);

  const eyeGeo = new THREE.SphereGeometry(0.058, 20, 16);
  const pupilGeo = new THREE.SphereGeometry(0.032, 16, 12);
  const sparkGeo = new THREE.SphereGeometry(0.011, 8, 6);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, white);
    eye.position.set(side * 0.075, 0.29, 0.165);
    eye.scale.set(1, 1.15, 0.7);
    body.add(eye);
    const p = new THREE.Mesh(pupilGeo, pupil);
    p.position.set(side * 0.072, 0.285, 0.205);
    body.add(p);
    const s = new THREE.Mesh(sparkGeo, white);
    s.position.set(side * 0.072 + 0.012, 0.3, 0.232);
    body.add(s);
    const c = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), cheek);
    c.position.set(side * 0.13, 0.225, 0.178);
    c.rotation.y = side * 0.55;
    body.add(c);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), dark);
    foot.scale.set(1, 0.6, 1.25);
    foot.position.set(side * 0.09, 0.035, 0.03);
    body.add(foot);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), skin);
    arm.scale.set(0.8, 1.2, 0.8);
    arm.position.set(side * 0.215, 0.22, 0.02);
    arm.rotation.z = side * 0.5;
    body.add(arm);
  }
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.035, 0.009, 8, 16, Math.PI),
    pupil,
  );
  smile.position.set(0, 0.215, 0.2);
  smile.rotation.z = Math.PI;
  body.add(smile);

  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.14, 8), dark);
  stalk.position.y = 0.52;
  body.add(stalk);
  const antennaBall = new THREE.MeshBasicMaterial({ color: new THREE.Color("#7df9ff").multiplyScalar(2.2), toneMapped: false });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 12), antennaBall);
  ball.position.y = 0.61;
  body.add(ball);
  const halo = createGlowSprite("#7df9ff", 0.22, 0.4);
  halo.position.y = 0.61;
  body.add(halo);

  return { root, body, antennaBall };
}

function buildStars(count: number, radius: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = Math.cos(phi) * r * radius;
    pos[i * 3 + 1] = u * radius;
    pos[i * 3 + 2] = Math.sin(phi) * r * radius;
    c.setHSL(0.55 + Math.random() * 0.2, 0.6, 0.75 + Math.random() * 0.25);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.6,
    sizeAttenuation: false,
    map: glowTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.renderOrder = -1;
  return points;
}

const setupTower =
  (propsRef: { current: TowerProps }): ThreeSceneSetup =>
  ({ scene, tier, reducedMotion, renderer }) => {
    const budget = LOOK_BUDGET[tier];
    const high = tier === "high";

    // --- Sky: deep night gradient, a moon, stars and soft nebula clouds ---------
    scene.add(
      createGradientSky({
        top: "#060a24",
        horizon: "#2a1658",
        bottom: "#0b0a24",
        radius: 90,
      }),
    );
    const starsA = buildStars(Math.round(420 * Math.max(0.5, budget.particleScale)), 80);
    const starsB = buildStars(Math.round(160 * Math.max(0.5, budget.particleScale)), 78);
    (starsB.material as THREE.PointsMaterial).size = 3.6;
    scene.add(starsA, starsB);
    const nebula: THREE.Sprite[] = [];
    const nebulaSpec: [string, number, number, number, number, number][] = [
      ["#b03cff", -26, 16, -60, 38, 0.07],
      ["#1fb8ff", 26, 22, -62, 34, 0.06],
      ["#ff3d9a", 8, 2, -64, 40, 0.05],
      ["#5a4bff", -6, 34, -58, 30, 0.06],
    ];
    for (const [color, x, y, z, size, opacity] of nebulaSpec) {
      const s = createGlowSprite(color, size, opacity);
      s.position.set(x, y, z);
      s.renderOrder = -1;
      nebula.push(s);
      scene.add(s);
    }
    // A big friendly moon behind the tower, upper left.
    const moon = new THREE.Group();
    moon.position.set(-5.6, 3.9, -18);
    const moonBody = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 40, 28),
      new THREE.MeshStandardMaterial({ color: "#fdf6dc", emissive: "#f3ecd0", emissiveIntensity: 0.5, roughness: 0.9 }),
    );
    moon.add(moonBody);
    const craterMat = new THREE.MeshStandardMaterial({ color: "#d9d2b8", emissive: "#cfc6a8", emissiveIntensity: 0.6, roughness: 1 });
    for (const [cx, cy, cr] of [[-0.45, 0.35, 0.28], [0.4, -0.2, 0.22], [0.1, 0.6, 0.14], [-0.2, -0.55, 0.18]] as const) {
      const crater = new THREE.Mesh(new THREE.CircleGeometry(cr, 20), craterMat);
      const z = Math.sqrt(Math.max(0, 1.5 * 1.5 - cx * cx - cy * cy));
      crater.position.set(cx, cy, z + 0.005);
      crater.lookAt(crater.position.clone().multiplyScalar(2));
      moon.add(crater);
    }
    const moonHalo = createGlowSprite("#dfe6ff", 8, 0.16);
    moon.add(moonHalo);
    scene.add(moon);

    // A soft, glowing mist far below the floating tower.
    const mist = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#5a2cff",
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = -1.1;
    scene.add(mist);

    // Small dim floating islands in the distance give the sky depth.
    const islandGeo = new THREE.ConeGeometry(0.5, 0.9, 6);
    const islandTopGeo = new THREE.CylinderGeometry(0.52, 0.5, 0.1, 6);
    const islands: { g: THREE.Group; y: number; phase: number }[] = [];
    const islandSpec: [number, number, number, number, string][] = [
      [-4.2, 0.2, -5, 0.8, "#38e0ff"],
      [4.4, 1.6, -6, 0.65, "#ff5fb4"],
      [3.6, -0.6, -3.5, 0.55, "#a78bfa"],
      [-3.4, 3.6, -7, 0.6, "#7c9cff"],
      [5.2, 4.4, -9, 0.7, "#ffd166"],
      [-5.6, -1.2, -8, 0.75, "#c084fc"],
    ];
    for (const [x, y, z, sc, tint] of islandSpec) {
      const g = new THREE.Group();
      const rock = new THREE.Mesh(
        islandGeo,
        new THREE.MeshStandardMaterial({ color: "#221a4a", emissive: tint, emissiveIntensity: 0.12, roughness: 0.6, flatShading: true }),
      );
      rock.rotation.x = Math.PI;
      rock.position.y = -0.5;
      g.add(rock);
      g.add(new THREE.Mesh(islandTopGeo, new THREE.MeshStandardMaterial({ color: "#2e2766", emissive: tint, emissiveIntensity: 0.22, roughness: 0.5, flatShading: true })));
      const halo = createGlowSprite(tint, 1.6, 0.12);
      halo.position.y = 0.05;
      g.add(halo);
      g.position.set(x, y, z);
      g.scale.setScalar(sc);
      g.rotation.y = x;
      scene.add(g);
      islands.push({ g, y, phase: x * 1.7 });
    }

    // --- Lights -----------------------------------------------------------------
    scene.add(new THREE.HemisphereLight("#9fb4ff", "#3a1a5e", 0.9));
    const moonLight = new THREE.DirectionalLight("#d7e2ff", 1.2);
    moonLight.position.set(-4, 7, 5);
    scene.add(moonLight);
    const charLight = new THREE.PointLight("#ffd9a8", 0.25, 1.8, 1.8);
    scene.add(charLight);

    const tower = new THREE.Group();
    scene.add(tower);

    // The tower's core: a column of floating crystal shards, one per level;
    // each lights up in its step's colour once the hero has reached it.
    const shardGeo = new THREE.OctahedronGeometry(0.15, 0);
    const shards: { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }[] = [];
    for (let i = 0; i < STEPS; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: "#3a2f86",
        emissive: stepColor(i),
        emissiveIntensity: 0.1,
        roughness: 0.2,
        metalness: 0.2,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(shardGeo, mat);
      mesh.scale.set(1, 2.3, 1);
      mesh.position.y = i * RISE + 0.15;
      tower.add(mesh);
      shards.push({ mesh, mat });
    }

    // --- Platforms ----------------------------------------------------------------
    const topGeo = new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R * 0.9, 0.16, 36);
    const rimGeo = new THREE.TorusGeometry(PLATFORM_R, 0.035, 10, 56);
    const crystalGeo = new THREE.ConeGeometry(PLATFORM_R * 0.72, 0.5, 6);
    const dimRim = new THREE.Color("#5a5f9e");
    const platforms: Platform[] = [];
    for (let i = 0; i < STEPS; i++) {
      const color = stepColor(i);
      const group = new THREE.Group();
      platformPosition(i, group.position);
      const top = new THREE.MeshStandardMaterial({ color: "#2b2f63", roughness: 0.35, metalness: 0.1, emissive: color, emissiveIntensity: 0 });
      const topMesh = new THREE.Mesh(topGeo, top);
      group.add(topMesh);
      const rim = new THREE.MeshBasicMaterial({ color: dimRim.clone(), toneMapped: false });
      const rimMesh = new THREE.Mesh(rimGeo, rim);
      rimMesh.rotation.x = Math.PI / 2;
      rimMesh.position.y = 0.08;
      group.add(rimMesh);
      const crystal = new THREE.MeshStandardMaterial({
        color: "#241c52",
        emissive: color,
        emissiveIntensity: 0.12,
        roughness: 0.25,
        flatShading: true,
      });
      const crystalMesh = new THREE.Mesh(crystalGeo, crystal);
      crystalMesh.rotation.x = Math.PI;
      crystalMesh.position.y = -0.33;
      group.add(crystalMesh);
      const glow = createGlowSprite(color, 1.9, 0);
      glow.position.y = 0.05;
      group.add(glow);
      tower.add(group);
      platforms.push({ group, top, rim, crystal, glow, color, lit: 0, phase: i * 0.9 });
    }

    // Glowing stepping-stones between consecutive platforms (lit once passed).
    const beadGeo = new THREE.SphereGeometry(0.045, 12, 8);
    const beads: { mat: THREE.MeshBasicMaterial; gap: number; color: THREE.Color }[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let g = 0; g < STEPS - 1; g++) {
      platformPosition(g, a);
      platformPosition(g + 1, b);
      for (const t of [0.34, 0.5, 0.66]) {
        const mat = new THREE.MeshBasicMaterial({ color: dimRim.clone(), toneMapped: false });
        const bead = new THREE.Mesh(beadGeo, mat);
        bead.position.lerpVectors(a, b, t);
        bead.position.y += 0.1 + Math.sin(Math.PI * t) * 0.18;
        tower.add(bead);
        beads.push({ mat, gap: g, color: stepColor(g).lerp(stepColor(g + 1), t) });
      }
    }

    // Pulse ring on the current platform.
    const pulseMat = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const pulseRing = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R, 0.03, 8, 56), pulseMat);
    pulseRing.rotation.x = Math.PI / 2;
    tower.add(pulseRing);

    // --- Goal flag on the top platform --------------------------------------------
    const topPos = platformPosition(STEPS - 1);
    const outward = new THREE.Vector3(topPos.x, 0, topPos.z).normalize();
    const flag = new THREE.Group();
    flag.position.copy(topPos).addScaledVector(outward, PLATFORM_R * 0.62);
    flag.position.y += 0.08;
    const gold = new THREE.MeshStandardMaterial({ color: "#ffe29a", metalness: 0.7, roughness: 0.25, emissive: "#b8860b", emissiveIntensity: 0.4 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.95, 10), gold);
    pole.position.y = 0.475;
    flag.add(pole);
    const clothGeo = new THREE.PlaneGeometry(0.5, 0.32, 14, 6);
    clothGeo.translate(0.25, 0, 0);
    const clothBase = Float32Array.from(clothGeo.attributes.position.array as Float32Array);
    const cloth = new THREE.Mesh(
      clothGeo,
      new THREE.MeshStandardMaterial({ color: "#ffc53d", emissive: "#ff8a00", emissiveIntensity: 0.45, roughness: 0.55, side: THREE.DoubleSide }),
    );
    cloth.position.set(0.018, 0.78, 0);
    flag.add(cloth);
    const starTip = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.06),
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3b0").multiplyScalar(2), toneMapped: false }),
    );
    starTip.position.y = 0.99;
    flag.add(starTip);
    const starGlow = createGlowSprite("#ffd76a", 0.7, 0.8);
    starGlow.position.y = 0.99;
    flag.add(starGlow);
    // Face the flag so it waves across the view rather than edge-on.
    flag.rotation.y = -0.35;
    tower.add(flag);

    // --- Character ------------------------------------------------------------------
    const hero = buildCharacter();
    hero.root.scale.setScalar(1.35);
    tower.add(hero.root);

    const sparkles = new SparkleField(tower, Math.round(420 * Math.max(0.4, budget.particleScale)));

    // --- Camera -----------------------------------------------------------------------
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
    const minY = -0.8;
    const maxY = (STEPS - 1) * RISE + 1.15;
    const centerY = (minY + maxY) / 2;
    let fitDistance = 8;
    const lookAt = new THREE.Vector3(0, centerY, 0);
    const TRACK = 0.22;

    const fit = (aspect: number) => {
      const tanV = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
      const halfH = (maxY - minY) / 2 + 0.1 + TRACK * ((STEPS - 1) * RISE) * 0.5;
      const halfW = RADIUS + PLATFORM_R + 0.15;
      fitDistance = Math.max(halfH / tanV, halfW / (tanV * aspect)) + RADIUS * 0.2;
    };
    fit(1);

    // --- Animation state -----------------------------------------------------------------
    let shownStep = -1;
    let jump: { from: THREE.Vector3; to: THREE.Vector3; t: number; step: number } | null = null;
    let landT = LAND_TIME;
    let flagSparkT = 0;
    const heroPos = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const standPoint = (i: number, out: THREE.Vector3) => platformPosition(i, out).setY(i * RISE + 0.08);

    const land = (step: number) => {
      landT = 0;
      if (reducedMotion) return;
      const p = standPoint(step, tmp);
      const c = platforms[step].color;
      sparkles.emit(p, { count: Math.round(46 * Math.max(0.5, budget.particleScale)), color: c, speed: 2.4, life: 0.9, gravity: 2.2, size: 0.09, spread: 0.3 });
      sparkles.emit(p, { count: Math.round(18 * Math.max(0.5, budget.particleScale)), color: "#fff2b3", speed: 1.6, life: 1.1, gravity: -0.4, size: 0.07, spread: 0.6 });
    };

    const pixelHeight = () => renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    sparkles.setViewportHeight(pixelHeight(), FOV);

    return {
      camera,
      bloom: { strength: 0.7, radius: 0.5, threshold: 0.88 },
      resize(w, h) {
        fit(w / Math.max(1, h));
        sparkles.setViewportHeight(pixelHeight(), FOV);
      },
      update(dt, elapsed) {
        const { current, target } = propsRef.current;
        const step = towerStep(current, target);
        const motion = !reducedMotion;

        // Step changes: jump forward along an arc; anything else is instant.
        if (shownStep < 0 || !motion || step < shownStep) {
          if (step !== shownStep) {
            shownStep = step;
            jump = null;
            standPoint(step, heroPos);
          }
        } else if (step !== shownStep && (!jump || jump.step !== step)) {
          const from = jump ? heroPos.clone() : standPoint(shownStep, new THREE.Vector3());
          jump = { from, to: standPoint(step, new THREE.Vector3()), t: 0, step };
          shownStep = step;
        }

        let sy = 1;
        if (jump) {
          jump.t = Math.min(1, jump.t + dt / JUMP_TIME);
          const t = jump.t;
          const e = t * t * (3 - 2 * t);
          heroPos.lerpVectors(jump.from, jump.to, e);
          heroPos.y += Math.sin(Math.PI * t) * (0.55 + Math.max(0, jump.to.y - jump.from.y) * 0.5);
          sy = t < 0.12 ? 1 - 0.28 * Math.sin((t / 0.12) * Math.PI) : 1 + 0.22 * Math.sin(Math.PI * t);
          if (t >= 1) {
            const landed = jump.step;
            jump = null;
            land(landed);
          }
        } else if (landT < LAND_TIME && motion) {
          landT += dt;
          const k = Math.min(1, landT / LAND_TIME);
          sy = 1 - 0.3 * Math.sin(Math.PI * k) * (1 - k * 0.3);
        } else if (motion) {
          sy = 1 + 0.035 * Math.sin(elapsed * 2.6);
        }
        hero.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

        // Platforms float gently; lit ones glow, the current one pulses.
        for (let i = 0; i < STEPS; i++) {
          const p = platforms[i];
          const want = i <= shownStep && !(jump && i === jump.step) ? 1 : 0;
          p.lit = motion ? p.lit + (want - p.lit) * Math.min(1, dt * 6) : want;
          const bob = motion ? Math.sin(elapsed * 1.1 + p.phase) * 0.035 : 0;
          platformPosition(i, p.group.position).y += bob;
          const isCurrent = i === shownStep;
          const pulse = isCurrent && motion ? 0.5 + 0.5 * Math.sin(elapsed * 4.2) : isCurrent ? 0.6 : 0;
          const glowLevel = p.lit * (1 + pulse * 0.6);
          p.rim.color.copy(dimRim).lerp(p.color, p.lit).multiplyScalar(0.7 + glowLevel * (high ? 0.55 : 0.45));
          p.top.emissiveIntensity = 0.05 + p.lit * (0.32 + pulse * 0.25);
          p.top.color.set(p.lit > 0.5 ? "#3b3f7e" : "#2b2f63");
          p.crystal.emissiveIntensity = 0.08 + p.lit * 0.3;
          p.glow.material.opacity = p.lit * (high ? 0.16 : 0.34) * (1 + pulse * 0.5);
          const shard = shards[i];
          shard.mat.emissiveIntensity = 0.1 + p.lit * 0.9;
          shard.mesh.rotation.y = motion ? elapsed * 0.7 + i : i;
          shard.mesh.position.y = i * RISE + 0.15 + (motion ? Math.sin(elapsed * 1.4 + i) * 0.04 : 0);
        }
        const cur = platforms[shownStep];
        pulseRing.position.copy(cur.group.position);
        pulseRing.position.y += 0.08;
        const ringT = motion ? (elapsed * 0.9) % 1 : 0.35;
        pulseRing.scale.setScalar(1 + ringT * 0.6);
        pulseMat.color.copy(cur.color).multiplyScalar(1.3);
        pulseMat.opacity = (1 - ringT) * 0.7;

        for (const bead of beads) {
          const on = bead.gap < shownStep ? 1 : 0;
          bead.mat.color.copy(dimRim).lerp(bead.color, on).multiplyScalar(on ? 1.25 : 0.55);
        }

        // Hero: follow the platform's float when standing, face the camera.
        const heroBob = !jump ? platforms[shownStep].group.position.y - shownStep * RISE : 0;
        hero.root.position.copy(heroPos);
        hero.root.position.y += heroBob;
        hero.root.rotation.y = Math.atan2(camera.position.x - heroPos.x, camera.position.z - heroPos.z);
        if (jump) hero.root.rotation.y += Math.sin(Math.PI * jump.t) * 0.5;
        hero.antennaBall.color.set("#7df9ff").multiplyScalar(motion ? 1.3 + 0.5 * Math.sin(elapsed * 5) : 1.5);
        charLight.position.set(heroPos.x, heroPos.y + 0.35, heroPos.z + 0.7);

        // Flag waves; gold sparkles drift up around the goal.
        const pos = clothGeo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const x = clothBase[v * 3];
          const y = clothBase[v * 3 + 1];
          const w = motion ? Math.sin(x * 9 - elapsed * 6) * 0.05 * (x / 0.5) : Math.sin(x * 9) * 0.03 * (x / 0.5);
          pos.setXYZ(v, x, y + (motion ? Math.sin(x * 6 - elapsed * 4) * 0.012 * x : 0), w);
        }
        pos.needsUpdate = true;
        clothGeo.computeVertexNormals();
        starTip.rotation.y = motion ? elapsed * 1.5 : 0.4;
        (starGlow.material as THREE.SpriteMaterial).opacity = motion ? 0.65 + 0.25 * Math.sin(elapsed * 3) : 0.8;
        if (motion) {
          flagSparkT -= dt;
          if (flagSparkT <= 0) {
            flagSparkT = 0.28;
            tmp.set(0, 0.95, 0).applyMatrix4(flag.matrixWorld);
            sparkles.emit(tmp, { count: 2, color: "#ffe08a", speed: 0.35, life: 1.4, gravity: -0.25, size: 0.06, spread: 0.45 });
          }
        }
        sparkles.update(dt);

        // Sky life: twinkle and a slow nebula drift.
        if (motion) {
          (starsA.material as THREE.PointsMaterial).opacity = 0.8 + 0.2 * Math.sin(elapsed * 1.7);
          (starsB.material as THREE.PointsMaterial).opacity = 0.65 + 0.35 * Math.sin(elapsed * 2.3 + 1.3);
          for (let n = 0; n < nebula.length; n++) nebula[n].material.rotation = elapsed * 0.02 * (n % 2 ? 1 : -1);
          for (const isl of islands) {
            isl.g.position.y = isl.y + Math.sin(elapsed * 0.6 + isl.phase) * 0.12;
            isl.g.rotation.y += dt * 0.08;
          }
        }

        // Camera: frame the whole tower, lean slowly towards the hero.
        const targetY = centerY + (heroPos.y - (STEPS - 1) * RISE * 0.5) * TRACK;
        lookAt.y = motion ? lookAt.y + (targetY - lookAt.y) * Math.min(1, dt * 1.8) : targetY;
        const sway = motion ? Math.sin(elapsed * 0.25) * 0.12 : 0;
        const az = sway;
        const el = 0.3;
        camera.position.set(
          Math.sin(az) * Math.cos(el) * fitDistance,
          lookAt.y + Math.sin(el) * fitDistance,
          Math.cos(az) * Math.cos(el) * fitDistance,
        );
        camera.lookAt(lookAt);
      },
      dispose() {
        sparkles.dispose();
      },
    };
  };

/**
 * 3D "neon math tower": the avatar hops up a spiral of floating platforms as
 * correct answers come in. Purely decorative — the accessible description stays
 * on the wrapper, and without WebGL the original SVG scene is shown.
 */
export default function MathTowerScene3D({ current, target }: TowerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef<TowerProps>({ current, target });
  propsRef.current = { current, target };
  const { supported } = useThreeScene(canvasRef, setupTower(propsRef), [], { alpha: false, shadows: false, exposure: 1.1 });

  if (supported === false) return <MathTowerScene current={current} target={target} />;

  return (
    <div className="math-world game-scene relative" aria-label={`Torony: ${current} a ${target} lépésből`} role="img">
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 z-0 block h-full w-full" />
    </div>
  );
}
