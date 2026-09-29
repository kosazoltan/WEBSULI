import * as THREE from "three";

import { isSharedLookTexture } from "./sprites";

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture && !isSharedLookTexture(value)) value.dispose();
  }
  if (material instanceof THREE.ShaderMaterial) {
    for (const uniform of Object.values(material.uniforms)) {
      const v = (uniform as { value?: unknown }).value;
      if (v instanceof THREE.Texture && !isSharedLookTexture(v)) v.dispose();
    }
  }
  material.dispose();
}

/**
 * Free every geometry, material and texture under `root` (each once).
 * The shared glow texture is skipped: it outlives any single scene.
 */
export function disposeObjectTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const withGeometry = obj as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
    // Sprites share one module-level quad in three.js; it is not ours to free.
    if (withGeometry.geometry instanceof THREE.BufferGeometry && !(obj instanceof THREE.Sprite)) {
      geometries.add(withGeometry.geometry);
    }
    const m = withGeometry.material;
    if (Array.isArray(m)) m.forEach((x) => materials.add(x));
    else if (m instanceof THREE.Material) materials.add(m);
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach(disposeMaterial);
}
