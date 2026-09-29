import * as THREE from "three";

export type GradientSkyOptions = {
  top: THREE.ColorRepresentation;
  horizon: THREE.ColorRepresentation;
  /** Below-horizon colour; defaults to a darkened horizon. */
  bottom?: THREE.ColorRepresentation;
  /** World-space direction TOWARDS the sun; omit for no sun disc. */
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.ColorRepresentation;
  /** Angular size of the disc; ~0.03 is a small sun, 0.08 a big cartoon one. */
  sunSize?: number;
  radius?: number;
};

/**
 * Three-stop gradient dome with an optional sun disc and halo.
 *
 * Seen from inside (`BackSide`), outside the fog and without depth writes, so
 * it never hides geometry. Colours are uniforms: a game can recolour the sky
 * (day → dusk, a lightning flash) without rebuilding anything.
 */
export function createGradientSky(opts: GradientSkyOptions): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
  const horizon = new THREE.Color(opts.horizon);
  const bottom = opts.bottom !== undefined ? new THREE.Color(opts.bottom) : horizon.clone().multiplyScalar(0.55);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(opts.top) },
      horizonColor: { value: horizon },
      bottomColor: { value: bottom },
      sunDirection: { value: (opts.sunDirection ?? new THREE.Vector3(0, -1, 0)).clone().normalize() },
      sunColor: { value: new THREE.Color(opts.sunColor ?? "#fff3c4") },
      sunSize: { value: opts.sunDirection ? (opts.sunSize ?? 0.04) : 0 },
      flash: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float sunSize;
      uniform float flash;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 col = h > 0.0
          ? mix(horizonColor, topColor, pow(smoothstep(0.0, 0.85, h), 0.7))
          : mix(horizonColor, bottomColor, smoothstep(0.0, 0.35, -h));
        if (sunSize > 0.0) {
          float d = 1.0 - dot(dir, sunDirection);
          float disc = 1.0 - smoothstep(sunSize * 0.08, sunSize * 0.1, d);
          float halo = exp(-d / (sunSize * 0.9)) * 0.55 + exp(-d / (sunSize * 6.0)) * 0.25;
          col += sunColor * (disc * 1.6 + halo);
        }
        col = mix(col, vec3(0.92, 0.95, 1.0), flash);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(opts.radius ?? 400, 32, 16), material);
  dome.renderOrder = -2;
  dome.frustumCulled = false;
  return dome;
}
