import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

import { disposeObjectTree } from "../client/src/game-engine/three-look/dispose";

function track(target: THREE.EventDispatcher<{ dispose: object }>): () => boolean {
  let disposed = false;
  target.addEventListener("dispose", () => {
    disposed = true;
  });
  return () => disposed;
}

describe("disposeObjectTree", () => {
  it("frees owned geometry, material and map but keeps a borrowed envMap", () => {
    const envMap = new THREE.Texture();
    const map = new THREE.Texture();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ map, envMap });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material));

    const envGone = track(envMap);
    const mapGone = track(map);
    const geoGone = track(geometry);
    const matGone = track(material);

    disposeObjectTree(root);

    assert.equal(geoGone(), true, "geometry freed");
    assert.equal(matGone(), true, "material freed");
    assert.equal(mapGone(), true, "owned map freed");
    assert.equal(envGone(), false, "shared environment map must survive a subtree rebuild");
  });

  it("frees a geometry shared by two meshes only once and leaves the sprite quad alone", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
    root.add(sprite);

    let geometryDisposals = 0;
    geometry.addEventListener("dispose", () => {
      geometryDisposals++;
    });
    const spriteQuadGone = track(sprite.geometry);

    disposeObjectTree(root);

    assert.equal(geometryDisposals, 1);
    assert.equal(spriteQuadGone(), false, "three.js shares one quad between all sprites");
  });
});
