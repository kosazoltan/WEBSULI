import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * Soft studio reflections for MeshStandardMaterial. Without an environment map a
 * metallic or glossy toy looks like matte plastic; with it, spaceship hulls and
 * crystals catch highlights from every side at the cost of one prefiltered
 * cube texture generated once per scene.
 */
export function createRoomEnvironment(
  renderer: THREE.WebGLRenderer,
): { texture: THREE.Texture; dispose(): void } {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const target = pmrem.fromScene(room, 0.04);
  room.dispose();
  pmrem.dispose();
  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}
