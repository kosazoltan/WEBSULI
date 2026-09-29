import { useRef } from "react";
import * as THREE from "three";

import {
  createGlowSprite,
  createGradientSky,
  createRoomEnvironment,
  glowTexture,
  LOOK_BUDGET,
  SparkleField,
  useThreeScene,
  type ThreeSceneSetup,
} from "@/game-engine/three-look";

/** A live creature as the DOM draws it: centre in CSS px from the board's top-left. */
export type ArenaRot = {
  id: number;
  x: number;
  y: number;
  size: number;
  warning: boolean;
  /** The DOM avatar's fade-out (1 = fully visible). */
  opacity?: number;
};

/** A correct catch: sparks burst from the creature's floor spot. */
export type ArenaBurst = { id: number; x: number; y: number };

type Props = { rots: ArenaRot[]; bursts: ArenaBurst[] };

/* --- Arena layout (world units) --- */
const PLATFORM_R = 24;
const RIM_R = 23.4;
const CAMERA_FOV = 50;
const MAX_RINGS = 12;
/** The DOM moves creatures in 100 ms linear CSS transitions; the rings follow the same curve. */
const DOM_TRANSITION_S = 0.1;

const NEON_PINK = new THREE.Color("#ff4fd8");
const NEON_CYAN = new THREE.Color("#3ff2ff");
const NEON_VIOLET = new THREE.Color("#9b5cff");
const WARN_RED = new THREE.Color("#ff2d4a");
const GOLD = new THREE.Color("#ffd35a");

/* ------------------------------------------------------------------ */
/* Shaders                                                              */
/* ------------------------------------------------------------------ */

const FLOOR_LIGHTS = 8;

function createFloorMaterial(): THREE.ShaderMaterial {
  const lights: THREE.Vector4[] = [];
  const colors: THREE.Color[] = [];
  for (let i = 0; i < FLOOR_LIGHTS; i++) {
    lights.push(new THREE.Vector4(0, 0, 1, 1));
    colors.push(new THREE.Color(0, 0, 0));
  }
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      baseInner: { value: new THREE.Color("#2a1156") },
      baseOuter: { value: new THREE.Color("#0b0624") },
      gridColor: { value: new THREE.Color("#7c5cff") },
      majorColor: { value: new THREE.Color("#3ff2ff") },
      rimColor: { value: NEON_PINK.clone() },
      rimRadius: { value: RIM_R },
      lights: { value: lights },
      lightColors: { value: colors },
      catchWave: { value: new THREE.Vector4(0, 0, -10, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 baseInner;
      uniform vec3 baseOuter;
      uniform vec3 gridColor;
      uniform vec3 majorColor;
      uniform vec3 rimColor;
      uniform float rimRadius;
      uniform vec4 lights[${FLOOR_LIGHTS}];
      uniform vec3 lightColors[${FLOOR_LIGHTS}];
      uniform vec4 catchWave;
      varying vec3 vWorld;

      float gridLine(vec2 p, float cell, float width) {
        vec2 q = p / cell;
        vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-4));
        return 1.0 - min(min(g.x, g.y) / width, 1.0);
      }

      void main() {
        vec2 p = vWorld.xz;
        float r = length(p);
        vec3 col = mix(baseInner, baseOuter, smoothstep(0.0, rimRadius, r));

        // Glossy sheen: grazing angles read as polished, like a lacquered stage.
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float grazing = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
        col += vec3(0.22, 0.10, 0.42) * grazing * 0.35;

        float inside = 1.0 - smoothstep(rimRadius - 0.6, rimRadius + 0.2, r);
        float distFade = 1.0 - smoothstep(6.0, rimRadius, r) * 0.45;
        float minor = gridLine(p, 1.5, 0.9);
        float major = gridLine(p, 6.0, 1.1);
        col += gridColor * minor * 0.10 * inside * distFade;
        col += majorColor * major * 0.30 * inside * distFade;

        // Concentric pulse rolling out from the centre.
        float wave = pow(0.5 + 0.5 * sin(r * 0.55 - time * 1.4), 18.0);
        col += majorColor * wave * 0.08 * inside;

        // Centre emblem rings.
        col += rimColor * exp(-abs(r - 5.0) * 7.0) * 0.22;
        col += majorColor * exp(-abs(r - 5.6) * 12.0) * 0.16;

        // The rim's light spilling onto the floor.
        col += rimColor * exp(-abs(r - rimRadius) * 1.6) * 0.3 * step(r, rimRadius + 0.4);

        // Soft stretched "reflections" of the beams and crystals.
        for (int i = 0; i < ${FLOOR_LIGHTS}; i++) {
          vec4 L = lights[i];
          vec2 d = p - L.xy;
          float e = exp(-(d.x * d.x) / (L.z * L.z) - (d.y * d.y) / (L.w * L.w));
          col += lightColors[i] * e;
        }

        // Shockwave from the last catch.
        if (catchWave.w > 0.0) {
          float cr = length(p - catchWave.xy);
          col += vec3(1.0, 0.82, 0.35) * exp(-abs(cr - catchWave.z) * 3.0) * catchWave.w;
        }

        // Outside the platform edge the floor darkens into space.
        float edge = smoothstep(rimRadius + 0.2, rimRadius + 0.6, r);
        col = mix(col, vec3(0.03, 0.02, 0.08), edge);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Rings under creatures: a bright outer band, rotating ticks and a soft inner glow. */
function createRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      color: { value: NEON_VIOLET.clone() },
      opacity: { value: 0 },
      spin: { value: 0 },
      pulse: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float opacity;
      uniform float spin;
      uniform float pulse;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = atan(vUv.y, vUv.x);
        float band = exp(-pow((r - 0.78) / 0.045, 2.0));
        float halo = exp(-pow((r - 0.78) / 0.16, 2.0)) * 0.45;
        float ticks = step(0.55, 0.5 + 0.5 * sin(a * 10.0 + spin)) * exp(-pow((r - 0.9) / 0.035, 2.0));
        float inner = (1.0 - smoothstep(0.0, 0.72, r)) * 0.28;
        float edgeFade = 1.0 - smoothstep(0.93, 1.0, r);
        float i = (band * 0.95 + halo * 0.8 + ticks * 0.7 + inner) * (1.0 + pulse * 0.9) * edgeFade;
        gl_FragColor = vec4(color * i, i * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Dark contact shadow that grounds each creature on the glossy floor. */
function createShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { opacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float r = length(vUv);
        float a = (1.0 - smoothstep(0.0, 1.0, r)) * 0.6 * opacity;
        gl_FragColor = vec4(0.0, 0.0, 0.02, a);
      }
    `,
  });
}

/** Volumetric-looking light cone: bright core, soft edges, fading towards the floor. */
function createBeamMaterial(color: THREE.Color, height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      color: { value: color.clone() },
      intensity: { value: 0.13 },
      halfHeight: { value: height / 2 },
    },
    vertexShader: /* glsl */ `
      uniform float halfHeight;
      varying float vH;
      varying float vFacing;
      void main() {
        vH = (position.y + halfHeight) / (2.0 * halfHeight);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float intensity;
      varying float vH;
      varying float vFacing;
      void main() {
        float core = pow(vFacing, 2.2);
        float a = core * intensity * mix(0.35, 1.0, vH) * smoothstep(0.0, 0.12, vH) * (1.0 - smoothstep(0.9, 1.0, vH));
        gl_FragColor = vec4(color * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Energy curtain rising from the rim: additive, so it never hides what is behind it. */
function createCurtainMaterial(height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      colorA: { value: NEON_PINK.clone() },
      colorB: { value: NEON_CYAN.clone() },
      halfHeight: { value: height / 2 },
    },
    vertexShader: /* glsl */ `
      uniform float halfHeight;
      varying float vH;
      varying float vAngle;
      void main() {
        vH = (position.y + halfHeight) / (2.0 * halfHeight);
        vAngle = atan(position.z, position.x);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 colorA;
      uniform vec3 colorB;
      varying float vH;
      varying float vAngle;
      void main() {
        vec3 col = mix(colorA, colorB, 0.5 + 0.5 * sin(vAngle * 2.0 + time * 0.3));
        float stripes = 0.55 + 0.45 * pow(0.5 + 0.5 * sin(vAngle * 48.0 - time * 1.5), 4.0);
        float fade = pow(1.0 - vH, 2.2);
        float a = fade * stripes * 0.26;
        gl_FragColor = vec4(col * a, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */

type RingSlot = {
  group: THREE.Group;
  ring: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  id: number | null;
  /** Screen-space tween of the DOM centre (CSS px). */
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  tweenStart: number;
  appear: number;
  fade: number;
  seen: boolean;
  spinOffset: number;
};

type Crystal = { mesh: THREE.Mesh; glow: THREE.Sprite; baseY: number; phase: number; spin: number };
type Beam = { mesh: THREE.Mesh; base: THREE.Vector3; phase: number };

/**
 * The Brain Rot arena drawn in 3D behind the clickable DOM creatures.
 *
 * The creatures stay DOM buttons (clicks, aria, tests); this layer only paints
 * the stage: a glossy neon platform floating among the stars, and under every
 * creature a glowing ring found by casting the creature's screen position onto
 * the floor plane, so the ring sits exactly beneath the avatar whatever the
 * board size or aspect ratio.
 */
export default function BrainRotArena3D({ rots, bursts }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotsRef = useRef(rots);
  const burstsRef = useRef(bursts);
  rotsRef.current = rots;
  burstsRef.current = bursts;

  const setup: ThreeSceneSetup = ({ renderer, scene, tier, reducedMotion }) => {
    const budget = LOOK_BUDGET[tier];
    const canvas = renderer.domElement;
    const disposers: Array<() => void> = [];

    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 400);
    camera.position.set(0, 13, 11);
    camera.lookAt(0, 0, -2.5);

    scene.fog = null;
    scene.background = new THREE.Color("#05030f");

    if (budget.environment) {
      const env = createRoomEnvironment(renderer);
      scene.environment = env.texture;
      scene.environmentIntensity = 0.6;
      disposers.push(() => {
        scene.environment = null;
        env.dispose();
      });
    }

    /* Sky + stars */
    const sky = createGradientSky({ top: "#1b0b44", horizon: "#3a0f63", bottom: "#070318", radius: 200 });
    scene.add(sky);

    const starCount = Math.round(900 * budget.particleScale) + 150;
    const starPos = new Float32Array(starCount * 3);
    const starCol = new Float32Array(starCount * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const rr = 120 + Math.random() * 40;
      starPos[i * 3] = s * Math.cos(phi) * rr;
      starPos[i * 3 + 1] = u * rr;
      starPos[i * 3 + 2] = s * Math.sin(phi) * rr;
      tmp.setHSL(0.55 + Math.random() * 0.35, 0.7, 0.75 + Math.random() * 0.25);
      starCol[i * 3] = tmp.r;
      starCol[i * 3 + 1] = tmp.g;
      starCol[i * 3 + 2] = tmp.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        size: 2.6,
        sizeAttenuation: false,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    );
    stars.renderOrder = -1;
    scene.add(stars);

    // Distant nebula glows fill the space around the platform with colour.
    const nebulae: THREE.Sprite[] = [
      [NEON_VIOLET, -60, -20, -110, 90],
      [NEON_PINK, 70, -30, -100, 80],
      [NEON_CYAN, 0, -60, -140, 110],
    ].map(([color, x, y, z, size]) => {
      const sp = createGlowSprite(color as THREE.Color, size as number, 0.28);
      sp.position.set(x as number, y as number, z as number);
      sp.renderOrder = -1;
      scene.add(sp);
      return sp;
    });

    /* Lights (crystals are the only lit materials) */
    scene.add(new THREE.AmbientLight("#6a4bd6", 0.6));
    const key = new THREE.DirectionalLight("#ffffff", 1.4);
    key.position.set(4, 10, 6);
    scene.add(key);
    const pinkFill = new THREE.PointLight(NEON_PINK, 40, 40, 1.6);
    pinkFill.position.set(-12, 6, -8);
    scene.add(pinkFill);
    const cyanFill = new THREE.PointLight(NEON_CYAN, 40, 40, 1.6);
    cyanFill.position.set(12, 6, -8);
    scene.add(cyanFill);

    /* Platform */
    const floorMat = createFloorMaterial();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(PLATFORM_R + 1.5, 160), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const sideMat = new THREE.MeshStandardMaterial({
      color: "#140a2e",
      emissive: new THREE.Color("#5a1d8f"),
      emissiveIntensity: 0.6,
      metalness: 0.6,
      roughness: 0.35,
    });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R + 1.5, PLATFORM_R - 1, 2.2, 128, 1, true), sideMat);
    side.position.y = -1.1;
    scene.add(side);

    const rimMat = new THREE.MeshBasicMaterial({ color: NEON_PINK.clone().multiplyScalar(1.5), fog: false });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R, 0.2, 12, 200), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.12;
    scene.add(rim);
    const innerRimMat = new THREE.MeshBasicMaterial({ color: NEON_CYAN.clone().multiplyScalar(1.2), fog: false });
    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(RIM_R - 0.9, 0.07, 8, 200), innerRimMat);
    innerRim.rotation.x = Math.PI / 2;
    innerRim.position.y = 0.06;
    scene.add(innerRim);

    const curtainH = 3.2;
    const curtainMat = createCurtainMaterial(curtainH);
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(RIM_R, RIM_R, curtainH, 160, 1, true), curtainMat);
    curtain.position.y = curtainH / 2;
    scene.add(curtain);

    // Rim pylons with glowing tips.
    const pylonGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 8);
    const pylonMat = new THREE.MeshStandardMaterial({ color: "#1d1240", metalness: 0.8, roughness: 0.3 });
    const pylonTips: THREE.Sprite[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(Math.cos(a) * (RIM_R + 0.4), 0.8, Math.sin(a) * (RIM_R + 0.4));
      scene.add(pylon);
      const tip = createGlowSprite(i % 2 ? NEON_CYAN : NEON_PINK, 1.6, 0.9);
      tip.position.set(pylon.position.x, 1.75, pylon.position.z);
      scene.add(tip);
      pylonTips.push(tip);
    }

    /* Floating crystals around the rim */
    const crystalPalette = [NEON_PINK, NEON_CYAN, NEON_VIOLET, GOLD, NEON_CYAN, NEON_PINK, NEON_VIOLET];
    const crystals: Crystal[] = [];
    const crystalGeo = new THREE.OctahedronGeometry(1, 0);
    crystalGeo.scale(0.7, 1.35, 0.7);
    const crystalAngles = [-2.55, -2.1, -1.57, -1.05, -0.6, -2.95, -0.2];
    crystalAngles.forEach((a, i) => {
      const color = crystalPalette[i % crystalPalette.length];
      const mat = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.55),
        emissive: color,
        emissiveIntensity: 0.9,
        metalness: 0.2,
        roughness: 0.08,
        flatShading: true,
      });
      const mesh = new THREE.Mesh(crystalGeo, mat);
      const radius = RIM_R + 1.4 + (i % 3) * 0.9;
      const baseY = 2.4 + (i % 3) * 0.7;
      mesh.position.set(Math.cos(a) * radius, baseY, Math.sin(a) * radius);
      mesh.scale.setScalar(0.9 + (i % 2) * 0.5);
      scene.add(mesh);
      const glow = createGlowSprite(color, 5.5, 0.55);
      glow.position.copy(mesh.position);
      scene.add(glow);
      crystals.push({ mesh, glow, baseY, phase: i * 1.7, spin: 0.4 + (i % 3) * 0.25 });
    });

    /* Light shafts */
    const beamH = 22;
    const beams: Beam[] = [];
    const beamSpots: Array<[number, number, THREE.Color]> = [
      [-9, -9, NEON_PINK],
      [9, -12, NEON_CYAN],
      [0, -3, NEON_VIOLET],
      [13, 1, NEON_PINK],
      [-14, 0, NEON_CYAN],
    ];
    const beamCount = tier === "low" ? 3 : beamSpots.length;
    for (let i = 0; i < beamCount; i++) {
      const [bx, bz, color] = beamSpots[i];
      const geo = new THREE.CylinderGeometry(0.5, 3.4, beamH, 32, 1, true);
      const mesh = new THREE.Mesh(geo, createBeamMaterial(color, beamH));
      const base = new THREE.Vector3(bx, 0, bz);
      mesh.position.set(bx, beamH / 2, bz);
      scene.add(mesh);
      beams.push({ mesh, base, phase: i * 1.3 });
    }

    // Floor "reflections": beam hit spots + crystal reflections.
    const lights = floorMat.uniforms.lights.value as THREE.Vector4[];
    const lightColors = floorMat.uniforms.lightColors.value as THREE.Color[];
    let li = 0;
    for (let i = 0; i < beamCount && li < FLOOR_LIGHTS; i++, li++) {
      const [bx, bz, color] = beamSpots[i];
      lights[li].set(bx, bz, 3.2, 3.2);
      lightColors[li].copy(color).multiplyScalar(0.15);
    }
    for (let i = 0; i < crystals.length && li < FLOOR_LIGHTS; i++, li++) {
      const c = crystals[i];
      const dir = new THREE.Vector2(c.mesh.position.x, c.mesh.position.z).normalize();
      // A reflection seen from the front sits inside the rim, stretched towards the viewer.
      lights[li].set(dir.x * (RIM_R - 3), dir.y * (RIM_R - 3), 1.6, 4.2);
      lightColors[li].copy(crystalPalette[i % crystalPalette.length]).multiplyScalar(0.16);
    }

    /* Dust motes drifting in the light */
    const moteCount = Math.round(160 * budget.particleScale);
    const motePos = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) {
      motePos[i * 3] = (Math.random() - 0.5) * 36;
      motePos[i * 3 + 1] = Math.random() * 9;
      motePos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 4;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3).setUsage(THREE.DynamicDrawUsage));
    const motes = new THREE.Points(
      moteGeo,
      new THREE.PointsMaterial({
        size: 0.16,
        map: glowTexture(),
        color: new THREE.Color("#c9b8ff"),
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scene.add(motes);

    /* Creature rings */
    const ringGeo = new THREE.PlaneGeometry(2, 2);
    ringGeo.rotateX(-Math.PI / 2);
    const slots: RingSlot[] = [];
    for (let i = 0; i < MAX_RINGS; i++) {
      const group = new THREE.Group();
      const shadow = new THREE.Mesh(ringGeo, createShadowMaterial());
      shadow.position.y = 0.02;
      shadow.renderOrder = 1;
      const ring = new THREE.Mesh(ringGeo, createRingMaterial());
      ring.position.y = 0.04;
      ring.renderOrder = 2;
      group.add(shadow, ring);
      group.visible = false;
      scene.add(group);
      slots.push({
        group,
        ring,
        shadow,
        id: null,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        tweenStart: 0,
        appear: 0,
        fade: 0,
        seen: false,
        spinOffset: Math.random() * 6,
      });
    }

    /* Catch bursts */
    const sparks = new SparkleField(scene, Math.round(600 * budget.particleScale) + 120);
    const emitted = new Set<number>();
    const wave = floorMat.uniforms.catchWave.value as THREE.Vector4;
    let waveAge = -1;

    /* Screen → floor projection */
    const raycaster = new THREE.Raycaster();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const ndc = new THREE.Vector2();
    const hitA = new THREE.Vector3();
    const hitB = new THREE.Vector3();
    const project = (x: number, y: number, out: THREE.Vector3): boolean => {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      ndc.set((x / w) * 2 - 1, -((y / h) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(floorPlane, out) !== null;
    };

    let pixelHeight = 1;

    const update = (dt: number, elapsed: number) => {
      const motion = reducedMotion ? 0 : 1;
      camera.updateMatrixWorld();
      floorMat.uniforms.time.value = elapsed * motion;
      curtainMat.uniforms.time.value = elapsed * motion;

      // Crystals bob and spin; glows breathe.
      for (const c of crystals) {
        c.mesh.position.y = c.baseY + Math.sin(elapsed * 0.9 + c.phase) * 0.35 * motion;
        c.mesh.rotation.y = c.phase + elapsed * c.spin * motion;
        c.glow.position.y = c.mesh.position.y;
        c.glow.material.opacity = 0.45 + 0.15 * Math.sin(elapsed * 1.7 + c.phase) * motion;
      }
      pylonTips.forEach((tip, i) => {
        tip.material.opacity = 0.65 + 0.3 * Math.sin(elapsed * 2.2 + i * 0.8) * motion;
      });
      for (const b of beams) {
        b.mesh.rotation.z = Math.sin(elapsed * 0.35 + b.phase) * 0.06 * motion;
        b.mesh.rotation.x = Math.cos(elapsed * 0.28 + b.phase) * 0.05 * motion;
      }
      if (motion) {
        const arr = moteGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < moteCount; i++) {
          arr[i * 3 + 1] += dt * (0.25 + (i % 5) * 0.08);
          arr[i * 3] += Math.sin(elapsed * 0.5 + i) * dt * 0.1;
          if (arr[i * 3 + 1] > 9) arr[i * 3 + 1] = 0;
        }
        moteGeo.attributes.position.needsUpdate = true;
        stars.rotation.y = elapsed * 0.004;
      }

      /* Rings follow the DOM creatures */
      const live = rotsRef.current;
      for (const s of slots) s.seen = false;
      for (const rot of live) {
        let slot = slots.find((s) => s.id === rot.id);
        if (!slot) {
          slot = slots.find((s) => s.id === null) ?? slots.find((s) => s.fade <= 0 && !live.some((r) => r.id === s.id));
          if (!slot) continue;
          slot.id = rot.id;
          slot.fromX = slot.toX = rot.x;
          slot.fromY = slot.toY = rot.y;
          slot.tweenStart = elapsed;
          slot.appear = 0;
        }
        slot.seen = true;
        if (rot.x !== slot.toX || rot.y !== slot.toY) {
          const t = Math.min(1, (elapsed - slot.tweenStart) / DOM_TRANSITION_S);
          slot.fromX += (slot.toX - slot.fromX) * t;
          slot.fromY += (slot.toY - slot.fromY) * t;
          slot.toX = rot.x;
          slot.toY = rot.y;
          slot.tweenStart = elapsed;
        }
        const t = reducedMotion ? 1 : Math.min(1, (elapsed - slot.tweenStart) / DOM_TRANSITION_S);
        const sx = slot.fromX + (slot.toX - slot.fromX) * t;
        // The ring sits at the avatar's lower half, like light pooling under its feet.
        const sy = slot.fromY + (slot.toY - slot.fromY) * t + rot.size * 0.22;
        if (!project(sx, sy, hitA) || !project(sx + rot.size * 0.5, sy, hitB)) {
          slot.group.visible = false;
          continue;
        }
        const radius = hitA.distanceTo(hitB) / 0.78;
        slot.appear = reducedMotion ? 1 : Math.min(1, slot.appear + dt * 5);
        slot.fade = rot.opacity ?? 1;
        const grow = 1 - Math.pow(1 - slot.appear, 3);
        slot.group.visible = true;
        slot.group.position.set(hitA.x, 0, hitA.z);
        slot.group.scale.setScalar(radius * (0.6 + 0.4 * grow));
        const u = slot.ring.material.uniforms;
        const pulse = rot.warning ? (reducedMotion ? 0.6 : 0.5 + 0.5 * Math.sin(elapsed * 11)) : 0;
        (u.color.value as THREE.Color).copy(rot.warning ? WARN_RED : NEON_VIOLET);
        if (!rot.warning) (u.color.value as THREE.Color).lerp(NEON_CYAN, 0.35 + 0.15 * Math.sin(elapsed * 1.3 + slot.spinOffset) * motion);
        u.pulse.value = pulse;
        u.spin.value = slot.spinOffset + elapsed * (rot.warning ? 5 : 1.6) * motion;
        u.opacity.value = slot.fade * slot.fade * grow;
        slot.shadow.material.uniforms.opacity.value = slot.fade * slot.fade * grow;
        slot.shadow.scale.setScalar(rot.warning ? 1 + pulse * 0.08 : 1);
      }
      for (const s of slots) {
        if (s.seen || s.id === null) continue;
        // Creature gone (caught or escaped): the ring shrinks away.
        s.fade -= dt * 4;
        if (s.fade <= 0 || reducedMotion) {
          s.fade = 0;
          s.id = null;
          s.group.visible = false;
        } else {
          s.ring.material.uniforms.opacity.value = s.fade;
          s.shadow.material.uniforms.opacity.value = s.fade;
          s.group.scale.multiplyScalar(1 + dt * 2);
        }
      }

      /* Bursts for correct catches */
      for (const b of burstsRef.current) {
        if (emitted.has(b.id)) continue;
        emitted.add(b.id);
        if (!project(b.x, b.y + 14, hitA)) continue;
        const origin = hitA.clone().setY(0.6);
        const scale = budget.particleScale;
        const up = new THREE.Vector3(0, 1, 0);
        sparks.emit(origin, { count: Math.round(70 * scale) + 12, color: GOLD, speed: 7, life: 1.1, gravity: 7, size: 0.32, direction: up, directionality: 0.45, spread: 0.6 });
        sparks.emit(origin, { count: Math.round(40 * scale) + 8, color: NEON_PINK, speed: 5, life: 0.9, gravity: 4, size: 0.26, spread: 0.8 });
        sparks.emit(origin, { count: Math.round(30 * scale) + 6, color: NEON_CYAN, speed: 9, life: 0.7, gravity: 2, size: 0.2, direction: up, directionality: 0.2 });
        wave.set(hitA.x, hitA.z, 0, 1);
        waveAge = 0;
      }
      if (waveAge >= 0) {
        waveAge += dt;
        wave.z = waveAge * 9;
        wave.w = Math.max(0, 1 - waveAge / 0.9);
        if (wave.w <= 0) waveAge = -1;
      }
      sparks.update(dt);
    };

    return {
      camera,
      update,
      resize: (w, h) => {
        // A portrait phone board sees a narrow slice of the arena; a wider
        // vertical FOV brings the rim, pylons and crystals back into view.
        const aspect = w / Math.max(1, h);
        camera.fov = aspect >= 1 ? CAMERA_FOV : Math.min(60, CAMERA_FOV + (1 - aspect) * 20);
        camera.updateProjectionMatrix();
        pixelHeight = h * renderer.getPixelRatio();
        sparks.setViewportHeight(pixelHeight, camera.fov);
      },
      dispose: () => {
        sparks.dispose();
        disposers.forEach((d) => d());
        nebulae.length = 0;
        // The detached canvas's GL context is released by useThreeScene.
      },
      bloom: { strength: 0.7, radius: 0.5, threshold: 0.78 },
    };
  };

  const { supported } = useThreeScene(canvasRef, setup, [], { exposure: 1.0, shadows: false });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-arena-3d
      className={`absolute inset-0 z-0 h-full w-full pointer-events-none${supported === false ? " hidden" : ""}`}
    />
  );
}
