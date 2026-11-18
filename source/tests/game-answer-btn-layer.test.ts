import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * S13 / B7 (végrehajtás K.7.3): a közös `.game-answer-btn` alapméretet ad (min. 56 px, `--game-answer-font`), de a
 * játék Tailwind segédosztálya (pl. `text-[clamp(…)]`) felülírhatja. Tailwind 3-ban ez akkor teljesül, ha a szabály a
 * `@layer components` blokkban áll (a `@tailwind components` helyére kerül, a `utilities` elé); rétegen kívül a
 * forrásban később álló szabály nyerne az azonos fajlagosságú segédosztály ellen.
 */
const css = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "../client/src/index.css"), "utf8");

/** A `@layer components { … }` blokkok törzse (egyszerű kapcsos-zárójel számlálással). */
function componentLayerBodies(src: string): string[] {
  const out: string[] = [];
  const re = /@layer\s+components\s*\{/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    out.push(src.slice(start, i - 1));
  }
  return out;
}

test(".game-answer-btn a components rétegben van (a Tailwind text-* felülírhatja)", () => {
  const inLayer = componentLayerBodies(css).some((b) => /\.game-answer-btn\s*\{[^}]*font-size:\s*var\(--game-answer-font\)/.test(b));
  assert.ok(inLayer, "a .game-answer-btn font-size szabálya nincs @layer components blokkban");
});

test(".game-answer-btn nincs rétegen kívül is definiálva (különben az felülírná a segédosztályt)", () => {
  const outside = componentLayerBodies(css).reduce((s, b) => s.replace(b, ""), css);
  assert.doesNotMatch(outside, /\.game-answer-btn\s*\{/);
});

test(".game-answer-btn megtartja a K.7.3 alapértékeit (min. 56 px, --game-answer-font)", () => {
  const body = componentLayerBodies(css).find((b) => b.includes(".game-answer-btn")) ?? "";
  assert.match(body, /min-height:\s*56px/);
  assert.match(body, /font-size:\s*var\(--game-answer-font\)/);
});
