import * as THREE from "three";

import { createGlowSprite, glowTexture } from "../three-look/sprites";
import type { LookTier } from "../three-look/tier";

/**
 * Deep-space backdrop for the asteroid game: a living nebula, glowing stars and
 * a ringed planet. Everything sits far behind the play plane (z < -8), writes no
 * depth and ignores fog, so it can never hide or tint gameplay objects.
 */

export type Nebula = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

const NOISE_SIZE = 256;
let noiseTexture: THREE.DataTexture | null = null;

/**
 * A smooth, tileable value-noise texture (R, G: two independent smooth fields; B: white noise for dithering).
 *
 * Tulajdonosi jelzés 2026-09-29 („a háttér szögletes felosztása”): the previous shader hashed with
 * `fract(sin(dot(p, …)) * 43758.5453)`, which needs full float precision — on phone GPUs (mediump) it
 * breaks into visible square cells and banding. Sampling a precomputed texture is exact on every GPU.
 */
function nebulaNoiseTexture(): THREE.DataTexture {
  if (noiseTexture) return noiseTexture;
  let seed = 0x5eed1234;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const lattice = (cells: number) => Array.from({ length: cells * cells }, rand);
  const smooth = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  // Periodic value noise: summing octaves whose lattice divides the texture keeps the texture seamless.
  const field = (octaves: Array<[number, number]>) => {
    const lats = octaves.map(([cells]) => lattice(cells));
    const out = new Float32Array(NOISE_SIZE * NOISE_SIZE);
    let min = Infinity, max = -Infinity;
    for (let y = 0; y < NOISE_SIZE; y++) for (let x = 0; x < NOISE_SIZE; x++) {
      let v = 0;
      octaves.forEach(([cells, amp], o) => {
        const fx = (x / NOISE_SIZE) * cells, fy = (y / NOISE_SIZE) * cells;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = smooth(fx - x0), ty = smooth(fy - y0);
        const at = (i: number, j: number) => lats[o][((j % cells) * cells) + (i % cells)];
        const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
        v += amp * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty);
      });
      out[y * NOISE_SIZE + x] = v;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / (max - min);
    return out;
  };
  const r = field([[8, 1], [16, 0.5], [32, 0.25]]);
  const g = field([[8, 1], [16, 0.5], [32, 0.25]]);
  const data = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
  for (let i = 0; i < NOISE_SIZE * NOISE_SIZE; i++) {
    data[i * 4] = Math.round(r[i] * 255);
    data[i * 4 + 1] = Math.round(g[i] * 255);
    data[i * 4 + 2] = Math.floor(rand() * 256);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, NOISE_SIZE, NOISE_SIZE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  tex.userData.sharedLookTexture = true;
  noiseTexture = tex;
  return tex;
}

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
      noiseTex: { value: nebulaNoiseTexture() },
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
      uniform sampler2D noiseTex;
      uniform vec3 colorA;
      uniform vec3 colorB;
      uniform vec3 colorC;
      uniform vec3 deep;
      varying vec2 vUv;

      // Texture lookups instead of a sine hash: exact on mediump phone GPUs (no square cells).
      float noiseR(vec2 p) { return texture2D(noiseTex, p).r; }
      float noiseG(vec2 p) { return texture2D(noiseTex, p).g; }
      // Each octave is rotated, so no two octaves share an axis — no visible grid in the sum.
      const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.55;
        for (int i = 0; i < OCTAVES; i++) {
          v += a * noiseR(p);
          p = ROT * p * 1.93 + vec2(0.137, 0.291);
          a *= 0.5;
        }
        return v;
      }
      void main() {
        // Large, calm clouds with plenty of dark space between them: the play field must stay readable.
        vec2 p = vUv * vec2(0.36, 0.48);
        float t = time * 0.003;
        vec2 q = vec2(noiseG(p * 0.8 + vec2(0.0, t)), noiseG(p * 0.8 + vec2(0.31, 0.57 - t)));
        float n = fbm(p + 0.22 * q + vec2(t * 0.6, -t));
        float m = fbm(ROT * p * 1.2 - 0.2 * q + vec2(-t, t * 0.4) + vec2(0.5, 0.2));
        vec3 col = deep;
        col = mix(col, colorB, smoothstep(0.46, 0.82, n) * 0.8);
        col = mix(col, colorA, smoothstep(0.5, 0.88, m) * 0.85);
        col += colorC * pow(smoothstep(0.5, 0.95, n * m * 1.8), 2.0) * 0.8;
        vec2 c = vUv - 0.5;
        col *= (1.0 - dot(c, c) * 1.1) * 0.85;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef TONE_MAPPING
        // Dither of ±1 step of the final 8-bit output (after tone mapping and sRGB — PR #133 review), only when
        // drawing straight to the screen; the bloom path renders into a half-float target without banding.
        gl_FragColor.rgb += (texture2D(noiseTex, gl_FragCoord.xy / 256.0).b - 0.5) / 255.0;
        #endif
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
