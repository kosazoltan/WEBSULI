/**
 * Tornado Hunter 200 — procedural Three.js meshes.
 *
 * The brief asks for a deliberately simple, non-photorealistic look that runs on
 * weak machines and phones. Everything here is therefore box/cylinder/cone
 * primitives with flat shading and NO image textures and NO imported models: the
 * whole game's visual budget is a few hundred triangles per object. The "toy"
 * look comes from colour instead: height/slope-tinted vertex colours, glossy
 * vehicle paint, a gradient sky with sun glow. Real shadow maps are opt-in by the
 * page on the HIGH profile only; every profile gets a cheap blob shadow.
 *
 * Geometries and materials are cached per key and REUSED across every instance —
 * a forest of 400 trees shares three geometries, which is the difference between
 * a smooth phone frame rate and a slideshow.
 */

import * as THREE from "three";

import type { Vehicle } from "@/lib/tornado/vehicles";
import type { GraphicsQuality } from "@/lib/tornado/progress";
import {
  terrainHeight,
  surfaceAt,
  bridgeSpansInChunk,
  bridgeRailSegments,
  bridgedAlongX,
  deckSurfaceHeight,
  nearestLine,
  spanPoint,
  CHUNK_SIZE,
  HALF_WORLD,
  ROAD_SPACING,
  ROAD_HALF_WIDTH,
  type BridgeSpan,
  type WorldProp,
} from "@/lib/tornado/world";
import { glowTexture } from "@/game-engine/three-look/sprites";
import { markSharedGeometry } from "./meshLifetime";

export type QualityProfile = {
  /** Funnel particle count. */
  funnelParticles: number;
  /** Radius (world units) of the chunk neighbourhood kept in the scene. */
  viewRadius: number;
  /** Fog distance. */
  fogFar: number;
  /** Rain particle count. */
  rainParticles: number;
  /** Debris particle count. */
  debrisParticles: number;
  maxPixelRatio: number;
  /** Terrain tessellation per chunk side. */
  terrainSegments: number;
};

export const QUALITY_PROFILES: Record<GraphicsQuality, QualityProfile> = {
  low: { funnelParticles: 140, viewRadius: 260, fogFar: 420, rainParticles: 240, debrisParticles: 40, maxPixelRatio: 1, terrainSegments: 5 },
  medium: { funnelParticles: 280, viewRadius: 380, fogFar: 620, rainParticles: 620, debrisParticles: 90, maxPixelRatio: 1.5, terrainSegments: 8 },
  high: { funnelParticles: 520, viewRadius: 520, fogFar: 900, rainParticles: 1200, debrisParticles: 170, maxPixelRatio: 2, terrainSegments: 12 },
};

/* ============================ shared caches ============================ */

/**
 * The shared soft radial dot (canvas texture) — null without a DOM, so the mesh
 * builders stay usable from the node unit tests.
 */
function softDot(): THREE.Texture | null {
  return typeof document === "undefined" ? null : glowTexture();
}

const geometryCache = new Map<string, THREE.BufferGeometry>();
const materialCache = new Map<string, THREE.Material>();

function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  const hit = geometryCache.get(key);
  if (hit) return hit as T;
  const made = markSharedGeometry(make());
  geometryCache.set(key, made);
  return made;
}

function mat(key: string, color: string, opts: Partial<THREE.MeshLambertMaterialParameters> = {}): THREE.Material {
  const hit = materialCache.get(key);
  if (hit) return hit;
  const made = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
  materialCache.set(key, made);
  return made;
}

/** Release every cached resource — called when the page unmounts. */
export function disposeMeshCaches(): void {
  geometryCache.forEach((g) => g.dispose());
  materialCache.forEach((m) => m.dispose());
  geometryCache.clear();
  materialCache.clear();
}

/* ============================ vehicle ============================ */

/**
 * Build a storm chaser.
 *
 * Five silhouettes cover the five categories; the per-vehicle colours and
 * proportions come from the catalogue, so 160 vehicles look distinct without
 * 160 models.
 */
export function buildVehicle(vehicle: Vehicle): THREE.Group {
  const group = new THREE.Group();
  // Phong instead of Lambert: one specular highlight is what makes a box read
  // as a shiny toy car rather than a cardboard one — and it costs the same.
  const bodyMat = new THREE.MeshPhongMaterial({ color: vehicle.colors.body, flatShading: true, shininess: 70, specular: "#5a5f66" });
  const accentMat = new THREE.MeshPhongMaterial({ color: vehicle.colors.accent, flatShading: true, shininess: 50, specular: "#3c4046" });
  const glassMat = new THREE.MeshPhongMaterial({
    color: vehicle.colors.glass,
    flatShading: true,
    transparent: true,
    opacity: 0.78,
    shininess: 110,
    specular: "#d8ecff",
  });

  const heavy = vehicle.silhouette === "tank" || vehicle.silhouette === "beast";
  const width = heavy ? 3.1 : vehicle.silhouette === "van" ? 2.7 : 2.4;
  const length = heavy ? 6.4 : vehicle.silhouette === "van" ? 6.0 : 5.2;
  const height = vehicle.silhouette === "van" ? 1.9 : heavy ? 1.7 : 1.3;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), bodyMat);
  chassis.position.y = height / 2 + 0.55;
  group.add(chassis);

  // Cabin / cockpit
  const cabLength = vehicle.silhouette === "van" ? length * 0.55 : length * 0.42;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, height * 0.8, cabLength), glassMat);
  cab.position.set(0, height + 0.62, vehicle.silhouette === "van" ? 0.2 : -0.35);
  group.add(cab);

  if (vehicle.silhouette === "wedge" || vehicle.silhouette === "beast") {
    // Armoured wedge nose: a rotated box reads as a slope with 12 triangles.
    const nose = new THREE.Mesh(new THREE.BoxGeometry(width, 0.9, 2.1), accentMat);
    nose.position.set(0, 0.95, length / 2 - 0.4);
    nose.rotation.x = -0.42;
    group.add(nose);
  }
  if (heavy) {
    // Side skirts that keep the wind from getting under the vehicle.
    for (const side of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.7, length * 0.86), accentMat);
      skirt.position.set((side * width) / 2, 0.5, 0);
      group.add(skirt);
    }
  }
  if (vehicle.silhouette === "van" || vehicle.category === "research") {
    // Instrument mast
    const mast = new THREE.Mesh(geo("mast", () => new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6)), accentMat);
    mast.position.set(width * 0.3, height + 1.9, -length * 0.3);
    group.add(mast);
    const dish = new THREE.Mesh(geo("dish", () => new THREE.ConeGeometry(0.42, 0.36, 8, 1, true)), accentMat);
    dish.position.set(width * 0.3, height + 3.05, -length * 0.3);
    dish.rotation.x = Math.PI;
    group.add(dish);
  }

  // Roof light bar — every chaser has one, it reads as "official vehicle".
  const bar = new THREE.Mesh(new THREE.BoxGeometry(width * 0.7, 0.16, 0.3), accentMat);
  bar.position.set(0, height + 1.08, -length * 0.12);
  group.add(bar);

  // Small, shared details give the vehicle a readable silhouette without
  // textures or shadow maps on phones. These have no collision geometry.
  const detailBox = geo("vehicle-detail-box", () => new THREE.BoxGeometry(1, 1, 1));
  const addDetail = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
    const detail = new THREE.Mesh(detailBox, material);
    detail.position.set(x, y, z);
    detail.scale.set(w, h, d);
    group.add(detail);
  };
  const trim = mat("vehicle-trim", "#d8e6ed");
  const darkTrim = mat("vehicle-dark-trim", "#203149");
  const headlamp = mat("vehicle-headlamp", "#fff4ba", { emissive: "#ffd66b", emissiveIntensity: 0.65 });
  const tailLamp = mat("vehicle-tail-lamp", "#ff5b54", { emissive: "#ff342e", emissiveIntensity: 0.45 });
  for (const side of [-1, 1]) {
    addDetail(side * width * .32, 1.15, length / 2 + .04, .48, .28, .12, headlamp);
    addDetail(side * width * .35, 1.15, -length / 2 - .04, .28, .38, .12, tailLamp);
    addDetail(side * (width / 2 + .025), 1.05, 0, .06, .12, length * .7, trim);
    addDetail(side * width * .25, height + 1.22, -length * .12, .35, .16, .31, headlamp);
  }
  addDetail(0, .72, length / 2 + .08, width * .9, .22, .25, darkTrim);
  addDetail(0, .72, -length / 2 - .08, width * .9, .22, .25, darkTrim);
  addDetail(0, 1.1, length / 2 + .07, width * .4, .3, .12, darkTrim);
  addDetail(0, 1.12, -length / 2 - .08, .5, .22, .08, trim);

  // Wheels
  const wheelGeo = geo("wheel", () => {
    const g = new THREE.CylinderGeometry(0.62, 0.62, 0.42, 10);
    g.rotateZ(Math.PI / 2);
    return g;
  });
  const wheelMat = mat("wheel", "#1b1b1f");
  const wheels: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set((sx * width) / 2 + sx * 0.08, 0.62, (sz * length) / 2 - sz * 1.1);
      group.add(w);
      wheels.push(w);
      const hub = new THREE.Mesh(geo("vehicle-hub", () => {
        const g = new THREE.CylinderGeometry(.3, .3, .05, 8);
        g.rotateZ(Math.PI / 2);
        return g;
      }), trim);
      hub.position.copy(w.position);
      hub.position.x += sx * .23;
      group.add(hub);
    }
  }
  group.userData.wheels = wheels;

  // Anchor spikes, visible when deployed.
  const anchors: THREE.Mesh[] = [];
  const spikeGeo = geo("spike", () => new THREE.ConeGeometry(0.2, 1.1, 6));
  const spikeMat = mat("spike", "#d97706");
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const s = new THREE.Mesh(spikeGeo, spikeMat);
      s.position.set((sx * width) / 2, 0.35, (sz * length) / 2 - sz * 0.6);
      s.rotation.x = Math.PI;
      s.visible = false;
      group.add(s);
      anchors.push(s);
    }
  }
  group.userData.anchors = anchors;

  // Blob shadow: a soft dark ellipse under the chassis. It grounds the vehicle
  // on every profile for the price of one quad (the real shadow map is HIGH only).
  const blob = new THREE.Mesh(
    geo("vehicle-blob", () => {
      const g = new THREE.PlaneGeometry(1, 1);
      g.rotateX(-Math.PI / 2);
      return g;
    }),
    blobShadowMaterial(),
  );
  blob.scale.set(width * 1.75, 1, length * 1.3);
  blob.position.y = 0.12;
  blob.renderOrder = 1;
  blob.userData.blobShadow = true;
  group.add(blob);
  group.userData.blob = blob;
  group.userData.size = { width, length };
  group.userData.disposables = [chassis.geometry, cab.geometry, bodyMat, accentMat, glassMat];

  return group;
}

function blobShadowMaterial(): THREE.Material {
  const hit = materialCache.get("vehicle-blob");
  if (hit) return hit;
  const made = new THREE.MeshBasicMaterial({
    color: "#000000",
    map: softDot(),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  materialCache.set("vehicle-blob", made);
  return made;
}

export function setAnchorsVisible(vehicleGroup: THREE.Group, visible: boolean): void {
  const anchors = vehicleGroup.userData.anchors as THREE.Mesh[] | undefined;
  anchors?.forEach((a) => {
    a.visible = visible;
  });
}

/* ============================ tornado ============================ */

export type TornadoMesh = {
  group: THREE.Group;
  /** Nested funnel shells; each spins at its own rate (`userData.spin`). */
  rings: THREE.Mesh[];
  debris: THREE.Points;
  debrisVelocities: Float32Array;
  /** Dust skirt rolling around the base (soft sprites). */
  skirt: THREE.Group;
};

/** Funnel height: it reaches into the storm-cloud base (~137) so the two merge. */
const FUNNEL_HEIGHT = 146;
/** World height where the funnel meets the storm cloud (cloud discs start at 150 − 13). */
const FUNNEL_TOP_WORLD = 152;

/** Uniforms shared by every shell of one funnel, so the sway stays in sync. */
type FunnelShared = { time: { value: number }; sway: { value: number } };

/**
 * Funnel radius at height fraction t (0 = ground, 1 = cloud base): a narrow,
 * slightly flared foot, a rope-like waist, then the classic trumpet flare.
 */
function funnelRadius(t: number): number {
  return 3.6 + 3.8 * Math.exp(-t * 12) + Math.pow(t, 1.9) * 32;
}

const FUNNEL_VERTEX = /* glsl */ `
  uniform float time;
  uniform float sway;
  uniform float height;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec3 p = position;
    float t = clamp(p.y / height, 0.0, 1.0);
    // The rope bends: the foot stays planted, the upper body drifts and snakes.
    float bend = t * t;
    p.x += (sin(time * 0.55 + t * 2.3) * 7.0 + sin(time * 1.3 + t * 5.0) * 1.6) * bend * sway;
    p.z += (cos(time * 0.43 + t * 1.9) * 6.0) * bend * sway;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewPos = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FUNNEL_FRAGMENT = /* glsl */ `
  uniform float time;
  uniform float spin;
  uniform float opacity;
  uniform float bands;
  uniform vec3 dustColor;
  uniform vec3 bodyColor;
  uniform vec3 topColor;
  uniform vec3 edgeColor;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  #include <fog_pars_fragment>
  void main() {
    float t = vUv.y;
    // Swirl bands scroll around the funnel and climb with a twist.
    float s = vUv.x * bands - t * 3.2 + time * spin;
    float stripe = 0.5 + 0.5 * sin(s * 6.2831853);
    float wisp = 0.5 + 0.5 * sin((vUv.x * bands * 2.0 + t * 9.0 - time * spin * 1.7) * 6.2831853 + stripe * 2.0);
    float density = 0.45 + 0.4 * stripe + 0.25 * wisp;
    // Smoke reads denser at the silhouette (longer path through it).
    float facing = abs(dot(normalize(vNormalV), normalize(vViewPos)));
    float edge = 1.0 - facing;
    float alpha = opacity * density * (0.55 + 0.7 * pow(edge, 1.3));
    // Soft foot and a soft top that melts into the storm cloud.
    alpha *= smoothstep(0.0, 0.035, t) * (1.0 - smoothstep(0.78, 1.0, t));
    vec3 col = mix(dustColor, bodyColor, smoothstep(0.0, 0.3, t));
    col = mix(col, topColor, smoothstep(0.45, 1.0, t));
    // Darker core, lighter dusty edges and bright-ish stripes.
    col *= 0.6 + 0.4 * stripe;
    col = mix(col, edgeColor, edge * 0.55);
    gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

function funnelShell(
  quality: GraphicsQuality,
  shared: FunnelShared,
  scale: number,
  opts: { opacity: number; spin: number; bands: number; core: number },
): THREE.Mesh {
  const heightSegments = quality === "low" ? 14 : quality === "medium" ? 22 : 32;
  const radial = quality === "low" ? 14 : quality === "medium" ? 20 : 28;
  const points: THREE.Vector2[] = [];
  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments;
    points.push(new THREE.Vector2(funnelRadius(t) * scale, t * FUNNEL_HEIGHT));
  }
  const geometry = new THREE.LatheGeometry(points, radial);
  const dust = new THREE.Color("#a88b66");
  const body = new THREE.Color("#5f6878");
  const top = new THREE.Color("#8994a6");
  // Inner shells are the dark core, outer ones the light dusty veil.
  dust.multiplyScalar(opts.core);
  body.multiplyScalar(opts.core);
  top.multiplyScalar(opts.core);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        spin: { value: opts.spin },
        opacity: { value: opts.opacity },
        bands: { value: opts.bands },
        height: { value: FUNNEL_HEIGHT },
        dustColor: { value: dust },
        bodyColor: { value: body },
        topColor: { value: top },
        edgeColor: { value: new THREE.Color("#e6d8bd") },
      },
    ]),
    vertexShader: FUNNEL_VERTEX,
    fragmentShader: FUNNEL_FRAGMENT,
  });
  // `merge` clones uniforms; re-link the shared clock so every shell sways together.
  material.uniforms.time = shared.time;
  material.uniforms.sway = shared.sway;
  const shell = new THREE.Mesh(geometry, material);
  shell.userData.spin = opts.spin;
  shell.frustumCulled = false;
  return shell;
}

/**
 * The funnel: nested, tapered lathe shells with a scrolling swirl shader —
 * dark core, light dusty veil — that bend like a rope and melt into the storm
 * cloud, plus an orbiting debris cloud and a dust skirt at the foot.
 *
 * Cost: 2 shells on LOW (≈450 triangles each), 4 on HIGH; one draw call each.
 */
export function buildTornado(quality: GraphicsQuality): TornadoMesh {
  const profile = QUALITY_PROFILES[quality];
  const group = new THREE.Group();
  const rings: THREE.Mesh[] = [];
  const shared: FunnelShared = { time: { value: 0 }, sway: { value: 1 } };
  group.userData.funnel = shared;

  const shells =
    quality === "low"
      ? [
          { scale: 0.62, opacity: 0.85, spin: 0.9, bands: 3, core: 0.62 },
          { scale: 1.0, opacity: 0.55, spin: 0.55, bands: 4, core: 1.05 },
        ]
      : quality === "medium"
        ? [
            { scale: 0.5, opacity: 0.9, spin: 1.1, bands: 3, core: 0.55 },
            { scale: 0.78, opacity: 0.6, spin: 0.75, bands: 4, core: 0.85 },
            { scale: 1.05, opacity: 0.45, spin: 0.5, bands: 5, core: 1.12 },
          ]
        : [
            { scale: 0.42, opacity: 0.95, spin: 1.25, bands: 3, core: 0.5 },
            { scale: 0.66, opacity: 0.7, spin: 0.9, bands: 4, core: 0.72 },
            { scale: 0.88, opacity: 0.5, spin: 0.62, bands: 5, core: 0.95 },
            { scale: 1.12, opacity: 0.36, spin: 0.42, bands: 6, core: 1.15 },
          ];
  shells.forEach((cfg, i) => {
    const shell = funnelShell(quality, shared, cfg.scale, cfg);
    // Inner shells first, so the veil is blended over the core.
    shell.renderOrder = i;
    group.add(shell);
    rings.push(shell);
  });

  // Debris orbiting the core.
  const count = profile.funnelParticles;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Every third particle belongs to the churning ring at the foot: low, wide, slow to climb.
    const foot = i % 3 === 0;
    const h = foot ? Math.random() * 8 : Math.random() * 90;
    const r = foot ? 16 + Math.random() * 12 : 3 + (h / 90) * 16 + Math.random() * 4;
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = h;
    positions[i * 3 + 2] = Math.sin(angle) * r;
    velocities[i * 3] = angle;
    velocities[i * 3 + 1] = foot ? 1 + Math.random() * 3 : 6 + Math.random() * 22;
    velocities[i * 3 + 2] = r;
  }
  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const debris = new THREE.Points(
    debrisGeo,
    new THREE.PointsMaterial({
      color: "#6e5840",
      size: 2.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      // Round, soft debris instead of square pixels.
      map: softDot(),
      depthWrite: false,
    }),
  );
  group.add(debris);

  // Dust skirt: a few big soft sprites around the base. A handful of quads, yet
  // it is what makes the funnel look like it is touching the ground.
  const skirt = new THREE.Group();
  const puffs = quality === "low" ? 4 : quality === "medium" ? 6 : 9;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softDot(),
        color: i % 2 === 0 ? "#b39a78" : "#9d8a70",
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      }),
    );
    const r = 9 + (i % 3) * 3;
    sprite.position.set(Math.cos(a) * r, 5 + (i % 2) * 3, Math.sin(a) * r);
    sprite.scale.setScalar(26 + (i % 3) * 8);
    skirt.add(sprite);
  }
  group.add(skirt);

  return { group, rings, debris, debrisVelocities: velocities, skirt };
}

/**
 * Spin the funnel one frame. `motion` < 1 slows the decorative swirl and sway
 * (reduced motion); the tornado itself still moves with the game.
 */
export function animateTornado(mesh: TornadoMesh, dt: number, intensity: number, motion = 1): void {
  const speed = 0.6 + intensity * 0.16;
  // Whatever the level's size multiplier, the funnel's top ends at the storm
  // cloud base (world y ≈ 150): small tornadoes get a slim rope, big ones a wedge.
  const fit = FUNNEL_TOP_WORLD / (FUNNEL_HEIGHT * Math.max(0.1, mesh.group.scale.y));
  for (const ring of mesh.rings) {
    ring.rotation.y += (ring.userData.spin as number) * dt * speed * motion;
    // A karcsú kis tölcsért kissé kiszélesítjük, a nagyot keskenyítjük.
    const widen = Math.sqrt(fit);
    ring.scale.set(widen, fit, widen);
  }
  const shared = mesh.group.userData.funnel as FunnelShared | undefined;
  if (shared) {
    shared.time.value += dt * speed * motion;
    shared.sway.value = motion < 1 ? 0.3 : 1;
  }
  const attr = mesh.debris.geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const vel = mesh.debrisVelocities;
  for (let i = 0; i < arr.length / 3; i++) {
    vel[i * 3] = (vel[i * 3]! + dt * (1.4 + intensity * 0.2) * motion) % (Math.PI * 2);
    let y = arr[i * 3 + 1]! + vel[i * 3 + 1]! * dt;
    if (y > 92) y = 0;
    const r = vel[i * 3 + 2]! * (0.5 + (y / 92) * 0.9);
    arr[i * 3] = Math.cos(vel[i * 3]!) * r;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = Math.sin(vel[i * 3]!) * r;
  }
  attr.needsUpdate = true;
  mesh.skirt.rotation.y += dt * speed * 0.9;
}

/* ============================ terrain & props ============================ */

const SURFACE_COLORS = {
  grassValley: new THREE.Color("#3f8a3a"),
  grassHill: new THREE.Color("#9ccc55"),
  grassDry: new THREE.Color("#cfc566"),
  slope: new THREE.Color("#8d8a4e"),
  dirt: new THREE.Color("#b88a56"),
  mud: new THREE.Color("#6f5337"),
  asphalt: new THREE.Color("#7d8088"),
  waterDeep: new THREE.Color("#2677c9"),
  waterShallow: new THREE.Color("#4fc0e8"),
  sand: new THREE.Color("#e6d193"),
  roadLine: new THREE.Color("#f4e7b0"),
};

/** Cheap deterministic 0..1 pattern for grass variation (no allocation, no RNG). */
function patch(x: number, z: number, scale: number): number {
  const v = Math.sin(x * 0.071 * scale + Math.sin(z * 0.043 * scale) * 2.1) * Math.cos(z * 0.067 * scale - x * 0.021 * scale);
  return v * 0.5 + 0.5;
}

/** GLSL float literal. */
function glf(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

/**
 * The shared terrain material.
 *
 * Roads and the river are thin, sharp features (a road is 18 units wide, a
 * vertex is 8–20 units apart), so per-vertex colour smeared them into long
 * triangular wedges. They are therefore coloured PER PIXEL here, from the world
 * position, with exactly the thresholds of `roadFactor` / `isWater` (world.ts) —
 * the colour under the wheels is the surface the HUD reports. The soft field
 * tints (height, slope, dry patches, mud) stay in the vertex colours.
 */
function terrainMaterial(): THREE.Material {
  const hit = materialCache.get("terrain");
  if (hit) return hit;
  const made = new THREE.MeshLambertMaterial({ color: "#ffffff", vertexColors: true, flatShading: true });
  const uniforms = {
    asphaltColor: { value: SURFACE_COLORS.asphalt },
    dirtColor: { value: SURFACE_COLORS.dirt },
    waterDeep: { value: SURFACE_COLORS.waterDeep },
    waterShallow: { value: SURFACE_COLORS.waterShallow },
    sandColor: { value: SURFACE_COLORS.sand },
    lineColor: { value: SURFACE_COLORS.roadLine },
  };
  made.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTerrainWorld;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vTerrainWorld;
uniform vec3 asphaltColor;
uniform vec3 dirtColor;
uniform vec3 waterDeep;
uniform vec3 waterShallow;
uniform vec3 sandColor;
uniform vec3 lineColor;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  vec2 w = vTerrainWorld.xz;
  // roadFactor(): 1 on a road centreline, fading to 0 at the 9-unit half-width
  // (nearLine = distance to the nearest grid line, the GLSL twin of distToGridLine).
  float halfSpacing = ${glf(ROAD_SPACING / 2)};
  float dx = abs(mod(w.x + ${glf(HALF_WORLD)}, ${glf(ROAD_SPACING)}) - halfSpacing);
  float dz = abs(mod(w.y + ${glf(HALF_WORLD)}, ${glf(ROAD_SPACING)}) - halfSpacing);
  float nearLine = min(halfSpacing - dx, halfSpacing - dz);
  float road = 1.0 - clamp(nearLine / 9.0, 0.0, 1.0);
  float aa = max(fwidth(road), 0.002);
  float asphalt = smoothstep(0.55 - aa, 0.55 + aa, road);
  float dirt = smoothstep(0.15 - aa, 0.15 + aa, road) * (1.0 - asphalt);
  // isWater(): |x - riverCenterX(z)| < 22.
  float riverX = sin(w.y / 340.0) * 260.0 + sin(w.y / 90.0) * 40.0;
  float riverDist = abs(w.x - riverX);
  float waa = max(fwidth(riverDist), 0.05);
  float water = 1.0 - smoothstep(22.0 - waa, 22.0 + waa, riverDist);
  float sand = (1.0 - smoothstep(25.0, 31.0, riverDist)) * (1.0 - water);

  vec3 surface = diffuseColor.rgb;
  surface = mix(surface, sandColor, sand * (1.0 - asphalt));
  surface = mix(surface, dirtColor, dirt);
  surface = mix(surface, asphaltColor, asphalt);
  vec3 river = mix(waterDeep, waterShallow, smoothstep(4.0, 22.0, riverDist));
  river += vec3(0.06, 0.08, 0.1) * smoothstep(0.82, 1.0, sin(riverDist * 0.9 + w.y * 0.07));
  surface = mix(surface, river, water);
  diffuseColor.rgb = surface;
}`,
      );
  };
  made.customProgramCacheKey = () => "tornado-terrain-v3";
  materialCache.set("terrain", made);
  return made;
}

/**
 * One terrain chunk: a subdivided plane displaced by `terrainHeight`.
 *
 * Vertex colours carry the soft field look — lush valleys, sunny hilltops,
 * drier slopes, dirt and mud patches (`surfaceAt`, the same kinds the HUD
 * names) — and the material paints roads and the river on top per pixel.
 */
export function buildTerrainChunk(cx: number, cz: number, quality: GraphicsQuality): THREE.Mesh {
  const seg = QUALITY_PROFILES[quality].terrainSegments;
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, seg, seg);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const baseX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const baseZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(baseX + pos.getX(i), baseZ + pos.getZ(i)));
  }
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal") as THREE.BufferAttribute;

  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const wx = baseX + pos.getX(i);
    const wz = baseZ + pos.getZ(i);
    const flat = Math.max(0, Math.min(1, normal.getY(i)));
    const hn = Math.max(0, Math.min(1, (pos.getY(i) + 13) / 26));

    const surface = surfaceAt(wx, wz);
    if (surface === "mud") color.copy(SURFACE_COLORS.mud);
    else if (surface === "dirt") color.copy(SURFACE_COLORS.dirt).lerp(SURFACE_COLORS.grassDry, 0.25);
    else {
      // Grass (roads and water are painted over it by the material).
      color.copy(SURFACE_COLORS.grassValley).lerp(SURFACE_COLORS.grassHill, Math.pow(hn, 0.9));
      const dry = patch(wx, wz, 1);
      if (dry > 0.62) color.lerp(SURFACE_COLORS.grassDry, (dry - 0.62) * 1.6);
      else if (dry < 0.25) color.multiplyScalar(0.86 + dry * 0.5);
      // Steep ground shows earth.
      color.lerp(SURFACE_COLORS.slope, Math.min(0.7, Math.max(0, (0.97 - flat) * 6)));
    }
    // Slight per-vertex variation so large fields do not look like flat paint.
    const jitter = 0.94 + ((Math.sin(wx * 0.13) + Math.cos(wz * 0.11)) * 0.5 + 0.5) * 0.12;
    colors[i * 3] = color.r * jitter;
    colors[i * 3 + 1] = color.g * jitter;
    colors[i * 3 + 2] = color.b * jitter;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(geometry, terrainMaterial());
  mesh.position.set(baseX, 0, baseZ);
  // Only the HIGH profile renders a shadow map; elsewhere this flag is inert.
  mesh.receiveShadow = quality === "high";
  return mesh;
}

/* ============================ bridges ============================ */

const DECK_STEP = 2;
const FASCIA_DEPTH = 1.1;
const RAIL_HEIGHT = 0.95;
const RAIL_INSET = 0.2;
const PILLAR_EVERY = 12;
const PILLAR_HALF = 0.6;

/**
 * The bridge decks of one chunk (spec 2026-09-29-tornado-fizika D5): an asphalt deck at the road's own
 * height, concrete fascia beams, railings and pillars down to the river bed — so the road visibly runs
 * OVER the water. Geometry is unique per chunk (disposed with the chunk); materials are shared.
 * Returns null when the chunk has no bridge.
 */
export function buildBridgeChunk(cx: number, cz: number): THREE.Group | null {
  const spans = bridgeSpansInChunk(cx, cz);
  if (spans.length === 0) return null;

  const deck: number[] = [];
  const concrete: number[] = [];
  const quad = (out: number[], a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like) => {
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  const at = (span: BridgeSpan, s: number, across: number, dy = 0) => {
    const p = spanPoint(span, s, across);
    return { x: p.x, y: deckSurfaceHeight(p.x, p.z) + dy, z: p.z };
  };
  const steps = (from: number, to: number) => {
    const out: number[] = [];
    for (let s = from; s < to; s += DECK_STEP) out.push(s);
    out.push(to);
    return out;
  };

  for (const span of spans) {
    // Deck. Where a bridged road along x crosses this road, that deck owns the junction (no z-fight).
    const ss = steps(span.from, span.to);
    for (let i = 0; i < ss.length - 1; i++) {
      const s0 = ss[i]!;
      const s1 = ss[i + 1]!;
      if (span.axis === "z") {
        const mid = (s0 + s1) / 2;
        const lineZ = nearestLine(mid);
        if (Math.abs(mid - lineZ) < ROAD_HALF_WIDTH && bridgedAlongX(span.line, lineZ)) continue;
      }
      for (const [a0, a1] of [[-ROAD_HALF_WIDTH, 0], [0, ROAD_HALF_WIDTH]] as const) {
        quad(deck, at(span, s0, a0), at(span, s1, a0), at(span, s1, a1), at(span, s0, a1));
      }
    }

    // Fascia beams and railings, with gaps where a crossing road passes.
    for (const seg of bridgeRailSegments(span)) {
      const rs = steps(seg.from, seg.to);
      for (let i = 0; i < rs.length - 1; i++) {
        const s0 = rs[i]!;
        const s1 = rs[i + 1]!;
        for (const side of [-1, 1]) {
          const edge = side * ROAD_HALF_WIDTH;
          quad(concrete, at(span, s0, edge), at(span, s1, edge), at(span, s1, edge, -FASCIA_DEPTH), at(span, s0, edge, -FASCIA_DEPTH));
          const rail = side * (ROAD_HALF_WIDTH - RAIL_INSET);
          quad(concrete, at(span, s0, rail, RAIL_HEIGHT), at(span, s1, rail, RAIL_HEIGHT), at(span, s1, rail), at(span, s0, rail));
        }
      }
    }

    // Pillars down to the bed, where the bed is deep enough to see them.
    for (let s = Math.ceil(span.from / PILLAR_EVERY) * PILLAR_EVERY; s <= span.to; s += PILLAR_EVERY) {
      for (const across of [-ROAD_HALF_WIDTH * 0.6, ROAD_HALF_WIDTH * 0.6]) {
        const p = spanPoint(span, s, across);
        const top = deckSurfaceHeight(p.x, p.z) - FASCIA_DEPTH;
        const bottom = terrainHeight(p.x, p.z) - 0.4;
        if (top - bottom < 1.2) continue;
        const h = PILLAR_HALF;
        const corners = [
          [-h, -h],
          [h, -h],
          [h, h],
          [-h, h],
        ] as const;
        for (let k = 0; k < 4; k++) {
          const [ax, az] = corners[k]!;
          const [bx, bz] = corners[(k + 1) % 4]!;
          quad(
            concrete,
            { x: p.x + ax, y: top, z: p.z + az },
            { x: p.x + bx, y: top, z: p.z + bz },
            { x: p.x + bx, y: bottom, z: p.z + bz },
            { x: p.x + ax, y: bottom, z: p.z + az },
          );
        }
      }
    }
  }

  const group = new THREE.Group();
  group.name = `bridge-${cx}:${cz}`;
  const make = (positions: number[], material: THREE.Material) => {
    if (positions.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, material));
  };
  make(deck, mat("bridge-deck", "#6f737b", { side: THREE.DoubleSide }));
  make(concrete, mat("bridge-concrete", "#d6d1c4", { side: THREE.DoubleSide }));
  return group;
}

/** One prop. Geometry and material are shared per kind. */
export function buildProp(prop: WorldProp): THREE.Object3D {
  const y = terrainHeight(prop.x, prop.z);
  let object: THREE.Object3D;

  switch (prop.kind) {
    case "house": {
      const group = new THREE.Group();
      const walls = new THREE.Mesh(geo("house-w", () => new THREE.BoxGeometry(7, 4.4, 8)), mat("house-w", "#f2e2c2"));
      walls.position.y = 2.2;
      group.add(walls);
      const roof = new THREE.Mesh(geo("house-r", () => new THREE.ConeGeometry(6.2, 3.2, 4)), mat("house-r", "#d9523f"));
      roof.position.y = 6.0;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      object = group;
      break;
    }
    case "barn": {
      const group = new THREE.Group();
      const body = new THREE.Mesh(geo("barn-b", () => new THREE.BoxGeometry(11, 6, 16)), mat("barn-b", "#c9443a"));
      body.position.y = 3;
      group.add(body);
      const roof = new THREE.Mesh(geo("barn-r", () => new THREE.CylinderGeometry(6.3, 6.3, 16, 6, 1, false, 0, Math.PI)), mat("barn-r", "#8c939c"));
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 6;
      group.add(roof);
      object = group;
      break;
    }
    case "silo":
      object = new THREE.Mesh(geo("silo", () => new THREE.CylinderGeometry(2.6, 2.6, 14, 10)), mat("silo", "#d7dce2"));
      object.position.y = 7;
      break;
    case "watertower": {
      const group = new THREE.Group();
      const legs = new THREE.Mesh(geo("wt-l", () => new THREE.CylinderGeometry(0.4, 0.7, 14, 6)), mat("wt-l", "#8a939c"));
      legs.position.y = 7;
      group.add(legs);
      const tank = new THREE.Mesh(geo("wt-t", () => new THREE.CylinderGeometry(3.4, 3.4, 4.4, 10)), mat("wt-t", "#8fc0e6"));
      tank.position.y = 15.5;
      group.add(tank);
      object = group;
      break;
    }
    case "fuel": {
      const group = new THREE.Group();
      const canopy = new THREE.Mesh(geo("fuel-c", () => new THREE.BoxGeometry(14, 0.8, 9)), mat("fuel-c", "#f05a3c"));
      canopy.position.y = 6.2;
      group.add(canopy);
      for (const sx of [-6, 6]) {
        const post = new THREE.Mesh(geo("fuel-p", () => new THREE.BoxGeometry(0.6, 6, 0.6)), mat("fuel-p", "#e5e7eb"));
        post.position.set(sx, 3, 0);
        group.add(post);
      }
      object = group;
      break;
    }
    case "tree": {
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(geo("tree-t", () => new THREE.CylinderGeometry(0.4, 0.6, 4.5, 6)), mat("tree-t", "#7d5433"));
      trunk.position.y = 2.2;
      group.add(trunk);
      const crown = new THREE.Mesh(geo("tree-c", () => new THREE.ConeGeometry(2.6, 6.5, 7)), mat("tree-c", "#3f9a48"));
      crown.position.y = 6.6;
      group.add(crown);
      object = group;
      break;
    }
    case "bush":
      object = new THREE.Mesh(geo("bush", () => new THREE.SphereGeometry(1.5, 6, 5)), mat("bush", "#55b04f"));
      object.position.y = 1.1;
      break;
    case "pole": {
      const group = new THREE.Group();
      const post = new THREE.Mesh(geo("pole-p", () => new THREE.CylinderGeometry(0.22, 0.28, 11, 6)), mat("pole-p", "#8a7a63"));
      post.position.y = 5.5;
      group.add(post);
      const arm = new THREE.Mesh(geo("pole-a", () => new THREE.BoxGeometry(4.2, 0.22, 0.22)), mat("pole-p", "#8a7a63"));
      arm.position.y = 10.2;
      group.add(arm);
      object = group;
      break;
    }
    case "fence":
    default:
      object = new THREE.Mesh(geo("fence", () => new THREE.BoxGeometry(9, 1.3, 0.22)), mat("fence", "#caa97a"));
      object.position.y = 0.8;
      break;
  }

  const wrapper = new THREE.Group();
  wrapper.add(object);
  wrapper.position.set(prop.x, y, prop.z);
  wrapper.rotation.y = prop.rotation;
  wrapper.scale.setScalar(prop.scale);
  return wrapper;
}

/* ============================ weather ============================ */

/** Rain: a falling point cloud kept around the camera and recycled at the top. */
export function buildRain(quality: GraphicsQuality): THREE.Points {
  const count = QUALITY_PROFILES[quality].rainParticles;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 220;
    positions[i * 3 + 1] = Math.random() * 90;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 220;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({ color: "#9fc8e8", size: 0.5, transparent: true, opacity: 0.6, sizeAttenuation: true }),
  );
}

export function animateRain(rain: THREE.Points, dt: number, cameraX: number, cameraZ: number, intensity: number): void {
  const attr = rain.geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const fall = 55 + intensity * 60;
  for (let i = 0; i < arr.length / 3; i++) {
    arr[i * 3 + 1] = arr[i * 3 + 1]! - fall * dt;
    if (arr[i * 3 + 1]! < 0) {
      arr[i * 3 + 1] = 90;
      arr[i * 3] = (Math.random() - 0.5) * 220;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 220;
    }
  }
  attr.needsUpdate = true;
  rain.position.set(cameraX, 0, cameraZ);
}

/**
 * Sky palette for a weather state. Friendly storm-chaser mood: a warm, hazy
 * horizon under a deep blue zenith on calm levels, sliding towards a bruised
 * slate-teal as the storms get stronger — dramatic, never gloomy.
 */
export type SkyPalette = {
  horizon: THREE.Color;
  zenith: THREE.Color;
  ground: THREE.Color;
  sun: THREE.Color;
  /** 0..1 amount of painted cloud streaks. */
  clouds: number;
};

export function skyPaletteFor(intensity: number): SkyPalette {
  const t = Math.max(0, Math.min(1, intensity / 10));
  const horizon = new THREE.Color("#f6dcb4").lerp(new THREE.Color("#9fb0b4"), Math.pow(t, 0.8));
  const zenith = new THREE.Color("#3a86d8").lerp(new THREE.Color("#2c3f5c"), t);
  return {
    horizon,
    zenith,
    ground: horizon.clone().multiplyScalar(0.72),
    sun: new THREE.Color("#ffd89a").lerp(new THREE.Color("#f3e6c8"), t),
    clouds: 0.45 + t * 0.4,
  };
}

/** Sky colour for a weather state — drives both the clear colour and the fog. */
export function skyColorFor(intensity: number): THREE.Color {
  return skyPaletteFor(intensity).horizon;
}

/** Direction TOWARDS the sun: low and warm, so hills get long, soft shading. */
export const SUN_DIRECTION = new THREE.Vector3(0.72, 0.36, 0.5).normalize();

/* ======================= G-9: látható vihar ======================= */

/**
 * Szuperfelhő (mezociklon) a tölcsér fölött.
 *
 * Élesben mérve (2026-09-07, Pixel 7, 1. pálya): a HUD azt írta ki, hogy „Menj
 * közelebb a tornádóhoz!", a tornádó viszont 3,56 km-re volt — az 926
 * világegység, a köd pedig a legjobb profilon is 900-nál elvág. A gyerek olyan
 * célt kapott, amit nem látott, és a képernyőn csak üres mező volt.
 *
 * A valóságban a szuperfelhő kilométerekről látszik, jóval a látótávolság
 * fölött. Ezért ez a felhő KÖD NÉLKÜL rajzolódik (`fog: false`), magasan ül, és
 * elég széles ahhoz, hogy messziről is irányt mutasson. Ez nem díszítés: ez a
 * navigáció.
 */
export type StormCloud = {
  group: THREE.Group;
  /** A korongok külön sebességgel forognak — így nem merev tárcsa. */
  discs: THREE.Mesh[];
};

export function buildStormCloud(quality: GraphicsQuality): StormCloud {
  const group = new THREE.Group();
  const discs: THREE.Mesh[] = [];
  const layers = quality === "low" ? 3 : quality === "medium" ? 5 : 7;

  for (let i = 0; i < layers; i++) {
    const t = i / Math.max(1, layers - 1);
    // Alul szélesebb, fölfelé keskenyedő üllő-alak, mint a valódi szuperfelhőnél.
    const radius = 150 - t * 55;
    // Lágy, sávos pára a lapos „tányérok” helyett: a korong alja és teteje
    // elhalványul, így a rétegek egymásba olvadnak.
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // A lényeg: a köd nem nyelheti el, különben ugyanúgy eltűnne, mint a tölcsér.
      fog: false,
      side: THREE.DoubleSide,
      uniforms: {
        color: { value: new THREE.Color().setHSL(0.62, 0.14, 0.3 + t * 0.16) },
        opacity: { value: 0.62 - t * 0.12 },
        seed: { value: i * 1.7 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormalV = normalize(normalMatrix * normal);
          vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        uniform float seed;
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          float band = smoothstep(0.0, 0.45, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
          float lumps = 0.65 + 0.35 * sin(vUv.x * 6.2831853 * 7.0 + seed + sin(vUv.x * 6.2831853 * 3.0 + seed) * 1.5);
          float edge = 1.0 - abs(dot(normalize(vNormalV), normalize(vViewPos)));
          float a = opacity * band * lumps * (0.5 + 0.6 * edge);
          vec3 col = color * (0.85 + 0.3 * vUv.y) * (0.9 + 0.2 * lumps);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.86, 26, quality === "low" ? 10 : 16, 1, true),
      material,
    );
    disc.position.y = 150 + i * 24;
    disc.userData.spin = 0.06 + (1 - t) * 0.05;
    group.add(disc);
    discs.push(disc);
  }

  // Puffy rim: big soft sprites around the discs turn the stack of plates
  // into a billowing cumulonimbus. Also fog-free, for the same reason.
  const puffs = quality === "low" ? 6 : quality === "medium" ? 10 : 14;
  for (let i = 0; i < puffs; i++) {
    const a = (i / puffs) * Math.PI * 2 + (i % 2) * 0.3;
    const ring = i % 3;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: softDot(),
        color: new THREE.Color("#66738a").lerp(new THREE.Color("#c3cad6"), ring / 2),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        fog: false,
      }),
    );
    // Kívül a korongok peremén, és az aljuk is jóval a tölcsér (92) fölött.
    const r = 150 - ring * 30;
    sprite.position.set(Math.cos(a) * r, 178 + ring * 30, Math.sin(a) * r);
    sprite.scale.setScalar(130 + ring * 16);
    group.add(sprite);
  }

  group.renderOrder = -1;
  return { group, discs };
}

/**
 * A szuperfelhő lassú forgása.
 *
 * A `motion` szorzó a mozgáscsökkentésé (`prefers-reduced-motion`): a felhő nem
 * áll meg teljesen — az élettelen kép rosszabb —, csak lelassul.
 */
export function animateStormCloud(cloud: StormCloud, dt: number, motion = 1): void {
  cloud.group.rotation.y += 0.05 * dt * motion;
  for (const disc of cloud.discs) {
    disc.rotation.y += (disc.userData.spin as number) * dt * motion;
  }
}

/**
 * Égbolt-kupola függőleges színátmenettel.
 *
 * A sík `setClearColor` egyetlen színt ad, amitől a horizont „papírkivágás"
 * hatású — ez látszott a mért képernyőképen is. A kupola belülről látszik
 * (`BackSide`), köd nélkül, mélységírás nélkül, hogy semmit ne takarjon ki.
 */
export type SkyDomeOptions = {
  /** Colour below the horizon (defaults to a darkened horizon). */
  ground?: THREE.Color;
  /** World direction towards the sun; omitted → no sun disc. */
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.Color;
  /** Painted cloud streak amount, 0 = none (the LOW profile skips the noise). */
  clouds?: number;
};

export function buildSkyDome(
  horizon: THREE.Color,
  zenith: THREE.Color,
  radius: number,
  opts: SkyDomeOptions = {},
): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 24, 12);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      horizonColor: { value: horizon },
      zenithColor: { value: zenith },
      groundColor: { value: opts.ground ?? horizon.clone().multiplyScalar(0.72) },
      sunDirection: { value: (opts.sunDirection ?? new THREE.Vector3(0, -1, 0)).clone().normalize() },
      sunColor: { value: opts.sunColor ?? new THREE.Color("#ffe2a8") },
      sunStrength: { value: opts.sunDirection ? 1 : 0 },
      cloudAmount: { value: opts.clouds ?? 0 },
      cloudTime: { value: 0 },
      /** 0..1 lightning flash. */
      flash: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        // A kupola a kamerát követi: az irányt a kupola saját középpontjából mérjük.
        vDir = position;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      uniform vec3 groundColor;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float sunStrength;
      uniform float cloudAmount;
      uniform float cloudTime;
      uniform float flash;
      varying vec3 vDir;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        // A horizont közelében lágy átmenet: a kemény vágás mesterségesnek látszik.
        float t = smoothstep(-0.03, 0.42, h);
        vec3 col = mix(horizonColor, zenithColor, pow(t, 0.65));
        col = mix(col, groundColor, smoothstep(0.0, -0.2, h));

        // Napkorong és fényudvar.
        float sd = 1.0 - max(0.0, dot(dir, sunDirection));
        float disc = 1.0 - smoothstep(0.0012, 0.0018, sd);
        float halo = exp(-sd * 90.0) * 0.55 + exp(-sd * 9.0) * 0.28;
        col += sunColor * (disc * 1.4 + halo) * sunStrength;

        // Festett felhőcsíkok (a LOW profilon cloudAmount = 0, a zaj el sem indul).
        if (cloudAmount > 0.0 && h > 0.0) {
          vec2 uv = dir.xz / (h + 0.18) * 1.6 + vec2(cloudTime * 0.012, cloudTime * 0.004);
          float n = noise(uv) * 0.55 + noise(uv * 2.3 + 7.1) * 0.3 + noise(uv * 5.1 - 3.7) * 0.15;
          float c = smoothstep(0.56, 0.8, n) * cloudAmount * smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.55, 0.95, h));
          vec3 cloudCol = mix(vec3(1.0, 0.97, 0.92), horizonColor * 0.82, 0.35) + sunColor * halo * 0.6;
          col = mix(col, cloudCol, c);
        }

        col = mix(col, vec3(0.9, 0.94, 1.0), flash * 0.7);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  return dome;
}

/** Per-frame sky update: lightning flash (0..1) and slow cloud drift. */
export function animateSkyDome(dome: THREE.Mesh, dt: number, flash: number, motion = 1): void {
  const material = dome.material as THREE.ShaderMaterial;
  const u = material.uniforms;
  if (!u?.flash || !u.cloudTime) return;
  u.flash.value = Math.max(0, Math.min(1, flash));
  u.cloudTime.value += dt * motion;
}

/**
 * Az égbolt-kupola sugara és a kamera vágósíkja egy párt alkot.
 *
 * Mérve (2026-09-07): a kamera `far` értéke `fogFar + 200` volt (közepes
 * profilon 820), a kupolát viszont `fogFar + 400`-ra tettem, a szuperfelhő
 * pedig a ~890 egységre lévő tornádó fölött ült. Mindkettő a vágósíkon KÍVÜL
 * esett, ezért a képernyőn semmi nem változott — a hiba nem az anyagokban volt,
 * hanem abban, hogy a kamera odáig el sem látott.
 *
 * Ezért a két érték egy helyen születik, és teszt őrzi a viszonyukat: a
 * vágósíknak a kupolán TÚL kell lennie, különben a kupola eltűnik.
 */
export function skyDomeRadiusFor(profile: QualityProfile): number {
  return profile.fogFar + 400;
}

/**
 * A kamera hátsó vágósíkja.
 *
 * A ködön jóval túl kell látnia: a szuperfelhő és az égbolt szándékosan a ködön
 * kívül él, mert épp az a dolguk, hogy messziről mutassák az irányt.
 */
export function cameraFarFor(profile: QualityProfile): number {
  return skyDomeRadiusFor(profile) + 1200;
}
