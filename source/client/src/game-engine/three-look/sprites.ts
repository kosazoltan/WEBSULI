import * as THREE from "three";

let glow: THREE.CanvasTexture | null = null;

/**
 * Soft radial dot (white centre → transparent edge), shared by every glow
 * sprite and particle. Round, soft points are what make stars and sparks read
 * as light instead of as square pixels.
 *
 * Deliberately never disposed by scene teardown: it is tiny, shared by all
 * games, and re-uploading it on the next mount costs nothing.
 */
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.22, "rgba(255,255,255,0.85)");
    g.addColorStop(0.5, "rgba(255,255,255,0.28)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  glow.userData.sharedLookTexture = true;
  return glow;
}

export function isSharedLookTexture(texture: THREE.Texture | null | undefined): boolean {
  return Boolean(texture?.userData?.sharedLookTexture);
}

/** Additive halo — the cheap stand-in for bloom on low and medium tiers. */
export function createGlowSprite(
  color: THREE.ColorRepresentation,
  size: number,
  opacity = 0.85,
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(size);
  return sprite;
}
