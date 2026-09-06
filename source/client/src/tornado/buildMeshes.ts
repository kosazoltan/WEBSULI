/**
 * Tornado Hunter 200 — procedural Three.js meshes.
 *
 * The brief asks for a deliberately simple, non-photorealistic look that runs on
 * weak machines and phones. Everything here is therefore box/cylinder/cone
 * primitives with flat shading and NO textures, NO shadow maps and NO imported
 * models: the whole game's visual budget is a few hundred triangles per object.
 *
 * Geometries and materials are cached per key and REUSED across every instance —
 * a forest of 400 trees shares three geometries, which is the difference between
 * a smooth phone frame rate and a slideshow.
 */

import * as THREE from "three";

import type { Vehicle } from "@/lib/tornado/vehicles";
import type { GraphicsQuality } from "@/lib/tornado/progress";
import { terrainHeight, isWater, roadFactor, CHUNK_SIZE, type WorldProp } from "@/lib/tornado/world";
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
  low: { funnelParticles: 140, viewRadius: 260, fogFar: 420, rainParticles: 240, debrisParticles: 40, maxPixelRatio: 1, terrainSegments: 4 },
  medium: { funnelParticles: 280, viewRadius: 380, fogFar: 620, rainParticles: 620, debrisParticles: 90, maxPixelRatio: 1.5, terrainSegments: 6 },
  high: { funnelParticles: 520, viewRadius: 520, fogFar: 900, rainParticles: 1200, debrisParticles: 170, maxPixelRatio: 2, terrainSegments: 8 },
};

/* ============================ shared caches ============================ */

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
  const bodyMat = new THREE.MeshLambertMaterial({ color: vehicle.colors.body, flatShading: true });
  const accentMat = new THREE.MeshLambertMaterial({ color: vehicle.colors.accent, flatShading: true });
  const glassMat = new THREE.MeshLambertMaterial({
    color: vehicle.colors.glass,
    flatShading: true,
    transparent: true,
    opacity: 0.75,
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
  group.userData.disposables = [chassis.geometry, cab.geometry, bodyMat, accentMat, glassMat];

  return group;
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
  /** Stacked rings that make the funnel; animated by rotating each ring. */
  rings: THREE.Mesh[];
  debris: THREE.Points;
  debrisVelocities: Float32Array;
};

/**
 * The funnel: a stack of open cones, widest at the top, plus an orbiting debris
 * cloud. Cheap, and it reads instantly as a tornado from any distance — which
 * matters more here than physical accuracy.
 */
export function buildTornado(quality: GraphicsQuality): TornadoMesh {
  const profile = QUALITY_PROFILES[quality];
  const group = new THREE.Group();
  const rings: THREE.Mesh[] = [];
  const ringCount = quality === "low" ? 7 : quality === "medium" ? 11 : 15;

  for (let i = 0; i < ringCount; i++) {
    const t = i / (ringCount - 1);
    const radius = 2.2 + Math.pow(t, 1.6) * 16;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color().setHSL(0.62 - t * 0.08, 0.06, 0.34 + t * 0.24),
      transparent: true,
      opacity: 0.42 - t * 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
      flatShading: true,
    });
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.82, 9, 12, 1, true), material);
    ring.position.y = 4 + i * 8;
    ring.userData.spin = 2.6 - t * 1.4;
    group.add(ring);
    rings.push(ring);
  }

  // Debris orbiting the core.
  const count = profile.funnelParticles;
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const h = Math.random() * 90;
    const r = 3 + (h / 90) * 16 + Math.random() * 4;
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = h;
    positions[i * 3 + 2] = Math.sin(angle) * r;
    velocities[i * 3] = angle;
    velocities[i * 3 + 1] = 6 + Math.random() * 22;
    velocities[i * 3 + 2] = r;
  }
  const debrisGeo = new THREE.BufferGeometry();
  debrisGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const debris = new THREE.Points(
    debrisGeo,
    new THREE.PointsMaterial({ color: "#8b7355", size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0.85 }),
  );
  group.add(debris);

  return { group, rings, debris, debrisVelocities: velocities };
}

/** Spin the funnel one frame. */
export function animateTornado(mesh: TornadoMesh, dt: number, intensity: number): void {
  const speed = 0.6 + intensity * 0.16;
  for (const ring of mesh.rings) {
    ring.rotation.y += (ring.userData.spin as number) * dt * speed;
  }
  const attr = mesh.debris.geometry.getAttribute("position") as THREE.BufferAttribute;
  const arr = attr.array as Float32Array;
  const vel = mesh.debrisVelocities;
  for (let i = 0; i < arr.length / 3; i++) {
    vel[i * 3] = (vel[i * 3]! + dt * (1.4 + intensity * 0.2)) % (Math.PI * 2);
    let y = arr[i * 3 + 1]! + vel[i * 3 + 1]! * dt;
    if (y > 92) y = 0;
    const r = vel[i * 3 + 2]! * (0.5 + (y / 92) * 0.9);
    arr[i * 3] = Math.cos(vel[i * 3]!) * r;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = Math.sin(vel[i * 3]!) * r;
  }
  attr.needsUpdate = true;
}

/* ============================ terrain & props ============================ */

const SURFACE_COLORS = {
  grass: "#4a7c40",
  dirt: "#8a6b46",
  mud: "#5d4a33",
  asphalt: "#3a3a40",
  water: "#2b5b8a",
};

/**
 * One terrain chunk: a subdivided plane displaced by `terrainHeight`, coloured
 * per vertex so roads, mud and water need no textures and no extra draw calls.
 */
export function buildTerrainChunk(cx: number, cz: number, quality: GraphicsQuality): THREE.Mesh {
  const seg = QUALITY_PROFILES[quality].terrainSegments;
  const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, seg, seg);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const baseX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
  const baseZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const wx = baseX + pos.getX(i);
    const wz = baseZ + pos.getZ(i);
    pos.setY(i, terrainHeight(wx, wz));

    const road = roadFactor(wx, wz);
    if (isWater(wx, wz)) color.set(SURFACE_COLORS.water);
    else if (road > 0.55) color.set(SURFACE_COLORS.asphalt);
    else if (road > 0.15) color.set(SURFACE_COLORS.dirt);
    else color.set(SURFACE_COLORS.grass);
    // Slight per-vertex variation so large fields do not look like flat paint.
    const jitter = 0.92 + ((Math.sin(wx * 0.13) + Math.cos(wz * 0.11)) * 0.5 + 0.5) * 0.16;
    colors[i * 3] = color.r * jitter;
    colors[i * 3 + 1] = color.g * jitter;
    colors[i * 3 + 2] = color.b * jitter;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, mat("terrain", "#ffffff", { vertexColors: true }));
  mesh.position.set(baseX, 0, baseZ);
  return mesh;
}

/** One prop. Geometry and material are shared per kind. */
export function buildProp(prop: WorldProp): THREE.Object3D {
  const y = terrainHeight(prop.x, prop.z);
  let object: THREE.Object3D;

  switch (prop.kind) {
    case "house": {
      const group = new THREE.Group();
      const walls = new THREE.Mesh(geo("house-w", () => new THREE.BoxGeometry(7, 4.4, 8)), mat("house-w", "#c8bda8"));
      walls.position.y = 2.2;
      group.add(walls);
      const roof = new THREE.Mesh(geo("house-r", () => new THREE.ConeGeometry(6.2, 3.2, 4)), mat("house-r", "#8b3a2f"));
      roof.position.y = 6.0;
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      object = group;
      break;
    }
    case "barn": {
      const group = new THREE.Group();
      const body = new THREE.Mesh(geo("barn-b", () => new THREE.BoxGeometry(11, 6, 16)), mat("barn-b", "#a33f34"));
      body.position.y = 3;
      group.add(body);
      const roof = new THREE.Mesh(geo("barn-r", () => new THREE.CylinderGeometry(6.3, 6.3, 16, 6, 1, false, 0, Math.PI)), mat("barn-r", "#6b6b70"));
      roof.rotation.z = Math.PI / 2;
      roof.rotation.y = Math.PI / 2;
      roof.position.y = 6;
      group.add(roof);
      object = group;
      break;
    }
    case "silo":
      object = new THREE.Mesh(geo("silo", () => new THREE.CylinderGeometry(2.6, 2.6, 14, 10)), mat("silo", "#b6b9bd"));
      object.position.y = 7;
      break;
    case "watertower": {
      const group = new THREE.Group();
      const legs = new THREE.Mesh(geo("wt-l", () => new THREE.CylinderGeometry(0.4, 0.7, 14, 6)), mat("wt-l", "#7a8087"));
      legs.position.y = 7;
      group.add(legs);
      const tank = new THREE.Mesh(geo("wt-t", () => new THREE.CylinderGeometry(3.4, 3.4, 4.4, 10)), mat("wt-t", "#93a3b1"));
      tank.position.y = 15.5;
      group.add(tank);
      object = group;
      break;
    }
    case "fuel": {
      const group = new THREE.Group();
      const canopy = new THREE.Mesh(geo("fuel-c", () => new THREE.BoxGeometry(14, 0.8, 9)), mat("fuel-c", "#d94f3d"));
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
      const trunk = new THREE.Mesh(geo("tree-t", () => new THREE.CylinderGeometry(0.4, 0.6, 4.5, 6)), mat("tree-t", "#6b4a2f"));
      trunk.position.y = 2.2;
      group.add(trunk);
      const crown = new THREE.Mesh(geo("tree-c", () => new THREE.ConeGeometry(2.6, 6.5, 7)), mat("tree-c", "#2f6b3a"));
      crown.position.y = 6.6;
      group.add(crown);
      object = group;
      break;
    }
    case "bush":
      object = new THREE.Mesh(geo("bush", () => new THREE.SphereGeometry(1.5, 6, 5)), mat("bush", "#3d7a45"));
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
      object = new THREE.Mesh(geo("fence", () => new THREE.BoxGeometry(9, 1.3, 0.22)), mat("fence", "#9c8b6f"));
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

/** Sky colour for a weather state — drives both the clear colour and the fog. */
export function skyColorFor(intensity: number): THREE.Color {
  const t = Math.max(0, Math.min(1, intensity / 10));
  return new THREE.Color().setHSL(0.58 - t * 0.06, 0.35 - t * 0.2, 0.72 - t * 0.5);
}
