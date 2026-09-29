import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOOK_BUDGET,
  detectLookTierFrom,
  isLookTier,
  type TierEnv,
} from "../client/src/game-engine/three-look/tier";

const strongPc: TierEnv = {
  override: null,
  rendererName: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
  cores: 16,
  memoryGb: 16,
  coarsePointer: false,
};

describe("detectLookTierFrom", () => {
  it("gives a strong desktop the high tier", () => {
    assert.equal(detectLookTierFrom(strongPc), "high");
  });

  it("treats every software rasteriser as low, whatever the CPU", () => {
    for (const rendererName of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "Microsoft Basic Render Driver",
      "software (no webgl)",
    ]) {
      assert.equal(detectLookTierFrom({ ...strongPc, rendererName }), "low", rendererName);
    }
  });

  it("drops to low on four cores or two gigabytes", () => {
    assert.equal(detectLookTierFrom({ ...strongPc, cores: 4 }), "low");
    assert.equal(detectLookTierFrom({ ...strongPc, memoryGb: 2 }), "low");
  });

  it("uses medium for touch devices and 4 GB machines", () => {
    assert.equal(detectLookTierFrom({ ...strongPc, coarsePointer: true }), "medium");
    assert.equal(detectLookTierFrom({ ...strongPc, memoryGb: 4 }), "medium");
  });

  it("does not punish browsers that hide deviceMemory or core count", () => {
    assert.equal(detectLookTierFrom({ ...strongPc, memoryGb: null }), "high");
    assert.equal(detectLookTierFrom({ ...strongPc, cores: 0 }), "high");
  });

  it("honours a valid ?look= override and ignores an invalid one", () => {
    assert.equal(detectLookTierFrom({ ...strongPc, override: "low" }), "low");
    assert.equal(
      detectLookTierFrom({ ...strongPc, rendererName: "SwiftShader", override: "high" }),
      "high",
    );
    assert.equal(detectLookTierFrom({ ...strongPc, override: "ultra" }), "high");
    assert.equal(isLookTier("ultra"), false);
  });
});

describe("LOOK_BUDGET", () => {
  it("keeps the low tier free of every expensive feature", () => {
    const low = LOOK_BUDGET.low;
    assert.equal(low.bloom, false);
    assert.equal(low.shadows, false);
    assert.equal(low.environment, false);
    assert.equal(low.maxPixelRatio, 1);
  });

  it("reserves bloom for the high tier", () => {
    assert.equal(LOOK_BUDGET.medium.bloom, false);
    assert.equal(LOOK_BUDGET.high.bloom, true);
  });

  it("grows resolution, shadow map and particles monotonically with the tier", () => {
    const [low, medium, high] = [LOOK_BUDGET.low, LOOK_BUDGET.medium, LOOK_BUDGET.high];
    assert.ok(low.maxPixelRatio < medium.maxPixelRatio && medium.maxPixelRatio < high.maxPixelRatio);
    assert.ok(low.shadowMapSize < medium.shadowMapSize && medium.shadowMapSize < high.shadowMapSize);
    assert.ok(low.particleScale < medium.particleScale && medium.particleScale <= high.particleScale);
  });
});
