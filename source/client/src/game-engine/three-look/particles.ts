import * as THREE from "three";

import { glowTexture } from "./sprites";

export type SparkleEmit = {
  count: number;
  color: THREE.ColorRepresentation;
  /** Initial speed in world units per second. */
  speed?: number;
  /** Seconds. */
  life?: number;
  /** Downward acceleration (world units / s²). */
  gravity?: number;
  /** World-space size of one spark. */
  size?: number;
  /** Bias velocities along this direction (normalised internally). */
  direction?: THREE.Vector3;
  /** 0 = pure burst, 1 = pure `direction`. */
  directionality?: number;
  /** Random spawn offset radius. */
  spread?: number;
};

/**
 * A fixed-capacity pool of glowing sparks drawn with ONE draw call.
 *
 * Every celebratory effect in the games (correct answer, explosion, mining dust,
 * engine exhaust) is the same thing: points that fly, fall and fade. Allocating a
 * geometry per burst (the old pattern) churns the GPU; a ring buffer with a
 * custom shader keeps it at a single buffer update per frame.
 */
export class SparkleField {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly capacity: number;
  private readonly position: Float32Array;
  private readonly velocity: Float32Array;
  private readonly color: Float32Array;
  private readonly alpha: Float32Array;
  private readonly size: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly gravity: Float32Array;
  private cursor = 0;
  private alive = 0;
  private readonly tmpColor = new THREE.Color();
  private readonly tmpDir = new THREE.Vector3();

  constructor(parent: THREE.Object3D, capacity: number, blending: THREE.Blending = THREE.AdditiveBlending) {
    this.capacity = Math.max(1, Math.floor(capacity));
    const n = this.capacity;
    this.position = new Float32Array(n * 3);
    this.velocity = new Float32Array(n * 3);
    this.color = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.gravity = new Float32Array(n);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("psize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending,
      uniforms: {
        map: { value: glowTexture() },
        pixelScale: { value: 300 },
      },
      vertexShader: /* glsl */ `
        attribute float alpha;
        attribute float psize;
        uniform float pixelScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = alpha > 0.0 ? psize * pixelScale / max(0.001, -mv.z) : 0.0;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor * tex.rgb, tex.a * vAlpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      vertexColors: true,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    parent.add(this.points);
  }

  /**
   * Point sprites are sized in pixels; call on resize with the drawing-buffer
   * height (device pixels) and the perspective camera's vertical FOV.
   */
  setViewportHeight(pixels: number, fovDeg = 50): void {
    const halfTan = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
    this.points.material.uniforms.pixelScale.value = (Math.max(1, pixels) * 0.5) / Math.max(0.01, halfTan);
  }

  emit(origin: THREE.Vector3, opts: SparkleEmit): void {
    const speed = opts.speed ?? 3;
    const life = opts.life ?? 0.9;
    const size = opts.size ?? 0.18;
    const spread = opts.spread ?? 0;
    const directionality = opts.directionality ?? 0;
    this.tmpColor.set(opts.color);
    if (opts.direction) this.tmpDir.copy(opts.direction).normalize();
    for (let k = 0; k < opts.count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      // Uniform random direction on the sphere.
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      let vx = r * Math.cos(phi);
      let vy = u;
      let vz = r * Math.sin(phi);
      if (opts.direction && directionality > 0) {
        vx = vx * (1 - directionality) + this.tmpDir.x * directionality;
        vy = vy * (1 - directionality) + this.tmpDir.y * directionality;
        vz = vz * (1 - directionality) + this.tmpDir.z * directionality;
      }
      const s = speed * (0.45 + Math.random() * 0.75);
      this.position[i * 3] = origin.x + (Math.random() - 0.5) * spread;
      this.position[i * 3 + 1] = origin.y + (Math.random() - 0.5) * spread;
      this.position[i * 3 + 2] = origin.z + (Math.random() - 0.5) * spread;
      this.velocity[i * 3] = vx * s;
      this.velocity[i * 3 + 1] = vy * s;
      this.velocity[i * 3 + 2] = vz * s;
      const tint = 0.85 + Math.random() * 0.3;
      this.color[i * 3] = this.tmpColor.r * tint;
      this.color[i * 3 + 1] = this.tmpColor.g * tint;
      this.color[i * 3 + 2] = this.tmpColor.b * tint;
      this.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      if (this.life[i] <= 0) this.alive++;
      this.life[i] = this.maxLife[i];
      this.size[i] = size * (0.6 + Math.random() * 0.8);
      this.gravity[i] = opts.gravity ?? 0;
      this.alpha[i] = 1;
    }
  }

  update(dt: number): void {
    if (this.alive === 0) return;
    const damping = Math.exp(-1.6 * dt);
    let alive = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.life[i] = 0;
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      this.velocity[i * 3 + 1] -= this.gravity[i] * dt;
      this.velocity[i * 3] *= damping;
      this.velocity[i * 3 + 1] *= damping;
      this.velocity[i * 3 + 2] *= damping;
      this.position[i * 3] += this.velocity[i * 3] * dt;
      this.position[i * 3 + 1] += this.velocity[i * 3 + 1] * dt;
      this.position[i * 3 + 2] += this.velocity[i * 3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      // Quick flash-in, long ease-out.
      this.alpha[i] = Math.min(1, t * 1.6) * Math.min(1, (1 - t) * 12 + 0.2);
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.psize.needsUpdate = true;
  }

  get activeCount(): number {
    return this.alive;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
