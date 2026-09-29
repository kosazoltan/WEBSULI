import * as THREE from "three";

import { createGlowSprite, glowTexture } from "../three-look/sprites";
import type { LookTier } from "../three-look/tier";

/**
 * Deep-space backdrop for the asteroid game: a living nebula, glowing stars and
 * a ringed planet. Everything sits far behind the play plane (z < -8), writes no
 * depth and ignores fog, so it can never hide or tint gameplay objects.
 */

export type Nebula = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

/** Full-view fbm nebula; `octaves` scales the fragment cost with the tier. */
export function buildNebula(width: number, height: number, tier: LookTier): Nebula {
  const octaves = tier === "low" ? 3 : tier === "medium" ? 4 : 5;
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    fog: false,
    transparent: false,
    defines: { OCTAVES: octaves },
    uniforms: {
      time: { value: 0 },
      colorA: { value: new THREE.Color("#3a0f6e") },
      colorB: { value: new THREE.Color("#0b3f8a") },
      colorC: { value: new THREE.Color("#c2297a") },
      deep: { value: new THREE.Color("#02030f") },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 colorA;
      uniform vec3 colorB;
      uniform vec3 colorC;
      uniform vec3 deep;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < OCTAVES; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }
      void main() {
        vec2 p = vUv * vec2(3.0, 4.0);
        float t = time * 0.012;
        // Domain warping gives the wispy, folded gas look instead of blobs.
        vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
        float n = fbm(p + 2.2 * q + vec2(t * 0.6, -t));
        float m = fbm(p * 1.7 - q + vec2(-t, t * 0.4));
        vec3 col = deep;
        col = mix(col, colorB, smoothstep(0.35, 0.85, n) * 0.85);
        col = mix(col, colorA, smoothstep(0.45, 0.95, m) * 0.9);
        col += colorC * pow(smoothstep(0.55, 1.0, n * m * 1.9), 2.0) * 0.9;
        // Vignette keeps the play area's centre calm and readable.
        vec2 c = vUv - 0.5;
        col *= (1.0 - dot(c, c) * 1.1) * 0.85;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.renderOrder = -10;
  return mesh;
}

/** Stars as soft round glows, not square pixels. Two layers give parallax. */
export function buildStarLayer(
  count: number,
  spreadX: number,
  spreadY: number,
  zMin: number,
  zMax: number,
  size: number,
): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const palette = [new THREE.Color("#ffffff"), new THREE.Color("#bfe3ff"), new THREE.Color("#ffd6f5"), new THREE.Color("#fff1c2")];
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * spreadX;
    positions[i * 3 + 1] = (Math.random() - 0.5) * spreadY;
    positions[i * 3 + 2] = -(zMin + Math.random() * (zMax - zMin));
    const c = palette[Math.floor(Math.random() * palette.length)]!;
    const b = 0.55 + Math.random() * 0.75;
    colors[i * 3] = c.r * b;
    colors[i * 3 + 1] = c.g * b;
    colors[i * 3 + 2] = c.b * b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size,
    map: glowTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: false,
  });
  return new THREE.Points(geometry, material);
}

function bandedPlanetTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const bands = ["#ffb36b", "#f07d5c", "#ffd28f", "#d95f7a", "#ffc27a", "#b8527c", "#ffdca3"];
    let y = 0;
    let k = 0;
    while (y < h) {
      const bh = 6 + ((k * 37) % 14);
      ctx.fillStyle = bands[k % bands.length]!;
      ctx.fillRect(0, y, w, bh);
      y += bh;
      k++;
    }
    // Soft turbulence so the bands do not look ruled.
    for (let i = 0; i < 220; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
      const yy = Math.random() * h;
      ctx.fillRect(Math.random() * w, yy, 20 + Math.random() * 60, 1 + Math.random() * 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * A friendly gas giant with a ring and a Fresnel atmosphere rim.
 * Returned group spins its planet slowly via `userData.spin`.
 */
export function buildPlanet(radius: number): THREE.Group {
  const group = new THREE.Group();
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshStandardMaterial({ map: bandedPlanetTexture(), roughness: 0.95, metalness: 0, fog: false, envMapIntensity: 0 }),
  );
  planet.rotation.z = 0.35;
  group.add(planet);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.08, 48, 32),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      fog: false,
      uniforms: { glowColor: { value: new THREE.Color("#ff9ad5") } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(1.0 - abs(dot(vNormal, vView)), 3.0);
          gl_FragColor = vec4(glowColor * rim * 1.4, rim);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  group.add(atmosphere);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.35, radius * 2.05, 96, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: { inner: { value: radius * 1.35 }, outer: { value: radius * 2.05 } },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float inner;
        uniform float outer;
        varying vec3 vPos;
        void main() {
          float r = (length(vPos.xy) - inner) / (outer - inner);
          float bands = 0.55 + 0.45 * sin(r * 42.0) * sin(r * 13.0 + 1.3);
          float edge = smoothstep(0.0, 0.08, r) * (1.0 - smoothstep(0.85, 1.0, r));
          vec3 col = mix(vec3(1.0, 0.86, 0.62), vec3(0.95, 0.55, 0.75), r);
          gl_FragColor = vec4(col, edge * bands * 0.75);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  ring.rotation.x = -1.15;
  ring.rotation.y = 0.35;
  group.add(ring);

  const halo = createGlowSprite("#ff7ac8", radius * 5, 0.1);
  group.add(halo);

  group.userData.spin = planet;
  group.traverse((o) => {
    o.renderOrder = -5;
  });
  return group;
}
