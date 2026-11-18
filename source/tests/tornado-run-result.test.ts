import assert from "node:assert/strict";
import test from "node:test";

import { defaultProgress, recordAnswer, updateSettings, type TornadoProgress } from "../client/src/lib/tornado/progress";
import { applyRunResult } from "../client/src/lib/tornado/runResult";

/**
 * Review #433 (Vercel): a helyes horgonyzási válasz után 2,6 s-mal (játékórán) érkező győzelem-mentés nem írhatja
 * vissza a közben — a szünet menüben — módosított beállításokat. A lap a mentést funkcionális frissítésként futtatja
 * (`setProgress((latest) => applyRunResult(latest, …))`); ez a teszt a forgatókönyvet a tiszta függvényen játssza le,
 * egy React-szerű állapot-sorral.
 */

function stateQueue(initial: TornadoProgress) {
  let state = initial;
  return {
    get: () => state,
    set: (update: (latest: TornadoProgress) => TornadoProgress) => {
      state = update(state);
    },
  };
}

const win = { level: 7, score: 900, coins: 120, secondsUsed: 80, peakWind: 140, anchored: true };

test("horgonyzás → szünetben grafika + balkezes váltás → késleltetett győzelem: a beállítások megmaradnak", () => {
  const store = stateQueue(updateSettings(defaultProgress(), { quality: "high", leftHanded: false }));
  // Helyes horgonyzási válasz: a válasz-statisztika azonnal ment.
  store.set((latest) => recordAnswer(latest, true));
  // A győzelem 2,6 s múlva jön; a korábbi (hibás) megoldás itt fagyasztotta be a pillanatképet.
  const staleSnapshot = store.get();
  // Szünet: a játékos LOW grafikára és balkezes módra vált.
  store.set((latest) => updateSettings(latest, { quality: "low", leftHanded: true }));
  // Késleltetett győzelem-mentés a mentés pillanatában érvényes haladáson.
  store.set((latest) => applyRunResult(latest, 2.5, win));

  const saved = store.get();
  assert.equal(saved.settings.quality, "low", "a szünetben választott grafika visszaíródott");
  assert.equal(saved.settings.leftHanded, true, "a szünetben választott balkezes mód visszaíródott");
  assert.equal(saved.stats.correctAnswers, 1, "a horgonyzási válasz statisztikája elveszett");
  assert.equal(saved.coins, staleSnapshot.coins + win.coins, "a Storm Coin jóváírás hiányzik");
  assert.ok(saved.levelRecords["7"], "a szint eredménye nem mentődött");
  assert.ok(saved.stats.kilometersTraveled >= 2.5);

  // Ellenpróba: a befagyasztott pillanatképből számolt mentés pontosan ezt a hibát okozná.
  const fromStale = applyRunResult(staleSnapshot, 2.5, win);
  assert.equal(fromStale.settings.quality, "high");
  assert.equal(fromStale.settings.leftHanded, false);
});

test("vereség: csak a távolság adódik hozzá, szint és Storm Coin nem", () => {
  const before = defaultProgress();
  const after = applyRunResult(before, 1.2, null);
  assert.equal(after.coins, before.coins);
  assert.deepEqual(after.levelRecords, before.levelRecords);
  assert.ok(after.stats.kilometersTraveled > before.stats.kilometersTraveled);
});
